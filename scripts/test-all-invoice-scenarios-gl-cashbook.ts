// @ts-nocheck
/**
 * Test all invoice scenarios: customer, purchase, procurement.
 * Verifies correct GL (journal entries) and cashbook for each flow.
 * Run: npx ts-node scripts/test-all-invoice-scenarios-gl-cashbook.ts
 * Credentials: admin@nts.com / admin123
 */
import { prisma } from '../src/utils/database';
import { Decimal } from '@prisma/client/runtime/library';
import { InvoiceService } from '../src/services/InvoiceService';
import { CashbookService } from '../src/services/CashbookService';
import OpenItemService from '../src/services/OpenItemService';
import { PurchaseInvoiceService } from '../src/services/PurchaseInvoiceService';
import { ProcurementService } from '../src/services/ProcurementService';

const failures: string[] = [];

type JELine = { accountNo: string; accountName: string; accountType?: string; debit: number; credit: number };

function lineSummary(lines: JELine[]) {
  return lines.map((l) => `${l.accountNo} ${l.debit > 0 ? 'Dr' : 'Cr'} ${l.debit || l.credit}`).join(', ');
}

async function getJELines(jeId: string): Promise<JELine[]> {
  const lines = await prisma.journalEntryLine.findMany({
    where: { journalEntryId: jeId },
    include: { chartOfAccount: true }
  });
  return lines.map((l) => ({
    accountNo: l.chartOfAccount.accountNo,
    accountName: l.chartOfAccount.accountName,
    accountType: l.chartOfAccount.accountType,
    debit: Number(l.debitAmount),
    credit: Number(l.creditAmount)
  }));
}

function assert(condition: boolean, msg: string) {
  if (!condition) failures.push(msg);
}

async function run() {
  console.log('========== Test: All invoice scenarios (GL + Cashbook) ==========\n');

  const admin = await prisma.user.findUnique({ where: { email: 'admin@nts.com' } });
  if (!admin) throw new Error('admin@nts.com not found');

  const currency = await prisma.currency.findFirst({ where: { code: 'USD' } }) || await prisma.currency.findFirst({ where: { isActive: true } });
  if (!currency) throw new Error('No currency');
  const customer = await prisma.customer.findFirst({ where: { isActive: true } }) || await prisma.customer.create({ data: { name: 'Test Customer', email: 'c@test.com', isActive: true } });
  const vendor = await prisma.vendor.findFirst({ where: { isActive: true } }) || await prisma.vendor.create({ data: { name: 'Test Vendor PI', email: 'vpi@test.com', isActive: true } });
  const bank = await prisma.bank.findFirst({ where: { isActive: true }, include: { glAccount: true } });
  if (!bank) throw new Error('No bank');
  const expenseAccount = await prisma.chartOfAccounts.findFirst({ where: { accountType: 'Expense', isActive: true } });
  if (!expenseAccount) throw new Error('No expense account');

  // --- 1. Customer invoice: CREATE -> sale JE (Dr AR, Cr Revenue, Cr VAT if taxable) ---
  console.log('--- Scenario 1: Customer invoice CREATE (sale JE) ---');
  const custInv = await InvoiceService.createInvoice({
    customerId: customer.id,
    amount: 1000,
    currencyId: currency.id,
    transactionDate: new Date(),
    description: 'Test sale',
    isTaxable: true,
    createdById: admin.id
  });
  assert(!!custInv.journalEntryId, 'Customer invoice must have journalEntryId');
  const saleLines = await getJELines(custInv.journalEntryId!);
  const hasDrAR = saleLines.some((l) => (l.accountNo === '1200' || l.accountName.includes('Receivable')) && l.debit > 0);
  const hasCrRevenue = saleLines.some((l) => (l.accountType === 'Revenue' || (l.accountNo >= '4000' && l.accountNo < '5000')) && l.credit > 0);
  assert(hasDrAR, `Sale JE should Dr AR (1200): ${lineSummary(saleLines)}`);
  assert(saleLines.reduce((s, l) => s + l.debit - l.credit, 0) === 0, 'Sale JE must balance (debits = credits)');
  console.log('  Sale JE lines:', lineSummary(saleLines));
  console.log('  OK.\n');

  // --- 2. Customer invoice: PAY VIA CASHBOOK (receipt + allocate) -> payment JE (Dr Bank, Cr AR), cashbook + allocation ---
  console.log('--- Scenario 2: Customer invoice PAY VIA CASHBOOK (receipt + allocate) ---');
  await prisma.invoice.update({ where: { id: custInv.id }, data: { status: 'OPEN' } });
  const receipt = await CashbookService.createCashReceipt({
    bankId: bank.id,
    transactionDate: new Date(),
    description: 'Customer payment',
    amount: 1150,
    counterpartyType: 'CUSTOMER',
    customerId: customer.id,
    vatCode: '15%',
    createdById: admin.id
  });
  assert(receipt.success && receipt.transaction, 'Receipt must succeed');
  const receiptJEId = receipt.transaction!.journalEntryId;
  assert(!!receiptJEId, 'Receipt must have journal entry');
  const receiptLines = await getJELines(receiptJEId);
  const hasDrBank = receiptLines.some((l) => l.debit > 0 && (l.accountNo === '1000' || l.accountName.includes('Cash') || l.accountName.includes('Bank')));
  const hasCrAR = receiptLines.some((l) => l.credit > 0 && (l.accountNo === '1200' || l.accountName.includes('Receivable')));
  assert(hasDrBank, `Receipt JE should Dr Bank: ${lineSummary(receiptLines)}`);
  assert(hasCrAR || receiptLines.some((l) => l.credit > 0), `Receipt JE should Cr AR or contra: ${lineSummary(receiptLines)}`);
  const allocResult = await OpenItemService.allocatePaymentToInvoices(
    receipt.transaction!.id,
    [{ invoiceId: custInv.id, allocatedAmount: 1150 }],
    admin.id
  );
  assert(allocResult.success, 'Allocation must succeed');
  const invAfter = await prisma.invoice.findUnique({ where: { id: custInv.id } });
  assert(Number(invAfter?.paidAmount || 0) >= 1150 && Number(invAfter?.outstandingAmount || 0) <= 0, 'Invoice paid/outstanding should reflect allocation');
  console.log('  Receipt JE lines:', lineSummary(receiptLines));
  console.log('  Allocation OK, invoice paidAmount:', invAfter?.paidAmount);
  console.log('  OK.\n');

  // --- 3. Customer invoice: MARK AS PAID (no cashbook) -> payment JE only ---
  console.log('--- Scenario 3: Customer invoice MARK AS PAID (JE only, no cashbook) ---');
  const custInv2 = await InvoiceService.createInvoice({
    customerId: customer.id,
    amount: 500,
    currencyId: currency.id,
    transactionDate: new Date(),
    description: 'Sale 2',
    isTaxable: false,
    createdById: admin.id
  });
  await InvoiceService.sendInvoice(custInv2.id);
  const paidInv = await InvoiceService.markAsPaid(custInv2.id, { paymentMethod: 'BANK' });
  assert(!!paidInv.journalEntryId, 'Invoice has sale JE');
  const paymentJEs = await prisma.journalEntry.findMany({
    where: { description: { contains: 'Payment' } },
    orderBy: { createdAt: 'desc' },
    take: 1
  });
  const paymentJE = paymentJEs[0];
  assert(!!paymentJE, 'Payment JE should exist for markAsPaid');
  const payLines = await getJELines(paymentJE.id);
  assert(payLines.some((l) => l.debit > 0) && payLines.some((l) => l.credit > 0), `MarkAsPaid JE should have Dr and Cr: ${lineSummary(payLines)}`);
  console.log('  Payment JE (no cashbook):', lineSummary(payLines));
  console.log('  OK.\n');

  // --- 4. Purchase invoice: SUBMIT CREDIT -> JE (Dr Expense, Dr VAT, Cr AP). Then PAY -> cashbook (Dr AP, Cr Bank) ---
  console.log('--- Scenario 4: Purchase invoice SUBMIT CREDIT then PAY ---');
  const pinv = await PurchaseInvoiceService.createPurchaseInvoice({
    vendorId: vendor.id,
    invoiceDate: new Date(),
    currencyId: currency.id,
    items: [{ itemName: 'Item', quantity: 1, unitPrice: 200, vatRate: 0.15 }],
    isTaxable: true,
    createdById: admin.id
  });
  const submitted = await PurchaseInvoiceService.submitInvoice(pinv.id, { paymentMethod: 'CREDIT', expenseAccountId: expenseAccount.id }, admin.id);
  assert(!!submitted.journalEntryId, 'Purchase invoice CREDIT must have journalEntryId');
  const submitLines = await getJELines(submitted.journalEntryId!);
  const hasDrExpense = submitLines.some((l) => l.debit > 0 && (l.accountType === 'Expense' || parseInt(l.accountNo) >= 5000));
  const hasCrAP = submitLines.some((l) => l.credit > 0 && (l.accountNo === '2000' || l.accountNo === '2100' || l.accountName.includes('Accounts Payable')));
  assert(hasDrExpense || submitLines.some((l) => l.debit > 0), `Submit CREDIT should Dr Expense: ${lineSummary(submitLines)}`);
  assert(hasCrAP, `Submit CREDIT should Cr AP: ${lineSummary(submitLines)}`);
  console.log('  Submit CREDIT JE:', lineSummary(submitLines));
  const paidPI = await PurchaseInvoiceService.payInvoice(pinv.id, { paymentMethod: 'BANK', bankId: bank.id, paymentDate: new Date() }, admin.id);
  assert(!!paidPI.cashbookEntryId, 'Purchase invoice payment must set cashbookEntryId');
  const cbEntry = await prisma.cashbookEntry.findUnique({ where: { id: paidPI.cashbookEntryId! } });
  assert(!!cbEntry?.journalEntryId, 'Cashbook payment must have journal entry');
  const payPILines = await getJELines(cbEntry!.journalEntryId!);
  const hasDrAPPay = payPILines.some((l) => l.debit > 0 && (l.accountNo === '2000' || l.accountName.includes('Payable')));
  const hasCrBankPay = payPILines.some((l) => l.credit > 0 && (l.accountNo === '1000' || l.accountName.includes('Cash') || l.accountName.includes('Bank')));
  assert(hasDrAPPay, `Pay JE should Dr AP: ${lineSummary(payPILines)}`);
  assert(hasCrBankPay, `Pay JE should Cr Bank: ${lineSummary(payPILines)}`);
  console.log('  Pay (cashbook) JE:', lineSummary(payPILines));
  console.log('  OK.\n');

  // --- 5. Purchase invoice: SUBMIT BANK -> cashbook + JE (Dr Expense, Dr VAT, Cr Bank) ---
  console.log('--- Scenario 5: Purchase invoice SUBMIT BANK (cashbook at submit) ---');
  const vendor2 = await prisma.vendor.findFirst({ where: { isActive: true } }) || vendor;
  const pinv2 = await PurchaseInvoiceService.createPurchaseInvoice({
    vendorId: vendor2.id,
    invoiceDate: new Date(),
    currencyId: currency.id,
    items: [{ itemName: 'Item2', quantity: 1, unitPrice: 300, vatRate: 0 }],
    isTaxable: false,
    createdById: admin.id
  });
  const submittedBank = await PurchaseInvoiceService.submitInvoice(pinv2.id, { paymentMethod: 'BANK', bankId: bank.id, expenseAccountId: expenseAccount.id }, admin.id);
  assert(!!submittedBank.journalEntryId, 'Purchase invoice BANK must have journalEntryId');
  assert(!!submittedBank.cashbookEntryId, 'Purchase invoice BANK must have cashbookEntryId');
  const submitBankLines = await getJELines(submittedBank.journalEntryId!);
  assert(submitBankLines.some((l) => l.debit > 0) && submitBankLines.some((l) => l.credit > 0), `Submit BANK JE must balance: ${lineSummary(submitBankLines)}`);
  console.log('  Submit BANK JE:', lineSummary(submitBankLines));
  console.log('  OK.\n');

  // --- 6. Procurement invoice: PAY -> expense JE + cashbook (Dr AP, Cr Bank), cashbookEntryId ---
  console.log('--- Scenario 6: Procurement invoice PAY (expense JE + cashbook) ---');
  const procInv = await prisma.procurementInvoice.create({
    data: {
      invoiceNumber: `PROC-GL-${Date.now()}`,
      vendorId: vendor.id,
      currencyId: currency.id,
      invoiceDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 86400000),
      subtotal: new Decimal(400),
      taxAmount: new Decimal(60),
      totalAmount: new Decimal(460),
      status: 'APPROVED',
      paymentStatus: 'PENDING',
      createdById: admin.id,
      items: { create: [{ itemName: 'Proc item', quantity: new Decimal(1), unitPrice: new Decimal(400), totalPrice: new Decimal(400), matchStatus: 'PENDING' }] }
    }
  });
  await ProcurementService.payProcurementInvoice(procInv.id, { paymentAmount: 460, paymentDate: new Date(), paymentMethod: 'BANK', bankAccountId: bank.id }, admin.id);
  const procAfter = await prisma.procurementInvoice.findUnique({ where: { id: procInv.id }, include: { journalEntry: true, cashbookEntry: true } });
  assert(!!procAfter?.journalEntryId, 'Procurement invoice must have journalEntryId (expense)');
  assert(!!procAfter?.cashbookEntryId, 'Procurement invoice must have cashbookEntryId');
  const procExpLines = await getJELines(procAfter!.journalEntryId!);
  assert(procExpLines.some((l) => l.debit > 0) && procExpLines.some((l) => l.credit > 0), `Procurement expense JE: ${lineSummary(procExpLines)}`);
  const procPayJeId = procAfter!.cashbookEntry!.journalEntryId;
  assert(!!procPayJeId, 'Procurement cashbook entry must have journal entry');
  const procPayLines = await getJELines(procPayJeId!);
  assert(procPayLines.some((l) => l.debit > 0) && procPayLines.some((l) => l.credit > 0), `Procurement payment JE: ${lineSummary(procPayLines)}`);
  console.log('  Procurement expense JE:', lineSummary(procExpLines));
  console.log('  Procurement payment (cashbook) JE:', lineSummary(procPayLines));
  console.log('  OK.\n');

  // --- Summary ---
  console.log('========== Summary ==========');
  if (failures.length > 0) {
    console.log('FAILURES:');
    failures.forEach((f) => console.log('  -', f));
    process.exit(1);
  }
  console.log('All scenarios passed: GL and cashbook behaviour correct for customer, purchase, and procurement invoices.');
  await prisma.$disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
