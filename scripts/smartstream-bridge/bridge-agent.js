// @ts-nocheck
/**
 * Proof-of-concept SmartStream bridge agent.
 *
 * This is the piece that would eventually run as a small background service
 * on a machine inside the client's own network (the same LAN as their
 * SmartStream install) — it never needs the client to open inbound firewall
 * access, because every connection it makes to our backend is outbound.
 * Today, with no access yet to the client's real SmartStream, it talks to
 * mock-smartstream.js instead (see that file's header). Swapping the mock
 * for the real thing later should only mean changing --dir (or, if the real
 * interface turns out to be DB-level rather than file-based, swapping the
 * two functions marked "SMARTSTREAM SIDE" below) — the Procurement-facing
 * half does not change.
 *
 * Two invoice sources:
 *   --source=fixture (default)  reads fixtures/sample-invoices.json, no
 *                                running backend required — use this to see
 *                                the whole loop work right now.
 *   --source=api                calls the real nvccz backend
 *                                (GET /accounting/purchase-invoices,
 *                                POST /accounting/purchase-invoices/:id/pay)
 *                                — requires SERVER_URL / BRIDGE_USER_EMAIL /
 *                                BRIDGE_USER_PASSWORD env vars for a user
 *                                with Accountant-level access.
 *
 * Run with:
 *   node bridge-agent.js --source=fixture
 *   SERVER_URL=http://localhost:3000 BRIDGE_USER_EMAIL=... BRIDGE_USER_PASSWORD=... \
 *     node bridge-agent.js --source=api
 */
const fs = require("fs");
const path = require("path");
const { toCsv, parseCsv } = require("./lib/csv");
const { request, login } = require("./lib/http-client");

const args = process.argv.slice(2);
function flag(name, fallback) {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
}
const SOURCE = flag("source", "fixture"); // fixture | api
const BASE_DIR = path.resolve(flag("dir", path.join(__dirname, "mock-data")));
const INBOUND = path.join(BASE_DIR, "inbound");
const OUTBOUND = path.join(BASE_DIR, "outbound");
const OUTBOUND_PAYMENTS = path.join(OUTBOUND, "payments");
const SENT_LOG = path.join(BASE_DIR, ".bridge-sent.json");
const SEEN_ACK_LOG = path.join(BASE_DIR, ".bridge-seen-acks.json");
const SEEN_PAYMENT_LOG = path.join(BASE_DIR, ".bridge-seen-payments.json");
const POLL_MS = 4000;

const SERVER_URL = process.env.SERVER_URL || "http://localhost:3000";
const BRIDGE_USER_EMAIL = process.env.BRIDGE_USER_EMAIL;
const BRIDGE_USER_PASSWORD = process.env.BRIDGE_USER_PASSWORD;

for (const dir of [BASE_DIR, INBOUND, OUTBOUND, OUTBOUND_PAYMENTS]) {
  fs.mkdirSync(dir, { recursive: true });
}

function loadJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    return {};
  }
}
function saveJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// ---------------------------------------------------------------------------
// PROCUREMENT SIDE — talks to the real nvccz backend (or the fixture stand-in
// for a running backend). This half is real: field names below are taken
// directly from prisma/schema.prisma's PurchaseInvoice/Vendor models and
// src/routes/purchaseInvoiceRoutes.ts, not invented.
// ---------------------------------------------------------------------------

let apiToken = null;
let cachedBankId = null;

async function getInvoicesReadyToExport() {
  if (SOURCE === "fixture") {
    return loadJson(path.join(__dirname, "fixtures", "sample-invoices.json")) || [];
  }
  if (!apiToken) apiToken = await login(SERVER_URL, BRIDGE_USER_EMAIL, BRIDGE_USER_PASSWORD);
  // status=SUBMITTED, paymentStatus=PENDING: approved bills not yet paid —
  // see PurchaseInvoiceController.getAllPurchaseInvoices for the filter set.
  const res = await request({
    baseUrl: SERVER_URL,
    path: "/api/accounting/purchase-invoices?status=SUBMITTED&paymentStatus=PENDING&limit=50",
    token: apiToken,
  });
  if (res.status !== 200) {
    throw new Error(`GET purchase-invoices failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return res.body?.data?.invoices || res.body?.data || [];
}

async function markInvoicePaidFromSmartStream(invoiceId, payment) {
  if (SOURCE === "fixture") {
    console.log(
      `[bridge-agent]   (fixture mode — would POST /accounting/purchase-invoices/${invoiceId}/pay with`,
      payment,
      ")"
    );
    return;
  }
  if (!apiToken) apiToken = await login(SERVER_URL, BRIDGE_USER_EMAIL, BRIDGE_USER_PASSWORD);
  if (!cachedBankId) {
    const banks = await request({
      baseUrl: SERVER_URL,
      path: "/api/accounting/purchase-invoices/banks",
      token: apiToken,
    });
    cachedBankId = banks.body?.data?.[0]?.id;
    if (!cachedBankId) throw new Error("No active bank account found to record the SmartStream payment against");
  }
  const res = await request({
    baseUrl: SERVER_URL,
    path: `/api/accounting/purchase-invoices/${invoiceId}/pay`,
    method: "POST",
    token: apiToken,
    body: {
      paymentMethod: "BANK",
      bankId: cachedBankId,
      paymentDate: payment.paymentDate,
      paymentReference: payment.paymentReference,
      notes: `Paid via SmartStream — voucher ${payment.voucherNumber}`,
    },
  });
  if (res.status >= 300) {
    throw new Error(`POST pay failed for ${invoiceId} (${res.status}): ${JSON.stringify(res.body)}`);
  }
  console.log(`[bridge-agent]   ✓ marked ${invoiceId} PAID in Procurement (ref ${payment.paymentReference})`);
}

function mapInvoiceToInterfaceRow(inv) {
  return {
    OurInvoiceNumber: inv.invoiceNumber,
    VendorInvoiceReference: inv.vendorInvoiceReference || "",
    VendorBPNumber: inv.vendor?.bpNumber || "",
    VendorName: inv.vendor?.name || "",
    VendorTaxNumber: inv.vendor?.taxNumber || "",
    InvoiceDate: inv.invoiceDate,
    DueDate: inv.dueDate || "",
    CurrencyCode: inv.currency?.code || inv.currencyCode || "USD",
    Subtotal: inv.subtotal,
    VatAmount: inv.vatAmount,
    TotalAmount: inv.totalAmount,
    Description: inv.description || "",
  };
}

// ---------------------------------------------------------------------------
// SMARTSTREAM SIDE — currently the mock's folders. Once we have real access,
// only these two functions (plus the poll loop's paths) should need to
// change — everything above stays the same regardless of what SmartStream
// turns out to actually be (file drop, DB write, or ION/middleware).
// ---------------------------------------------------------------------------

function writeInvoiceFileForSmartStream(rows) {
  const filename = `export_${Date.now()}.csv`;
  const filePath = path.join(INBOUND, filename);
  fs.writeFileSync(
    filePath,
    toCsv(
      [
        "OurInvoiceNumber",
        "VendorInvoiceReference",
        "VendorBPNumber",
        "VendorName",
        "VendorTaxNumber",
        "InvoiceDate",
        "DueDate",
        "CurrencyCode",
        "Subtotal",
        "VatAmount",
        "TotalAmount",
        "Description",
      ],
      rows
    )
  );
  return filePath;
}

function readNewFiles(dir, seenLog) {
  const seen = loadJson(seenLog);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".csv") && !seen[f]);
  return { files, seen };
}

// ---------------------------------------------------------------------------
// Loop
// ---------------------------------------------------------------------------

let exportedOnce = false;

async function exportStep() {
  if (exportedOnce) return; // one export pass is enough for this proof-of-concept run
  const invoices = await getInvoicesReadyToExport();
  const byInvoiceNumber = {};
  const rows = invoices.map((inv) => {
    byInvoiceNumber[inv.invoiceNumber] = inv;
    return mapInvoiceToInterfaceRow(inv);
  });
  if (rows.length === 0) {
    console.log("[bridge-agent] no invoices ready to export");
    exportedOnce = true;
    return;
  }
  const filePath = writeInvoiceFileForSmartStream(rows);
  saveJson(path.join(BASE_DIR, ".bridge-invoice-map.json"), byInvoiceNumber);
  console.log(`[bridge-agent] exported ${rows.length} invoice(s) → ${path.basename(filePath)}`);
  exportedOnce = true;
}

function ackStep() {
  const { files, seen } = readNewFiles(OUTBOUND, SEEN_ACK_LOG);
  for (const f of files) {
    const rows = parseCsv(fs.readFileSync(path.join(OUTBOUND, f), "utf8"));
    for (const row of rows) {
      if (row.Status === "POSTED") {
        console.log(`[bridge-agent] ${row.OurInvoiceNumber} posted to SmartStream as ${row.SmartStreamVoucherNumber}`);
      } else {
        console.warn(`[bridge-agent] ${row.OurInvoiceNumber} REJECTED by SmartStream: ${row.Reason}`);
      }
    }
    seen[f] = true;
  }
  saveJson(SEEN_ACK_LOG, seen);
}

async function paymentStep() {
  const { files, seen } = readNewFiles(OUTBOUND_PAYMENTS, SEEN_PAYMENT_LOG);
  const invoiceMap = loadJson(path.join(BASE_DIR, ".bridge-invoice-map.json"));
  for (const f of files) {
    const rows = parseCsv(fs.readFileSync(path.join(OUTBOUND_PAYMENTS, f), "utf8"));
    for (const row of rows) {
      const inv = invoiceMap[row.OurInvoiceNumber];
      console.log(`[bridge-agent] SmartStream paid ${row.OurInvoiceNumber} — ${row.AmountPaid} on ${row.PaymentDate}`);
      if (!inv) {
        console.warn(`[bridge-agent]   no local record of ${row.OurInvoiceNumber} — skipping pay-back call`);
        continue;
      }
      try {
        await markInvoicePaidFromSmartStream(inv.id, {
          voucherNumber: row.SmartStreamVoucherNumber,
          paymentDate: row.PaymentDate,
          paymentReference: row.PaymentReference,
        });
      } catch (e) {
        console.error(`[bridge-agent]   failed to record payment for ${row.OurInvoiceNumber}:`, e.message);
      }
    }
    seen[f] = true;
  }
  saveJson(SEEN_PAYMENT_LOG, seen);
}

async function tick() {
  try {
    await exportStep();
    ackStep();
    await paymentStep();
  } catch (e) {
    console.error("[bridge-agent] tick failed:", e.message);
  }
}

console.log(`[bridge-agent] source=${SOURCE} dir=${BASE_DIR}`);
if (SOURCE === "api") console.log(`[bridge-agent] backend=${SERVER_URL}`);
setInterval(tick, POLL_MS);
tick();
