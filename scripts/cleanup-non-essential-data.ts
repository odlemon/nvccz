// @ts-nocheck
/**
 * Cleanup Non-Essential Data Script
 * 
 * This script removes all non-essential data from the database while preserving:
 * - Admin user (admin@nvccz.co.zw)
 * - Admin role and all hardcoded roles
 * - All departments
 * - All currencies (USD, ZWL)
 * - All chart of accounts
 * - All KPIs
 * 
 * WARNING: This script will delete ALL other data. Use with caution!
 * Always backup your database before running this script.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Essential data identifiers
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_ROLE_NAME = 'admin';
const ESSENTIAL_CURRENCIES = ['USD', 'ZWL'];
const ESSENTIAL_DEPARTMENTS = [
  'Finance',
  'Sales',
  'Operations',
  'Procurement',
  'Human Resources',
  'Marketing',
  'Legal',
  'IT'
];

async function cleanupNonEssentialData() {
  console.log('🧹 CLEANUP NON-ESSENTIAL DATA');
  console.log('=' .repeat(60));
  console.log('⚠️  WARNING: This will delete all non-essential data!');
  console.log('⚠️  Make sure you have a backup before proceeding!');
  console.log('=' .repeat(60));
  console.log('');

  try {
    // Step 1: Identify essential data
    console.log('📋 Step 1: Identifying Essential Data...');
    const essentialData = await identifyEssentialData();
    console.log('✅ Essential data identified');
    console.log('');

    // Step 2: Delete non-essential data
    console.log('🗑️  Step 2: Deleting Non-Essential Data...');
    await deleteNonEssentialData(essentialData);
    console.log('✅ Non-essential data deleted');
    console.log('');

    // Step 3: Verify essential data
    console.log('✅ Step 3: Verifying Essential Data...');
    await verifyEssentialData(essentialData);
    console.log('✅ Essential data verified');
    console.log('');

    console.log('🎉 CLEANUP COMPLETE!');
    console.log('=' .repeat(60));
    console.log('✅ All non-essential data has been removed');
    console.log('✅ Essential data has been preserved');
    console.log('');
    // Get counts of preserved master data and configuration
    const banksCount = await prisma.bank.count();
    const expenseCategoriesCount = await prisma.expenseCategory.count();
    const revenueSourcesCount = await prisma.revenueSource.count();
    const revenueCategoriesCount = await prisma.revenueCategory.count();
    const approvalConfigsCount = await prisma.procurementApprovalConfig.count();
    const taxRulesCount = await prisma.taxRules.count();
    const allowanceTypesCount = await prisma.allowanceTypes.count();
    const deductionTypesCount = await prisma.deductionTypes.count();
    const salaryStructuresCount = await prisma.salaryStructure.count();
    const entryTypeConfigsCount = await prisma.cashbookEntryTypeConfig.count();
    const referenceNumberConfigsCount = await prisma.referenceNumberConfig.count();
    const cashbookTemplatesCount = await prisma.cashbookTemplate.count();
    const contraEntryConfigsCount = await prisma.contraEntryConfig.count();
    const periodLockoutsCount = await prisma.periodLockout.count();
    const accountingPeriodsCount = await prisma.accountingPeriod.count();

    console.log('📊 System is now ready for production with:');
    console.log(`   • 1 admin user (${ADMIN_EMAIL})`);
    console.log(`   • ${essentialData.roles.length} roles`);
    console.log(`   • ${essentialData.departments.length} departments`);
    console.log(`   • ${essentialData.currencies.length} currencies`);
    console.log(`   • ${essentialData.chartOfAccounts.length} chart of accounts`);
    console.log(`   • ${essentialData.kpis.length} KPIs`);
    console.log(`   • ${banksCount} bank accounts (master data)`);
    console.log(`   • ${expenseCategoriesCount} expense categories (master data)`);
    console.log(`   • ${revenueSourcesCount} revenue sources (master data)`);
    console.log(`   • ${revenueCategoriesCount} revenue categories (master data)`);
    console.log(`   • ${approvalConfigsCount} approval configs (system configuration)`);
    console.log(`   • ${taxRulesCount} tax rules (system configuration)`);
    console.log(`   • ${allowanceTypesCount} allowance types (system configuration)`);
    console.log(`   • ${deductionTypesCount} deduction types (system configuration)`);
    console.log(`   • ${salaryStructuresCount} salary structures (system configuration)`);
    console.log(`   • ${entryTypeConfigsCount} entry type configs (system configuration)`);
    console.log(`   • ${referenceNumberConfigsCount} reference number configs (system configuration)`);
    console.log(`   • ${cashbookTemplatesCount} cashbook templates (system configuration)`);
    console.log(`   • ${contraEntryConfigsCount} contra entry configs (system configuration)`);
    console.log(`   • ${periodLockoutsCount} period lockouts (system configuration)`);
    console.log(`   • ${accountingPeriodsCount} accounting periods (system configuration)`);

  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    throw error;
  }
}

async function identifyEssentialData() {
  // Find admin user
  const adminUser = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL }
  });

  if (!adminUser) {
    throw new Error(`Admin user not found: ${ADMIN_EMAIL}`);
  }

  // Find admin role
  const adminRole = await prisma.role.findUnique({
    where: { name: ADMIN_ROLE_NAME }
  });

  if (!adminRole) {
    throw new Error(`Admin role not found: ${ADMIN_ROLE_NAME}`);
  }

  // Find all roles (including hardcoded roles)
  const allRoles = await prisma.role.findMany();

  // Find all departments
  const allDepartments = await prisma.department.findMany({
    where: {
      name: { in: ESSENTIAL_DEPARTMENTS }
    }
  });

  // Find essential currencies
  const essentialCurrencies = await prisma.currency.findMany({
    where: {
      code: { in: ESSENTIAL_CURRENCIES }
    }
  });

  // Find all chart of accounts
  const allChartOfAccounts = await prisma.chartOfAccounts.findMany();

  // Find all KPIs
  const allKPIs = await prisma.kPI.findMany();

  return {
    adminUser,
    adminRole,
    roles: allRoles,
    departments: allDepartments,
    currencies: essentialCurrencies,
    chartOfAccounts: allChartOfAccounts,
    kpis: allKPIs
  };
}

async function deleteNonEssentialData(essentialData: any) {
  // Step 1: Update configuration records to point to admin user (outside transaction for better performance)
  console.log('   • Updating configuration records to point to admin user...');
  try {
    await prisma.contraEntryConfig.updateMany({
      where: {
        createdById: { not: essentialData.adminUser.id }
      },
      data: {
        createdById: essentialData.adminUser.id
      }
    });
  } catch (e) {
    // Ignore if no records to update
  }

  try {
    await prisma.cashbookEntryTypeConfig.updateMany({
      where: {
        createdById: { not: essentialData.adminUser.id }
      },
      data: {
        createdById: essentialData.adminUser.id
      }
    });
  } catch (e) {}

  try {
    await prisma.cashbookEntryTypeConfig.updateMany({
      where: {
        updatedById: { not: null, not: essentialData.adminUser.id }
      },
      data: {
        updatedById: essentialData.adminUser.id
      }
    });
  } catch (e) {}

  try {
    await prisma.cashbookTemplate.updateMany({
      where: {
        createdById: { not: essentialData.adminUser.id }
      },
      data: {
        createdById: essentialData.adminUser.id
      }
    });
  } catch (e) {}

  try {
    await prisma.procurementApprovalConfig.updateMany({
      where: {
        createdById: { not: essentialData.adminUser.id }
      },
      data: {
        createdById: essentialData.adminUser.id
      }
    });
  } catch (e) {}

  try {
    await prisma.taxRules.updateMany({
      where: {
        createdById: { not: essentialData.adminUser.id }
      },
      data: {
        createdById: essentialData.adminUser.id
      }
    });
  } catch (e) {}

  try {
    await prisma.allowanceTypes.updateMany({
      where: {
        createdById: { not: essentialData.adminUser.id }
      },
      data: {
        createdById: essentialData.adminUser.id
      }
    });
  } catch (e) {}

  try {
    await prisma.deductionTypes.updateMany({
      where: {
        createdById: { not: essentialData.adminUser.id }
      },
      data: {
        createdById: essentialData.adminUser.id
      }
    });
  } catch (e) {}

  try {
    await prisma.bankFileTemplate.updateMany({
      where: {
        createdById: { not: essentialData.adminUser.id }
      },
      data: {
        createdById: essentialData.adminUser.id
      }
    });
  } catch (e) {}

  console.log('   ✅ Configuration records updated');

  // Step 2: Delete ALL transaction data that references users first
  console.log('   • Deleting payment allocations...');
  await prisma.paymentAllocation.deleteMany({});

  console.log('   • Deleting cashbook entries...');
  await prisma.cashbookEntry.deleteMany({});

  console.log('   • Deleting cashbook transfers...');
  await prisma.cashbookTransfer.deleteMany({});

  console.log('   • Deleting cashbook batches...');
  await prisma.cashbookExport.deleteMany({});
  await prisma.cashbookBatch.deleteMany({});
  await prisma.cashbookImportBatch.deleteMany({});

  console.log('   • Deleting journal entries...');
  await prisma.journalEntryLine.deleteMany({});
  await prisma.journalEntry.deleteMany({});

  console.log('   • Deleting expenses...');
  await prisma.expense.deleteMany({});

  console.log('   • Deleting invoices...');
  await prisma.invoice.deleteMany({});

  console.log('   • Deleting purchase invoices...');
  await prisma.purchaseInvoiceItem.deleteMany({});
  await prisma.purchaseInvoice.deleteMany({});

  console.log('   • Deleting revenues...');
  await prisma.revenue.deleteMany({});

  console.log('   • Deleting bank reconciliations...');
  await prisma.reconciliationAuditTrail.deleteMany({});
  await prisma.reconciliationResult.deleteMany({});
  await prisma.bankTransaction.deleteMany({});
  await prisma.reconciliationMismatch.deleteMany({});
  await prisma.bankStatementItem.deleteMany({});
  await prisma.bankStatement.deleteMany({});
  await prisma.bankReconciliation.deleteMany({});

  console.log('   • Deleting contra entries...');
  await prisma.contraEntry.deleteMany({});

  console.log('   • Deleting discount configs (references customers/vendors)...');
  await prisma.discountConfig.deleteMany({});

  console.log('   • Deleting procurement data (references vendors)...');
  await prisma.procurementInvoiceItem.deleteMany({});
  await prisma.procurementInvoice.deleteMany({});
  await prisma.purchaseRequisitionItem.deleteMany({});
  await prisma.purchaseRequisition.deleteMany({});
  await prisma.goodsReceivedNoteItem.deleteMany({}); // Delete before purchase order items
  await prisma.goodsReceivedNote.deleteMany({});
  await prisma.purchaseOrderItem.deleteMany({});
  await prisma.purchaseOrder.deleteMany({});
  await prisma.vendorQuotationItem.deleteMany({});
  await prisma.vendorQuotation.deleteMany({});
  await prisma.approval.deleteMany({});
  await prisma.approvalRequest.deleteMany({});

  console.log('   • Deleting customers...');
  await prisma.customer.deleteMany({});

  console.log('   • Deleting vendors...');
  await prisma.vendor.deleteMany({});

  console.log('   • Deleting payroll data (references users)...');
  await prisma.payslip.deleteMany({});
  await prisma.leaveBalance.deleteMany({});
  await prisma.employeePayroll.deleteMany({});
  await prisma.payrollRun.deleteMany({});
  await prisma.employee.deleteMany({});

  console.log('   • Deleting financial reports data (references users)...');
  await prisma.forexGainLoss.deleteMany({});
  await prisma.exchangeRate.deleteMany({});
  await prisma.statementItem.deleteMany({});
  await prisma.statementOfAccount.deleteMany({});
  await prisma.creditNote.deleteMany({});

  console.log('   • Deleting inventory and assets (references users)...');
  await prisma.stockMovement.deleteMany({});
  await prisma.salesInvoiceItem.deleteMany({});
  await prisma.inventoryItem.deleteMany({});
  await prisma.assetDisposalRecord.deleteMany({});
  await prisma.depreciationRecord.deleteMany({});
  await prisma.asset.deleteMany({});

  console.log('   • Deleting activity logs, tasks, and performance data (references users)...');
  await prisma.activityLog.deleteMany({});
  await prisma.task.deleteMany({});
  
  // Performance goals have self-referential hierarchy, need to break it first
  await prisma.performanceGoal.updateMany({
    data: { parentGoalId: null }
  });
  await prisma.performanceGoal.deleteMany({});
  
  await prisma.performanceReviewFeedback.deleteMany({});
  await prisma.performanceReview.deleteMany({});
  await prisma.performanceReviewCycle.deleteMany({});
  await prisma.externalData.deleteMany({});

  console.log('   • Deleting investment and portfolio data (references users)...');
  await prisma.fundDisbursement.deleteMany({});
  await prisma.investmentMilestone.deleteMany({});
  await prisma.investmentImplementation.deleteMany({});
  await prisma.fundManager.deleteMany({});
  await prisma.investmentCommitment.deleteMany({});
  await prisma.fund.deleteMany({});
  await prisma.client.deleteMany({});
  await prisma.applicationNotification.deleteMany({});
  await prisma.applicationDocument.deleteMany({});
  await prisma.dueDiligenceReview.deleteMany({});
  await prisma.boardReview.deleteMany({});
  await prisma.termSheet.deleteMany({});
  await prisma.applicationStage.deleteMany({});
  await prisma.review.deleteMany({});
  await prisma.application.deleteMany({});
  await prisma.portfolioCompany.deleteMany({});

  console.log('   • Deleting content and communication (references users)...');
  await prisma.reply.deleteMany({});
  await prisma.post.deleteMany({});
  await prisma.newsletterSubscription.deleteMany({});
  await prisma.newsletterTopic.deleteMany({});
  await prisma.newsletter.deleteMany({});
  await prisma.eventReport.deleteMany({});
  await prisma.eventCheckIn.deleteMany({});
  await prisma.eventFeedback.deleteMany({});
  await prisma.eventExpense.deleteMany({});
  await prisma.eventBudgetItem.deleteMany({});
  await prisma.eventGuest.deleteMany({});
  await prisma.event.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.userActivity.deleteMany({});
  await prisma.auditLog.deleteMany({});

  console.log('   • Deleting users (except admin)...');
  await prisma.user.deleteMany({
    where: {
      email: { not: ADMIN_EMAIL }
    }
  });

  // Step 3: Continue with other deletions in transaction
  await prisma.$transaction(async (tx) => {
    // Note: Most transaction data, applications, portfolio companies, funds, and clients already deleted above

    // Note: Performance goals, tasks, activity logs, and performance reviews already deleted above

    // Note: Procurement data, payroll data, inventory, assets, and financial reports already deleted above

    // Note: Content, communication, notifications, and activity logs already deleted above

    console.log('   • Deleting stakeholder data...');
    await tx.stakeholderEngagement.deleteMany({});
    await tx.stakeholderOnboarding.deleteMany({});
    await tx.stakeholder.deleteMany({});

    console.log('   • Deleting reporting data...');
    await tx.turnoverAnalysisReport.deleteMany({});
    await tx.varianceReport.deleteMany({});
    await tx.generatedReport.deleteMany({});
    await tx.reportTemplate.deleteMany({});

    console.log('   • Deleting deal management data...');
    await tx.dealProgressUpdate.deleteMany({});
    await tx.dealProgress.deleteMany({});
    await tx.dealSourcingGoal.deleteMany({});
    await tx.researchReportActivity.deleteMany({});
    await tx.researchReport.deleteMany({});

    console.log('   • Deleting risk management data...');
    await tx.riskAssessmentHistory.deleteMany({});
    await tx.riskAssessmentSubTask.deleteMany({});
    await tx.riskAssessment.deleteMany({});

    console.log('   • Deleting budget data...');
    await tx.budgetItem.deleteMany({});
    await tx.budget.deleteMany({});

    console.log('   • Deleting portfolio valuation data...');
    await tx.portfolioValuationActivity.deleteMany({});
    await tx.portfolioValuation.deleteMany({});

    console.log('   • Deleting exit interview data...');
    await tx.exitInterview.deleteMany({});

    console.log('   • Deleting company profile data...');
    await tx.document.deleteMany({});
    await tx.miniKyc.deleteMany({});
    await tx.companyProfile.deleteMany({});

    console.log('   • Deleting targets...');
    await tx.target.deleteMany({});

    // Note: Banks, Expense Categories, Revenue Sources/Categories are MASTER DATA
    // They are preserved as they are essential for the system to function
    console.log('   • Preserving banks (master data)...');
    console.log('   • Preserving expense categories (master data)...');
    console.log('   • Preserving revenue sources and categories (master data)...');

    // Note: Configuration data is preserved as it defines how the system works
    console.log('   • Preserving procurement approval configs (system configuration)...');
    // Note: Approval stages are preserved as they're part of approval configs
    console.log('   • Preserving tax rules (system configuration)...');
    console.log('   • Preserving allowance types (system configuration)...');
    console.log('   • Preserving deduction types (system configuration)...');
    console.log('   • Preserving salary structures (system configuration)...');
    console.log('   • Preserving cashbook entry type configs (system configuration)...');
    console.log('   • Preserving reference number configs (system configuration)...');
    console.log('   • Preserving cashbook templates (system configuration)...');
    console.log('   • Preserving contra entry configs (system configuration)...');
    console.log('   • Deleting discount configs (references customers/vendors)...');
    await tx.discountConfig.deleteMany({});
    console.log('   • Preserving period lockouts (system configuration)...');
    console.log('   • Preserving accounting periods (system configuration)...');

    console.log('   ✅ All non-essential data deleted');
  }, {
    timeout: 30000 // 30 second timeout
  });
}

async function verifyEssentialData(essentialData: any) {
  // Verify admin user
  const adminUser = await prisma.user.findUnique({
    where: { email: ADMIN_EMAIL }
  });
  if (!adminUser) {
    throw new Error('Admin user not found after cleanup!');
  }
  console.log('   ✅ Admin user preserved');

  // Verify admin role
  const adminRole = await prisma.role.findUnique({
    where: { name: ADMIN_ROLE_NAME }
  });
  if (!adminRole) {
    throw new Error('Admin role not found after cleanup!');
  }
  console.log('   ✅ Admin role preserved');

  // Verify roles count
  const rolesCount = await prisma.role.count();
  if (rolesCount !== essentialData.roles.length) {
    throw new Error(`Role count mismatch! Expected ${essentialData.roles.length}, got ${rolesCount}`);
  }
  console.log(`   ✅ ${rolesCount} roles preserved`);

  // Verify departments count
  const departmentsCount = await prisma.department.count({
    where: {
      name: { in: ESSENTIAL_DEPARTMENTS }
    }
  });
  if (departmentsCount !== essentialData.departments.length) {
    throw new Error(`Department count mismatch! Expected ${essentialData.departments.length}, got ${departmentsCount}`);
  }
  console.log(`   ✅ ${departmentsCount} departments preserved`);

  // Verify currencies count
  const currenciesCount = await prisma.currency.count({
    where: {
      code: { in: ESSENTIAL_CURRENCIES }
    }
  });
  if (currenciesCount !== essentialData.currencies.length) {
    throw new Error(`Currency count mismatch! Expected ${essentialData.currencies.length}, got ${currenciesCount}`);
  }
  console.log(`   ✅ ${currenciesCount} currencies preserved`);

  // Verify chart of accounts count
  const chartOfAccountsCount = await prisma.chartOfAccounts.count();
  if (chartOfAccountsCount !== essentialData.chartOfAccounts.length) {
    throw new Error(`Chart of accounts count mismatch! Expected ${essentialData.chartOfAccounts.length}, got ${chartOfAccountsCount}`);
  }
  console.log(`   ✅ ${chartOfAccountsCount} chart of accounts preserved`);

  // Verify KPIs count
  const kpisCount = await prisma.kPI.count();
  if (kpisCount !== essentialData.kpis.length) {
    throw new Error(`KPI count mismatch! Expected ${essentialData.kpis.length}, got ${kpisCount}`);
  }
  console.log(`   ✅ ${kpisCount} KPIs preserved`);

  // Verify master data is preserved
  const banksCount = await prisma.bank.count();
  console.log(`   ✅ ${banksCount} banks preserved (master data)`);

  const expenseCategoriesCount = await prisma.expenseCategory.count();
  console.log(`   ✅ ${expenseCategoriesCount} expense categories preserved (master data)`);

  const revenueSourcesCount = await prisma.revenueSource.count();
  console.log(`   ✅ ${revenueSourcesCount} revenue sources preserved (master data)`);

  const revenueCategoriesCount = await prisma.revenueCategory.count();
  console.log(`   ✅ ${revenueCategoriesCount} revenue categories preserved (master data)`);

  // Verify customers and vendors are deleted
  const customersCount = await prisma.customer.count();
  if (customersCount > 0) {
    throw new Error(`Customers should be deleted but ${customersCount} remain!`);
  }
  console.log(`   ✅ Customers deleted (${customersCount} remaining)`);

  const vendorsCount = await prisma.vendor.count();
  if (vendorsCount > 0) {
    throw new Error(`Vendors should be deleted but ${vendorsCount} remain!`);
  }
  console.log(`   ✅ Vendors deleted (${vendorsCount} remaining)`);

  // Verify configuration data is preserved
  const approvalConfigsCount = await prisma.procurementApprovalConfig.count();
  console.log(`   ✅ ${approvalConfigsCount} approval configs preserved (system configuration)`);

  const taxRulesCount = await prisma.taxRules.count();
  console.log(`   ✅ ${taxRulesCount} tax rules preserved (system configuration)`);

  const entryTypeConfigsCount = await prisma.cashbookEntryTypeConfig.count();
  console.log(`   ✅ ${entryTypeConfigsCount} entry type configs preserved (system configuration)`);

  const referenceNumberConfigsCount = await prisma.referenceNumberConfig.count();
  console.log(`   ✅ ${referenceNumberConfigsCount} reference number configs preserved (system configuration)`);

  const periodLockoutsCount = await prisma.periodLockout.count();
  console.log(`   ✅ ${periodLockoutsCount} period lockouts preserved (system configuration)`);

  const accountingPeriodsCount = await prisma.accountingPeriod.count();
  console.log(`   ✅ ${accountingPeriodsCount} accounting periods preserved (system configuration)`);
}

async function main() {
  try {
    await cleanupNonEssentialData();
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

