// @ts-nocheck
/**
 * UAT: Procurement purchase-order routes + PO → vendor bill.
 *
 * 1) Service-level (always): create PO, mark SENT, convert to Purchase Invoice; assert line carry-over.
 * 2) HTTP (when server reachable): POST/GET purchase-orders, send (or DB fallback), convert-to-bill,
 *    POST /api/accounting/purchase-invoices/from-purchase-order.
 *
 * Run: npm run test:uat:procurement-po
 * Loads .env for PORT (default BASE_URL http://localhost:${PORT}).
 *
 * Credentials: UAT_EMAIL / UAT_PASSWORD or admin@nts.com / admin123
 */
import 'dotenv/config';
import axios, { AxiosError } from 'axios';
import { prisma } from '../src/utils/database';
import { ProcurementService } from '../src/services/ProcurementService';
import { PurchaseInvoiceService } from '../src/services/PurchaseInvoiceService';

const BASE_URL =
  process.env.BASE_URL || `http://localhost:${process.env.PORT || '3009'}`;
const EMAIL = process.env.UAT_EMAIL || 'admin@nts.com';
const PASSWORD = process.env.UAT_PASSWORD || 'admin123';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function resolveUserVendorCurrency() {
  const user =
    (await prisma.user.findFirst({ where: { email: EMAIL } })) ||
    (await prisma.user.findFirst({ where: { email: 'admin@nvccz.co.zw' } })) ||
    (await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } }));
  const vendor = await prisma.vendor.findFirst({
    where: { isActive: true, email: { contains: '@' } },
    orderBy: { createdAt: 'asc' },
  });
  const currency =
    (await prisma.currency.findFirst({
      where: { code: { in: ['ZIG', 'ZWL', 'USD'] }, isActive: true },
      orderBy: { code: 'asc' },
    })) || (await prisma.currency.findFirst({ where: { isActive: true } }));

  return { user, vendor, currency };
}

async function serviceUat() {
  console.log('\n========== Service-level: PO create → SENT → vendor bill ==========\n');
  const { user, vendor, currency } = await resolveUserVendorCurrency();
  assert(!!user && !!vendor && !!currency, 'Need user, vendor with email (contains @), and currency');

  const suffix = Date.now();
  const lineName = `UAT-PO-SVC-${suffix}`;

  const po = await ProcurementService.createPurchaseOrder({
    vendorId: vendor.id,
    currencyId: currency.id,
    createdById: user.id,
    priority: 'MEDIUM',
    items: [
      {
        itemName: lineName,
        description: 'Service UAT line',
        quantity: 2,
        unitPrice: 100,
        unit: 'ea',
      },
    ],
  });
  assert(po.items?.length === 1, 'PO has one line');
  assert(Number(po.items[0].quantity) === 2 && Number(po.items[0].unitPrice) === 100, 'PO qty/price');

  const fetched = await prisma.purchaseOrder.findUnique({
    where: { id: po.id },
    include: { items: true },
  });
  assert(fetched?.id === po.id && fetched.items.length === 1, 'Prisma fetch by id');

  await prisma.purchaseOrder.update({
    where: { id: po.id },
    data: { status: 'SENT', sentAt: new Date(), sentById: user.id },
  });

  const supRef = `UAT-SUP-SVC-${suffix}`;
  const bill = await PurchaseInvoiceService.createVendorBillFromPurchaseOrder({
    purchaseOrderId: po.id,
    supplierInvoiceNumber: supRef,
    createdById: user.id,
  });
  assert(bill.items.length === 1, 'Bill line count');
  assert(bill.items[0].itemName === lineName, 'Item name carried');
  assert(Number(bill.items[0].quantity) === 2 && Number(bill.items[0].unitPrice) === 100, 'Qty/price carried');
  assert(bill.vendorInvoiceReference === supRef, 'Supplier invoice ref');

  console.log('OK service:', po.poNumber, '→', bill.invoiceNumber, `(${supRef})\n`);
}

async function httpUat() {
  console.log('========== HTTP: /api/procurement/purchase-orders* + accounting from-purchase-order ==========');
  console.log('BASE_URL:', BASE_URL, '\n');

  let token: string;
  try {
    const login = await axios.post(
      `${BASE_URL}/api/auth/login`,
      { email: EMAIL, password: PASSWORD },
      { timeout: 10000, validateStatus: () => true }
    );
    if (login.status !== 200 || !login.data?.token) {
      console.log('HTTP skipped: login failed', login.status, login.data?.message || '');
      return;
    }
    token = login.data.token;
  } catch (e: any) {
    console.log('HTTP skipped: server not reachable —', e.message);
    return;
  }

  const api = axios.create({
    baseURL: BASE_URL,
    headers: { Authorization: `Bearer ${token}` },
    timeout: 120000,
    validateStatus: () => true,
  });

  const { user, vendor, currency } = await resolveUserVendorCurrency();
  if (!user || !vendor || !currency) {
    console.log('HTTP skipped: missing user/vendor/currency in DB');
    return;
  }

  const suffix = Date.now();
  const lineName = `UAT-PO-HTTP-${suffix}`;

  // POST /api/procurement/purchase-orders
  const createRes = await api.post('/api/procurement/purchase-orders', {
    vendorId: vendor.id,
    currencyId: currency.id,
    items: [{ itemName: lineName, quantity: 3, unitPrice: 50, unit: 'bx' }],
  });
  assert(createRes.status === 201 && createRes.data?.success, `POST create PO: ${createRes.status} ${JSON.stringify(createRes.data)}`);
  const poId = createRes.data.data.id;
  console.log('✓ POST /api/procurement/purchase-orders', createRes.status);

  // GET list
  const listRes = await api.get('/api/procurement/purchase-orders', { params: { limit: 20 } });
  assert(listRes.status === 200 && Array.isArray(listRes.data?.data), `GET list: ${listRes.status}`);
  assert(listRes.data.data.some((p: { id: string }) => p.id === poId), 'New PO appears in list');
  console.log('✓ GET /api/procurement/purchase-orders', listRes.status);

  // GET :id
  const oneRes = await api.get(`/api/procurement/purchase-orders/${poId}`);
  assert(oneRes.status === 200 && oneRes.data?.data?.id === poId, `GET :id: ${oneRes.status}`);
  console.log('✓ GET /api/procurement/purchase-orders/:id', oneRes.status);

  // POST send (email may fail without SMTP)
  const sendRes = await api.post(`/api/procurement/purchase-orders/${poId}/send`);
  if (sendRes.status !== 200 || !sendRes.data?.success) {
    console.log('  (send not OK —', sendRes.status, sendRes.data?.message || '', ') forcing SENT in DB');
    await prisma.purchaseOrder.update({
      where: { id: poId },
      data: { status: 'SENT', sentAt: new Date(), sentById: user.id },
    });
  } else {
    console.log('✓ POST /api/procurement/purchase-orders/:id/send', sendRes.status);
  }

  const supRef1 = `UAT-SUP-HTTP-${suffix}`;
  const convRes = await api.post(`/api/procurement/purchase-orders/${poId}/convert-to-bill`, {
    supplierInvoiceNumber: supRef1,
  });
  assert(
    convRes.status === 201 && convRes.data?.success && convRes.data?.data?.invoiceNumber,
    `convert-to-bill: ${convRes.status} ${JSON.stringify(convRes.data)}`
  );
  console.log('✓ POST .../convert-to-bill', convRes.status, convRes.data.data.invoiceNumber);

  // Second PO for accounting-only path
  const create2 = await api.post('/api/procurement/purchase-orders', {
    vendorId: vendor.id,
    currencyId: currency.id,
    items: [{ itemName: `UAT-PO-ACC-${suffix}`, quantity: 1, unitPrice: 75 }],
  });
  assert(create2.status === 201 && create2.data?.data?.id, 'second PO create');
  const po2 = create2.data.data.id;
  await prisma.purchaseOrder.update({
    where: { id: po2 },
    data: { status: 'SENT', sentAt: new Date(), sentById: user.id },
  });

  const accRes = await api.post('/api/accounting/purchase-invoices/from-purchase-order', {
    purchaseOrderId: po2,
    supplierInvoiceNumber: `UAT-ACC-PO-${suffix}`,
  });
  assert(
    accRes.status === 201 && accRes.data?.success,
    `from-purchase-order: ${accRes.status} ${JSON.stringify(accRes.data)}`
  );
  console.log('✓ POST /api/accounting/purchase-invoices/from-purchase-order', accRes.status, accRes.data.data.invoiceNumber);

  console.log('\nHTTP PO UAT passed.\n');
}

async function main() {
  await serviceUat();
  await httpUat();
}

main()
  .catch((e: unknown) => {
    if (axios.isAxiosError(e)) {
      const ax = e as AxiosError;
      console.error('Axios error:', ax.response?.status, ax.response?.data || ax.message);
    } else {
      console.error(e);
    }
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
