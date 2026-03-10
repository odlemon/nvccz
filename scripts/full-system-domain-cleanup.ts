// @ts-nocheck
/**
 * Full system domain cleanup (DESTRUCTIVE).
 *
 * Deletes:
 * - Procurement RFQs/quotations: VendorQuotation + VendorQuotationItem
 * - All Events (and related guests, expenses, feedback, reports, etc.)
 * - All Payroll runs, employee payrolls, payslips, tax rules, allowance types, bank file templates
 * - KPI named "ffgvh", all performance goals and tasks (and activity logs)
 * - All Applications in the portfolio module (and linked data via cascades)
 * - All Portfolio Companies (and linked investment implementations via cascades)
 * - All sales Invoices and PurchaseInvoices (and their items, allocations, and linked JEs / cashbook links)
 * - All Assets (and depreciation / disposal records)
 * - All Customers and Vendors (after detaching dependent accounting data)
 *
 * It then verifies that:
 * - All requested entities are gone
 * - The accounting equation still balances: Assets - Liabilities - Equity ≈ 0
 *
 * RUN THIS ONLY ON NON-PROD DATABASES.
 *
 * Run:
 *   npx ts-node scripts/full-system-domain-cleanup.ts
 */

import { prisma } from '../src/utils/database';
import { BalanceSheetService } from '../src/services/BalanceSheetService';

async function deleteJournalEntry(journalEntryId: string | null | undefined) {
  if (!journalEntryId) return;
  try {
    await prisma.journalEntryLine.deleteMany({ where: { journalEntryId } }).catch(() => null);
    await prisma.journalEntry.delete({ where: { id: journalEntryId } }).catch(() => null);
  } catch (e) {
    console.warn('  Warning: failed to delete journal entry', journalEntryId, e?.message ?? e);
  }
}

async function cleanupProcurementRfqsAndQuotations() {
  console.log('--- Procurement RFQs / Vendor Quotations ---');
  const [quoteCount, quoteItemCount] = await Promise.all([
    prisma.vendorQuotation.count(),
    prisma.vendorQuotationItem.count()
  ]);
  console.log('  Vendor quotations:', quoteCount);
  console.log('  Vendor quotation items:', quoteItemCount);

  if (quoteItemCount === 0 && quoteCount === 0) {
    console.log('  Nothing to delete (already empty).');
    return;
  }

  // Unlink any remaining references from quotations to procurement invoices (defensive, should already be clear)
  await prisma.vendorQuotation.updateMany({
    where: { invoiceId: { not: null } },
    data: { invoiceId: null }
  }).catch(() => null);

  const deletedItems = await prisma.vendorQuotationItem.deleteMany({});
  const deletedQuotes = await prisma.vendorQuotation.deleteMany({});
  console.log('  Deleted vendor quotation items:', deletedItems.count);
  console.log('  Deleted vendor quotations:', deletedQuotes.count);
}

async function cleanupEvents() {
  console.log('\n--- Events module (events, guests, expenses, feedback, reports, check-ins) ---');
  const [eventsBefore, guestsBefore, expensesBefore, feedbackBefore, reportsBefore, checkInsBefore, budgetItemsBefore] =
    await Promise.all([
      prisma.event.count(),
      prisma.eventGuest.count(),
      prisma.eventExpense.count(),
      prisma.eventFeedback.count(),
      prisma.eventReport.count(),
      prisma.eventCheckIn.count(),
      prisma.eventBudgetItem.count()
    ]);
  console.log('  Events:         ', eventsBefore);
  console.log('  Guests:         ', guestsBefore);
  console.log('  Expenses:       ', expensesBefore);
  console.log('  Feedback:       ', feedbackBefore);
  console.log('  Reports:        ', reportsBefore);
  console.log('  Check-ins:      ', checkInsBefore);
  console.log('  Budget items:   ', budgetItemsBefore);

  if (eventsBefore === 0 && guestsBefore === 0 && expensesBefore === 0 && feedbackBefore === 0 && reportsBefore === 0 && checkInsBefore === 0 && budgetItemsBefore === 0) {
    console.log('  Nothing to delete (already empty).');
    return;
  }

  await prisma.eventCheckIn.deleteMany({});
  await prisma.eventFeedback.deleteMany({});
  await prisma.eventExpense.deleteMany({});
  await prisma.eventBudgetItem.deleteMany({});
  await prisma.eventReport.deleteMany({});
  await prisma.eventGuest.deleteMany({});
  const deletedEvents = await prisma.event.deleteMany({});
  console.log('  Deleted events:', deletedEvents.count);
}

async function cleanupPayrollAndBankTemplates() {
  console.log('\n--- Payroll (runs, employee payrolls, payslips, tax rules, allowance types, bank file templates) ---');

  const [runs, employeePayrolls, allowances, deductions, allowanceTypes, deductionTypes, taxRules, payslips, bankTemplates] =
    await Promise.all([
      prisma.payrollRun.count(),
      prisma.employeePayroll.count(),
      prisma.payrollAllowance.count(),
      prisma.payrollDeduction.count(),
      prisma.allowanceTypes.count(),
      prisma.deductionTypes.count(),
      prisma.taxRules.count(),
      prisma.payslip.count(),
      prisma.bankFileTemplate.count()
    ]);

  console.log('  Payroll runs:        ', runs);
  console.log('  Employee payrolls:   ', employeePayrolls);
  console.log('  Payroll allowances:  ', allowances);
  console.log('  Payroll deductions:  ', deductions);
  console.log('  Allowance types:     ', allowanceTypes);
  console.log('  Deduction types:     ', deductionTypes);
  console.log('  Tax rules:           ', taxRules);
  console.log('  Payslips:            ', payslips);
  console.log('  Bank file templates: ', bankTemplates);

  if (runs + employeePayrolls + allowances + deductions + allowanceTypes + deductionTypes + taxRules + payslips + bankTemplates === 0) {
    console.log('  Nothing to delete (already empty).');
    return;
  }

  // Child tables first
  await prisma.payrollAllowance.deleteMany({});
  await prisma.payrollDeduction.deleteMany({});
  await prisma.employeePayroll.deleteMany({});
  await prisma.payslip.deleteMany({});

  // Config / master data
  await prisma.salaryStructure.deleteMany({});
  await prisma.employeeDeduction.deleteMany({});
  await prisma.leaveBalance.deleteMany({});

  await prisma.payrollRun.deleteMany({});
  await prisma.taxRules.deleteMany({});
  await prisma.allowanceTypes.deleteMany({});
  await prisma.deductionTypes.deleteMany({});
  await prisma.bankFileTemplate.deleteMany({});

  console.log('  Payroll and related config records deleted.');
}

async function cleanupPerformanceKpiGoalsTasks() {
  console.log('\n--- Performance (KPI ffgvh, goals, tasks, activity logs, deal sourcing goals) ---');

  const [kpisNamed, goals, tasks, activityLogs, dealGoals] = await Promise.all([
    prisma.kPI.count({ where: { name: 'ffgvh' } }),
    prisma.performanceGoal.count(),
    prisma.task.count(),
    prisma.activityLog.count(),
    prisma.dealSourcingGoal.count()
  ]);

  console.log('  KPI named ffgvh:       ', kpisNamed);
  console.log('  Performance goals:     ', goals);
  console.log('  Tasks:                 ', tasks);
  console.log('  Activity logs:         ', activityLogs);
  console.log('  Deal sourcing goals:   ', dealGoals);
  if (kpisNamed + goals + tasks + activityLogs + dealGoals === 0) {
    console.log('  Nothing to delete (already empty).');
    return;
  }

  // Activity logs depend on goals/tasks/KPIs (NoAction), so delete logs first
  await prisma.activityLog.deleteMany({});

  // Tasks
  await prisma.task.deleteMany({});

  // Break self-referencing hierarchies before deleting goals
  await prisma.performanceGoal.updateMany({
    where: { parentGoalId: { not: null } },
    data: { parentGoalId: null }
  }).catch(() => null);
  await prisma.dealSourcingGoal.updateMany({
    where: { parentGoalId: { not: null } },
    data: { parentGoalId: null }
  }).catch(() => null);

  // Goals / deal sourcing goals
  await prisma.performanceGoal.deleteMany({});
  await prisma.dealSourcingGoal.deleteMany({});

  // Target KPI by name
  const deletedKpis = await prisma.kPI.deleteMany({ where: { name: 'ffgvh' } });
  console.log('  Deleted KPI named ffgvh:', deletedKpis.count);
}

async function cleanupPortfolioApplicationsAndCompanies() {
  console.log('\n--- Portfolio module (applications + linked data, portfolio companies) ---');

  const [applications, companies] = await Promise.all([
    prisma.application.count(),
    prisma.portfolioCompany.count()
  ]);

  console.log('  Applications:       ', applications);
  console.log('  Portfolio companies:', companies);

  if (applications + companies === 0) {
    console.log('  Nothing to delete (already empty).');
    return;
  }

  // Application has many dependent entities with onDelete: Cascade (documents, notifications, DD reviews, board reviews, term sheets, stages, investment implementations, etc.)
  const deletedApps = await prisma.application.deleteMany({});
  console.log('  Deleted applications (and cascaded children):', deletedApps.count);

  // PortfolioCompany cascades to InvestmentImplementation and related milestones / disbursements
  const deletedCompanies = await prisma.portfolioCompany.deleteMany({});
  console.log('  Deleted portfolio companies (and cascaded children):', deletedCompanies.count);
}

async function cleanupSalesInvoicesAndPurchaseInvoices() {
  console.log('\n--- Accounting: sales invoices (Invoice) and purchase invoices (PurchaseInvoice) ---');

  // ----- Sales invoices -----
  const invoices = await prisma.invoice.findMany({
    select: { id: true, journalEntryId: true }
  });
  console.log('  Sales invoices found:', invoices.length);

  if (invoices.length > 0) {
    const invoiceIds = invoices.map((i) => i.id);

    const [allocationsDeleted, salesItemsDeleted, creditNotesDeleted] = await Promise.all([
      prisma.paymentAllocation.deleteMany({ where: { invoiceId: { in: invoiceIds } } }),
      prisma.salesInvoiceItem.deleteMany({ where: { invoiceId: { in: invoiceIds } } }),
      prisma.creditNote.deleteMany({ where: { invoiceId: { in: invoiceIds } } })
    ]);

    console.log('  Deleted payment allocations for invoices:', allocationsDeleted.count);
    console.log('  Deleted sales invoice items:', salesItemsDeleted.count);
    console.log('  Deleted credit notes linked to invoices:', creditNotesDeleted.count);

    // Delete linked journal entries for invoices
    for (const inv of invoices) {
      await deleteJournalEntry(inv.journalEntryId);
    }

    const deletedInvoices = await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    console.log('  Deleted sales invoices:', deletedInvoices.count);
  }

  // ----- Purchase invoices -----
  const purchaseInvoices = await prisma.purchaseInvoice.findMany({
    include: {
      cashbookEntry: true
    }
  });
  console.log('  Purchase invoices found:', purchaseInvoices.length);

  if (purchaseInvoices.length > 0) {
    for (const pi of purchaseInvoices) {
      // Clear links to cashbook / JEs to avoid FK issues
      await prisma.purchaseInvoice.update({
        where: { id: pi.id },
        data: {
          journalEntryId: null,
          paymentJournalEntryId: null,
          cashbookEntryId: null
        }
      }).catch(() => null);

      if (pi.cashbookEntry) {
        const cashJeId = pi.cashbookEntry.journalEntryId;
        await prisma.cashbookEntry.update({
          where: { id: pi.cashbookEntry.id },
          data: { journalEntryId: null }
        }).catch(() => null);
        await deleteJournalEntry(cashJeId);
        await prisma.cashbookEntry.delete({ where: { id: pi.cashbookEntry.id } }).catch(() => null);
      }

      await deleteJournalEntry(pi.journalEntryId);
      await deleteJournalEntry(pi.paymentJournalEntryId);

      await prisma.purchaseInvoiceItem.deleteMany({ where: { invoiceId: pi.id } }).catch(() => null);
      await prisma.purchaseInvoice.delete({ where: { id: pi.id } }).catch(() => null);
    }

    console.log('  Deleted purchase invoices and related items / cashbook / JEs.');
  }
}

async function cleanupAssets() {
  console.log('\n--- Assets (assets, depreciation records, disposal records) ---');

  const [assets, depRecords, disposals] = await Promise.all([
    prisma.asset.count(),
    prisma.depreciationRecord.count(),
    prisma.assetDisposalRecord.count()
  ]);

  console.log('  Assets:               ', assets);
  console.log('  Depreciation records: ', depRecords);
  console.log('  Disposal records:     ', disposals);

  if (assets + depRecords + disposals === 0) {
    console.log('  Nothing to delete (already empty).');
    return;
  }

  await prisma.depreciationRecord.deleteMany({});
  await prisma.assetDisposalRecord.deleteMany({});
  const deletedAssets = await prisma.asset.deleteMany({});
  console.log('  Deleted assets:', deletedAssets.count);
}

async function cleanupExpensesAndStatementsForCustomersVendors() {
  console.log('\n--- Customer/Vendor related accounting docs (expenses, statements) ---');

  const [expenses, statements] = await Promise.all([
    prisma.expense.findMany({ select: { id: true, journalEntryId: true } }),
    prisma.statementOfAccount.findMany({ select: { id: true } })
  ]);

  console.log('  Expenses found:          ', expenses.length);
  console.log('  Statements of account:   ', statements.length);

  if (expenses.length > 0) {
    for (const e of expenses) {
      await deleteJournalEntry(e.journalEntryId);
    }
    await prisma.expense.deleteMany({ where: { id: { in: expenses.map((e) => e.id) } } });
    console.log('  Deleted expenses and related JEs.');
  }

  if (statements.length > 0) {
    const statementIds = statements.map((s) => s.id);
    await prisma.statementItem.deleteMany({ where: { statementId: { in: statementIds } } });
    await prisma.statementOfAccount.deleteMany({ where: { id: { in: statementIds } } });
    console.log('  Deleted statements of account and statement items.');
  }
}

async function cleanupCustomersAndVendors() {
  console.log('\n--- Customers and Vendors ---');

  const [customersBefore, vendorsBefore] = await Promise.all([
    prisma.customer.count(),
    prisma.vendor.count()
  ]);

  console.log('  Customers:', customersBefore);
  console.log('  Vendors:  ', vendorsBefore);

  if (customersBefore + vendorsBefore === 0) {
    console.log('  Nothing to delete (already empty).');
    return;
  }

  // Detach discount configs so they don't block delete
  await prisma.discountConfig.deleteMany({}).catch(() => null);

  // Detach cashbook entries from customers / vendors to keep bank history while freeing FK
  await prisma.cashbookEntry.updateMany({
    where: { customerId: { not: null } },
    data: { customerId: null }
  }).catch(() => null);
  await prisma.cashbookEntry.updateMany({
    where: { vendorId: { not: null } },
    data: { vendorId: null }
  }).catch(() => null);

  const deletedStatements = await prisma.statementOfAccount.deleteMany({}).catch(() => ({ count: 0 }));
  console.log('  Deleted statement of account headers:', deletedStatements.count ?? 0);

  const deletedCustomers = await prisma.customer.deleteMany({});
  const deletedVendors = await prisma.vendor.deleteMany({});

  console.log('  Deleted customers:', deletedCustomers.count);
  console.log('  Deleted vendors:  ', deletedVendors.count);
}

async function verifyPostCleanup() {
  console.log('\n========== Verification: entity counts after cleanup ==========');

  const [
    rfqQuotes,
    events,
    payrollRuns,
    payslips,
    taxRules,
    allowanceTypes,
    bankTemplates,
    kpisNamed,
    goals,
    dealGoals,
    tasks,
    applications,
    companies,
    invoices,
    purchaseInvoices,
    assets,
    customers,
    vendors
  ] = await Promise.all([
    prisma.vendorQuotation.count(),
    prisma.event.count(),
    prisma.payrollRun.count(),
    prisma.payslip.count(),
    prisma.taxRules.count(),
    prisma.allowanceTypes.count(),
    prisma.bankFileTemplate.count(),
    prisma.kPI.count({ where: { name: 'ffgvh' } }),
    prisma.performanceGoal.count(),
    prisma.dealSourcingGoal.count(),
    prisma.task.count(),
    prisma.application.count(),
    prisma.portfolioCompany.count(),
    prisma.invoice.count(),
    prisma.purchaseInvoice.count(),
    prisma.asset.count(),
    prisma.customer.count(),
    prisma.vendor.count()
  ]);

  console.log('  Vendor quotations:     ', rfqQuotes);
  console.log('  Events:               ', events);
  console.log('  Payroll runs:         ', payrollRuns);
  console.log('  Payslips:             ', payslips);
  console.log('  Tax rules:            ', taxRules);
  console.log('  Allowance types:      ', allowanceTypes);
  console.log('  Bank file templates:  ', bankTemplates);
  console.log('  KPI named ffgvh:      ', kpisNamed);
  console.log('  Performance goals:    ', goals);
  console.log('  Deal sourcing goals:  ', dealGoals);
  console.log('  Tasks:                ', tasks);
  console.log('  Applications:         ', applications);
  console.log('  Portfolio companies:  ', companies);
  console.log('  Sales invoices:       ', invoices);
  console.log('  Purchase invoices:    ', purchaseInvoices);
  console.log('  Assets:               ', assets);
  console.log('  Customers:            ', customers);
  console.log('  Vendors:              ', vendors);

  const nonZero = [
    ['Vendor quotations', rfqQuotes],
    ['Events', events],
    ['Payroll runs', payrollRuns],
    ['Payslips', payslips],
    ['Tax rules', taxRules],
    ['Allowance types', allowanceTypes],
    ['Bank file templates', bankTemplates],
    ['KPI named ffgvh', kpisNamed],
    ['Performance goals', goals],
    ['Deal sourcing goals', dealGoals],
    ['Tasks', tasks],
    ['Applications', applications],
    ['Portfolio companies', companies],
    ['Sales invoices', invoices],
    ['Purchase invoices', purchaseInvoices],
    ['Assets', assets],
    ['Customers', customers],
    ['Vendors', vendors]
  ].filter(([, count]) => count > 0);

  if (nonZero.length > 0) {
    console.log('\n  WARNING: Some entities are still present after cleanup:');
    for (const [name, count] of nonZero) {
      console.log(`   - ${name}: ${count}`);
    }
    console.log('\n  Please review the remaining records.');
  } else {
    console.log('\n  All requested entities have been deleted.');
  }
}

async function verifyAccountingEquation() {
  console.log('\n========== Accounting equation check ==========');
  const asOfDate = new Date();
  asOfDate.setHours(23, 59, 59, 999);

  const data = await BalanceSheetService.generateBalanceSheet({
    asOfDate,
    startDate: new Date(0),
    endDate: asOfDate
  });

  const totalAssets = data.assets.totalAssets;
  const totalLiabilities = data.liabilities.totalLiabilities;
  const totalEquity = data.equity.total;
  const diff = totalAssets - totalLiabilities - totalEquity;
  const balanced = Math.abs(diff) < 0.02;

  console.log('  sum(Assets)      =', totalAssets.toFixed(2));
  console.log('  sum(Liabilities) =', totalLiabilities.toFixed(2));
  console.log('  sum(Equity)      =', totalEquity.toFixed(2));
  console.log('  Assets - L - E   =', diff.toFixed(2), balanced ? '(OK)' : '(IMBALANCE)');

  if (!balanced) {
    console.log('\n  WARNING: Accounting equation is NOT balanced after cleanup.');
    process.exitCode = 1;
  } else {
    console.log('\n  Accounting equation maintained.');
  }
}

async function main() {
  console.log('========== FULL SYSTEM DOMAIN CLEANUP (DESTRUCTIVE) ==========\n');

  await cleanupProcurementRfqsAndQuotations();
  await cleanupEvents();
  await cleanupPayrollAndBankTemplates();
  await cleanupPerformanceKpiGoalsTasks();
  await cleanupPortfolioApplicationsAndCompanies();
  await cleanupSalesInvoicesAndPurchaseInvoices();
  await cleanupAssets();
  await cleanupExpensesAndStatementsForCustomersVendors();
  await cleanupCustomersAndVendors();

  await verifyPostCleanup();
  await verifyAccountingEquation();

  console.log('\n========== CLEANUP COMPLETED ==========');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});

