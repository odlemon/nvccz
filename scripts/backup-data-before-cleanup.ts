// @ts-nocheck
/**
 * Backup Data Before Cleanup Script
 * 
 * This script backs up all data that will be deleted during cleanup:
 * - Customers
 * - Vendors
 * - All transaction data
 * - All operational data
 * 
 * The backup is saved in a structured format that can be easily restored.
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const BACKUP_DIR = path.join(process.cwd(), 'backups');
const BACKUP_TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-');
const BACKUP_FOLDER = path.join(BACKUP_DIR, `backup-${BACKUP_TIMESTAMP}`);

async function backupData() {
  console.log('💾 BACKING UP DATA BEFORE CLEANUP');
  console.log('=' .repeat(60));
  console.log(`📁 Backup location: ${BACKUP_FOLDER}`);
  console.log('');

  try {
    // Create backup directory
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
    if (!fs.existsSync(BACKUP_FOLDER)) {
      fs.mkdirSync(BACKUP_FOLDER, { recursive: true });
    }

    console.log('📊 Step 1: Backing up Customers...');
    const customers = await prisma.customer.findMany();
    await saveBackup('customers.json', customers);
    console.log(`   ✅ Backed up ${customers.length} customers`);

    console.log('📊 Step 2: Backing up Vendors...');
    const vendors = await prisma.vendor.findMany();
    await saveBackup('vendors.json', vendors);
    console.log(`   ✅ Backed up ${vendors.length} vendors`);

    console.log('📊 Step 3: Backing up Journal Entries...');
    const journalEntries = await prisma.journalEntry.findMany({
      include: {
        journalEntryLines: true
      }
    });
    await saveBackup('journal-entries.json', journalEntries);
    console.log(`   ✅ Backed up ${journalEntries.length} journal entries`);

    console.log('📊 Step 4: Backing up Expenses...');
    const expenses = await prisma.expense.findMany();
    await saveBackup('expenses.json', expenses);
    console.log(`   ✅ Backed up ${expenses.length} expenses`);

    console.log('📊 Step 5: Backing up Invoices...');
    const invoices = await prisma.invoice.findMany();
    await saveBackup('invoices.json', invoices);
    console.log(`   ✅ Backed up ${invoices.length} invoices`);

    console.log('📊 Step 6: Backing up Purchase Invoices...');
    const purchaseInvoices = await prisma.purchaseInvoice.findMany();
    await saveBackup('purchase-invoices.json', purchaseInvoices);
    console.log(`   ✅ Backed up ${purchaseInvoices.length} purchase invoices`);

    const purchaseInvoiceItems = await prisma.purchaseInvoiceItem.findMany();
    await saveBackup('purchase-invoice-items.json', purchaseInvoiceItems);
    console.log(`   ✅ Backed up ${purchaseInvoiceItems.length} purchase invoice items`);

    console.log('📊 Step 7: Backing up Revenues...');
    const revenues = await prisma.revenue.findMany();
    await saveBackup('revenues.json', revenues);
    console.log(`   ✅ Backed up ${revenues.length} revenues`);

    console.log('📊 Step 8: Backing up Cashbook Entries...');
    const cashbookEntries = await prisma.cashbookEntry.findMany();
    await saveBackup('cashbook-entries.json', cashbookEntries);
    console.log(`   ✅ Backed up ${cashbookEntries.length} cashbook entries`);

    console.log('📊 Step 9: Backing up Payment Allocations...');
    const paymentAllocations = await prisma.paymentAllocation.findMany();
    await saveBackup('payment-allocations.json', paymentAllocations);
    console.log(`   ✅ Backed up ${paymentAllocations.length} payment allocations`);

    console.log('📊 Step 10: Backing up Cashbook Transfers...');
    const cashbookTransfers = await prisma.cashbookTransfer.findMany();
    await saveBackup('cashbook-transfers.json', cashbookTransfers);
    console.log(`   ✅ Backed up ${cashbookTransfers.length} cashbook transfers`);

    console.log('📊 Step 11: Backing up Bank Reconciliations...');
    const bankReconciliations = await prisma.bankReconciliation.findMany();
    await saveBackup('bank-reconciliations.json', bankReconciliations);
    console.log(`   ✅ Backed up ${bankReconciliations.length} bank reconciliations`);

    console.log('📊 Step 12: Backing up Bank Statements...');
    const bankStatements = await prisma.bankStatement.findMany();
    await saveBackup('bank-statements.json', bankStatements);
    console.log(`   ✅ Backed up ${bankStatements.length} bank statements`);

    const bankStatementItems = await prisma.bankStatementItem.findMany();
    await saveBackup('bank-statement-items.json', bankStatementItems);
    console.log(`   ✅ Backed up ${bankStatementItems.length} bank statement items`);

    console.log('📊 Step 13: Backing up Applications...');
    const applications = await prisma.application.findMany({
      include: {
        documents: true,
        notifications: true
      }
    });
    await saveBackup('applications.json', applications);
    console.log(`   ✅ Backed up ${applications.length} applications`);

    const applicationStages = await prisma.applicationStage.findMany();
    await saveBackup('application-stages.json', applicationStages);
    console.log(`   ✅ Backed up ${applicationStages.length} application stages`);

    console.log('📊 Step 14: Backing up Portfolio Companies...');
    const portfolioCompanies = await prisma.portfolioCompany.findMany();
    await saveBackup('portfolio-companies.json', portfolioCompanies);
    console.log(`   ✅ Backed up ${portfolioCompanies.length} portfolio companies`);

    console.log('📊 Step 15: Backing up Funds...');
    const funds = await prisma.fund.findMany();
    await saveBackup('funds.json', funds);
    console.log(`   ✅ Backed up ${funds.length} funds`);

    const fundManagers = await prisma.fundManager.findMany();
    await saveBackup('fund-managers.json', fundManagers);
    console.log(`   ✅ Backed up ${fundManagers.length} fund managers`);

    const investmentCommitments = await prisma.investmentCommitment.findMany();
    await saveBackup('investment-commitments.json', investmentCommitments);
    console.log(`   ✅ Backed up ${investmentCommitments.length} investment commitments`);

    console.log('📊 Step 16: Backing up Clients...');
    const clients = await prisma.client.findMany();
    await saveBackup('clients.json', clients);
    console.log(`   ✅ Backed up ${clients.length} clients`);

    console.log('📊 Step 17: Backing up Performance Goals...');
    const performanceGoals = await prisma.performanceGoal.findMany();
    await saveBackup('performance-goals.json', performanceGoals);
    console.log(`   ✅ Backed up ${performanceGoals.length} performance goals`);

    console.log('📊 Step 18: Backing up Tasks...');
    const tasks = await prisma.task.findMany();
    await saveBackup('tasks.json', tasks);
    console.log(`   ✅ Backed up ${tasks.length} tasks`);

    console.log('📊 Step 19: Backing up Activity Logs...');
    const activityLogs = await prisma.activityLog.findMany();
    await saveBackup('activity-logs.json', activityLogs);
    console.log(`   ✅ Backed up ${activityLogs.length} activity logs`);

    console.log('📊 Step 20: Backing up Procurement Data...');
    const purchaseRequisitions = await prisma.purchaseRequisition.findMany();
    await saveBackup('purchase-requisitions.json', purchaseRequisitions);

    const purchaseRequisitionItems = await prisma.purchaseRequisitionItem.findMany();
    await saveBackup('purchase-requisition-items.json', purchaseRequisitionItems);

    const purchaseOrders = await prisma.purchaseOrder.findMany();
    await saveBackup('purchase-orders.json', purchaseOrders);

    const purchaseOrderItems = await prisma.purchaseOrderItem.findMany();
    await saveBackup('purchase-order-items.json', purchaseOrderItems);

    const vendorQuotations = await prisma.vendorQuotation.findMany();
    await saveBackup('vendor-quotations.json', vendorQuotations);

    const vendorQuotationItems = await prisma.vendorQuotationItem.findMany();
    await saveBackup('vendor-quotation-items.json', vendorQuotationItems);

    const grns = await prisma.goodsReceivedNote.findMany();
    await saveBackup('goods-received-notes.json', grns);

    const grnItems = await prisma.goodsReceivedNoteItem.findMany();
    await saveBackup('goods-received-note-items.json', grnItems);

    console.log(`   ✅ Backed up procurement data`);

    console.log('📊 Step 21: Backing up Payroll Data...');
    const employees = await prisma.employee.findMany();
    await saveBackup('employees.json', employees);

    const payrollRuns = await prisma.payrollRun.findMany();
    await saveBackup('payroll-runs.json', payrollRuns);

    const employeePayrolls = await prisma.employeePayroll.findMany();
    await saveBackup('employee-payrolls.json', employeePayrolls);

    const payslips = await prisma.payslip.findMany();
    await saveBackup('payslips.json', payslips);

    console.log(`   ✅ Backed up payroll data`);

    console.log('📊 Step 22: Backing up Inventory Data...');
    const inventoryItems = await prisma.inventoryItem.findMany();
    await saveBackup('inventory-items.json', inventoryItems);

    const stockMovements = await prisma.stockMovement.findMany();
    await saveBackup('stock-movements.json', stockMovements);

    console.log(`   ✅ Backed up inventory data`);

    console.log('📊 Step 23: Backing up Assets...');
    const assets = await prisma.asset.findMany();
    await saveBackup('assets.json', assets);

    const depreciationRecords = await prisma.depreciationRecord.findMany();
    await saveBackup('depreciation-records.json', depreciationRecords);

    console.log(`   ✅ Backed up asset data`);

    console.log('📊 Step 24: Backing up Financial Reports...');
    const creditNotes = await prisma.creditNote.findMany();
    await saveBackup('credit-notes.json', creditNotes);

    const statements = await prisma.statementOfAccount.findMany();
    await saveBackup('statements.json', statements);

    const statementItems = await prisma.statementItem.findMany();
    await saveBackup('statement-items.json', statementItems);

    const exchangeRates = await prisma.exchangeRate.findMany();
    await saveBackup('exchange-rates.json', exchangeRates);

    const forexGainLoss = await prisma.forexGainLoss.findMany();
    await saveBackup('forex-gain-loss.json', forexGainLoss);

    console.log(`   ✅ Backed up financial reports`);

    console.log('📊 Step 25: Backing up Content & Communication...');
    const posts = await prisma.post.findMany();
    await saveBackup('posts.json', posts);

    const replies = await prisma.reply.findMany();
    await saveBackup('replies.json', replies);

    const newsletters = await prisma.newsletter.findMany();
    await saveBackup('newsletters.json', newsletters);

    const newsletterSubscriptions = await prisma.newsletterSubscription.findMany();
    await saveBackup('newsletter-subscriptions.json', newsletterSubscriptions);

    const events = await prisma.event.findMany();
    await saveBackup('events.json', events);

    const eventGuests = await prisma.eventGuest.findMany();
    await saveBackup('event-guests.json', eventGuests);

    const eventBudgetItems = await prisma.eventBudgetItem.findMany();
    await saveBackup('event-budget-items.json', eventBudgetItems);

    const eventExpenses = await prisma.eventExpense.findMany();
    await saveBackup('event-expenses.json', eventExpenses);

    const eventFeedback = await prisma.eventFeedback.findMany();
    await saveBackup('event-feedback.json', eventFeedback);

    const eventCheckIns = await prisma.eventCheckIn.findMany();
    await saveBackup('event-check-ins.json', eventCheckIns);

    console.log(`   ✅ Backed up content & communication`);

    console.log('📊 Step 26: Backing up Other Data...');
    const notifications = await prisma.notification.findMany();
    await saveBackup('notifications.json', notifications);

    const userActivities = await prisma.userActivity.findMany();
    await saveBackup('user-activities.json', userActivities);

    const auditLogs = await prisma.auditLog.findMany();
    await saveBackup('audit-logs.json', auditLogs);

    const stakeholders = await prisma.stakeholder.findMany();
    await saveBackup('stakeholders.json', stakeholders);

    const targets = await prisma.target.findMany();
    await saveBackup('targets.json', targets);

    console.log(`   ✅ Backed up other data`);

    // Create backup metadata
    const metadata = {
      timestamp: new Date().toISOString(),
      backupFolder: BACKUP_FOLDER,
      summary: {
        customers: customers.length,
        vendors: vendors.length,
        journalEntries: journalEntries.length,
        expenses: expenses.length,
        invoices: invoices.length,
        purchaseInvoices: purchaseInvoices.length,
        revenues: revenues.length,
        cashbookEntries: cashbookEntries.length,
        paymentAllocations: paymentAllocations.length,
        cashbookTransfers: cashbookTransfers.length,
        bankReconciliations: bankReconciliations.length,
        bankStatements: bankStatements.length,
        applications: applications.length,
        portfolioCompanies: portfolioCompanies.length,
        funds: funds.length,
        clients: clients.length,
        performanceGoals: performanceGoals.length,
        tasks: tasks.length,
        activityLogs: activityLogs.length,
        purchaseRequisitions: purchaseRequisitions.length,
        purchaseOrders: purchaseOrders.length,
        vendorQuotations: vendorQuotations.length,
        grns: grns.length,
        employees: employees.length,
        payrollRuns: payrollRuns.length,
        employeePayrolls: employeePayrolls.length,
        payslips: payslips.length,
        inventoryItems: inventoryItems.length,
        stockMovements: stockMovements.length,
        assets: assets.length,
        depreciationRecords: depreciationRecords.length,
        creditNotes: creditNotes.length,
        statements: statements.length,
        exchangeRates: exchangeRates.length,
        forexGainLoss: forexGainLoss.length,
        posts: posts.length,
        newsletters: newsletters.length,
        newsletterSubscriptions: newsletterSubscriptions.length,
        events: events.length,
        notifications: notifications.length,
        userActivities: userActivities.length,
        auditLogs: auditLogs.length,
        stakeholders: stakeholders.length,
        targets: targets.length
      }
    };

    await saveBackup('metadata.json', metadata);

    console.log('');
    console.log('🎉 BACKUP COMPLETE!');
    console.log('=' .repeat(60));
    console.log(`📁 Backup saved to: ${BACKUP_FOLDER}`);
    console.log('');
    console.log('📊 Backup Summary:');
    console.log(`   • ${customers.length} customers`);
    console.log(`   • ${vendors.length} vendors`);
    console.log(`   • ${journalEntries.length} journal entries`);
    console.log(`   • ${expenses.length} expenses`);
    console.log(`   • ${invoices.length} invoices`);
    console.log(`   • ${revenues.length} revenues`);
    console.log(`   • ${cashbookEntries.length} cashbook entries`);
    console.log(`   • And many more...`);
    console.log('');
    console.log('💡 To restore this backup, run:');
    console.log(`   npx ts-node scripts/restore-data-from-backup.ts ${BACKUP_FOLDER}`);

  } catch (error) {
    console.error('❌ Error during backup:', error);
    throw error;
  }
}

async function saveBackup(filename: string, data: any) {
  const filePath = path.join(BACKUP_FOLDER, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

async function main() {
  try {
    await backupData();
  } catch (error) {
    console.error('❌ Backup failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

