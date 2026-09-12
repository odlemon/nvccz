/**
 * UAT: Employee → shell vendor for staff reimbursement (creditors sub-ledger via cashbook SUPPLIER).
 *
 * Requires DB column employees.reimbursement_vendor_id (npm run db:migrate:employee-reimbursement-vendor).
 *
 * Run: npm run test:uat:staff-reimbursement-vendor
 */
import { prisma } from '../src/utils/database';
import { StaffReimbursementVendorService } from '../src/services/StaffReimbursementVendorService';
import CashbookService from '../src/services/CashbookService';

const failures: string[] = [];

function assert(condition: boolean, msg: string) {
  if (!condition) failures.push(msg);
}

async function main() {
  console.log('========== Staff reimbursement vendor (employee ↔ creditor shell) ==========\n');

  const employee = await prisma.employee.findFirst({
    where: { isActive: true },
    include: { user: true }
  });

  if (!employee) {
    console.error('No active employee — seed or create one first.');
    process.exitCode = 1;
    return;
  }

  const col = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = 'reimbursement_vendor_id'`
  );
  if (Number(col[0]?.c ?? 0) === 0) {
    console.error(
      'Column employees.reimbursement_vendor_id missing. Run: npm run db:migrate:employee-reimbursement-vendor'
    );
    process.exitCode = 1;
    return;
  }

  const first = await StaffReimbursementVendorService.ensureReimbursementVendor(employee.id);
  assert(!!first.vendor, 'ensure should return a vendor');
  assert(first.vendor.name.includes('Staff Reimbursement'), 'vendor name should tag staff reimbursement');
  assert(first.vendor.name.includes(employee.employeeNumber), 'vendor name should include employee number');

  const linked = await prisma.employee.findUnique({
    where: { id: employee.id },
    select: { reimbursementVendorId: true }
  });
  assert(linked?.reimbursementVendorId === first.vendor.id, 'employee should link to vendor id');

  const second = await StaffReimbursementVendorService.ensureReimbursementVendor(employee.id);
  assert(second.createdNewVendor === false, 'second ensure should not create a new vendor');
  assert(second.vendor.id === first.vendor.id, 'same vendor id on idempotent ensure');

  const get = await StaffReimbursementVendorService.getReimbursementVendor(employee.id);
  assert(get.vendorId === first.vendor.id, 'get should return same vendor id');

  if (failures.length) {
    console.error('FAILURES:\n- ' + failures.join('\n- '));
    process.exitCode = 1;
    return;
  }

  console.log('\n--- Staff reimbursement PAYMENT (SUPPLIER → creditors / open items) ---\n');

  const admin = await prisma.user.findFirst({
    where: { email: { in: ['admin@nts.com', 'admin@nvccz.co.zw'] } },
  });
  if (!admin) {
    console.error('Admin user not found (admin@nts.com or admin@nvccz.co.zw) — cannot create payment');
    process.exitCode = 1;
    return;
  }

  const ensured = await CashbookService.ensureZigCashbookBank();
  const payAmount = 150;
  const payResult = await CashbookService.createCashPayment({
    bankId: ensured.bank.id,
    transactionDate: new Date(),
    description: 'Staff Reimbursement',
    amount: payAmount,
    reference: `UAT-STAFF-REIMB-${Date.now()}`,
    counterpartyType: 'SUPPLIER',
    vendorId: first.vendor.id,
    vatCode: '0%',
    createdById: admin.id,
  });

  assert(!!payResult.success, payResult.message || 'cash payment failed');
  assert(!!payResult.transaction, 'cash payment transaction');
  assert(payResult.transaction.status === 'PENDING', 'supplier payment stays PENDING until allocate/post');
  assert(payResult.transaction.counterpartyType === 'SUPPLIER', 'counterparty SUPPLIER');
  assert(payResult.transaction.vendorId === first.vendor.id, 'vendorId is reimbursement shell');
  assert(payResult.transaction.description === 'Staff Reimbursement', 'description Staff Reimbursement');

  if (payResult.controlAccountResult) {
    console.log('Control account:', (payResult.controlAccountResult as { message?: string }).message ?? payResult.controlAccountResult);
  }

  if (failures.length) {
    console.error('FAILURES:\n- ' + failures.join('\n- '));
    process.exitCode = 1;
    return;
  }

  console.log('\nOK: employee shell vendor', first.vendor.id, `(${first.vendor.name})`);
  console.log('OK: cashbook PAYMENT', payResult.transaction.id, `amount ${payAmount} — ${payResult.transaction.description}`);
  console.log('API: POST /api/payroll/employees/:id/reimbursement-vendor\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
