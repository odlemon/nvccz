// @ts-nocheck
import { prisma } from "../utils/database";

function isMissingTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("does not exist in the current database") ||
    message.includes("P2021")
  );
}

async function runIgnoringMissingTable(operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    if (!isMissingTableError(error)) throw error;
  }
}

/** Prisma delegates + user FK fields to reassign before hard-deleting a user. */
const USER_REFERENCE_UPDATES: Array<{ model: string; field: string }> = [
  { model: "journalEntry", field: "createdById" },
  { model: "recurringJournalTemplate", field: "createdById" },
  { model: "expense", field: "createdById" },
  { model: "revenue", field: "createdById" },
  { model: "invoice", field: "createdById" },
  { model: "invoice", field: "approvedById" },
  { model: "bankReconciliation", field: "createdById" },
  { model: "reconciliationResult", field: "createdById" },
  { model: "reconciliationAuditTrail", field: "createdById" },
  { model: "cashbookEntry", field: "createdById" },
  { model: "cashbookEntry", field: "postedById" },
  { model: "cashbookEntry", field: "reversedById" },
  { model: "auditLog", field: "userId" },
  { model: "document", field: "uploadedById" },
  { model: "forecastEntity", field: "createdById" },
  { model: "forecastScenario", field: "createdById" },
  { model: "forecastScenario", field: "lockedById" },
  { model: "forecastCell", field: "editedById" },
  { model: "forecastVersion", field: "lockedById" },
  { model: "forecastAuditLog", field: "userId" },
  { model: "capitalCall", field: "createdById" },
  { model: "managementFeePeriod", field: "createdById" },
  { model: "distribution", field: "createdById" },
  { model: "portfolioCompanyDividend", field: "approvedById" },
  { model: "procurementInvoice", field: "createdById" },
  { model: "procurementInvoice", field: "approvedById" },
  { model: "purchaseInvoice", field: "createdById" },
  { model: "purchaseInvoicePayment", field: "createdById" },
  { model: "purchaseOrder", field: "createdById" },
  { model: "purchaseOrder", field: "approvedById" },
  { model: "purchaseOrder", field: "sentById" },
  { model: "purchaseRequisition", field: "requestedById" },
  { model: "purchaseRequisition", field: "approvedById" },
  { model: "procurementRfq", field: "createdById" },
  { model: "vendorQuotation", field: "reviewedById" },
  { model: "goodsReceivedNote", field: "receivedById" },
  { model: "goodsReceivedNote", field: "approvedById" },
  { model: "grnReturnToVendor", field: "createdById" },
  { model: "vendorInvoiceIntake", field: "createdById" },
  { model: "vendorInvoiceFieldCorrection", field: "createdById" },
  { model: "vendorDocumentAttachment", field: "uploadedById" },
  { model: "vendorDocumentAttachment", field: "deletedById" },
  { model: "stockMovement", field: "createdById" },
  { model: "asset", field: "createdById" },
  { model: "depreciationRecord", field: "createdById" },
  { model: "assetDisposalRecord", field: "createdById" },
  { model: "creditNote", field: "createdById" },
  { model: "statementOfAccount", field: "generatedById" },
  { model: "exchangeRate", field: "createdById" },
  { model: "forexGainLoss", field: "createdById" },
  { model: "payrollRun", field: "createdById" },
  { model: "payrollRun", field: "approvedById" },
  { model: "payrollRun", field: "submittedById" },
  { model: "taxRules", field: "createdById" },
  { model: "allowanceTypes", field: "createdById" },
  { model: "deductionTypes", field: "createdById" },
  { model: "bankFileTemplate", field: "createdById" },
  { model: "employee", field: "lineManagerUserId" },
  { model: "employeeChangeRequest", field: "makerUserId" },
  { model: "employeeChangeRequest", field: "checkerUserId" },
  { model: "employeeCertification", field: "verifiedById" },
  { model: "performanceGoal", field: "assignedToId" },
  { model: "performanceGoal", field: "createdById" },
  { model: "performanceGoalProgressEvent", field: "createdById" },
  { model: "performanceContract", field: "subjectUserId" },
  { model: "performanceContract", field: "reviewerUserId" },
  { model: "performanceContract", field: "approverUserId" },
  { model: "performanceContract", field: "createdById" },
  { model: "performanceScorecard", field: "subjectUserId" },
  { model: "performanceScorecard", field: "generatedById" },
  { model: "performanceScorecard", field: "finalisedById" },
  { model: "performanceReview", field: "revieweeId" },
  { model: "performanceReview", field: "reviewerId" },
  { model: "performanceReviewFeedback", field: "feedbackProviderId" },
  { model: "performanceReviewCycle", field: "createdById" },
  { model: "task", field: "createdBy" },
  { model: "termSheet", field: "createdById" },
  { model: "termSheet", field: "applicantSignedById" },
  { model: "termSheet", field: "investorSignedById" },
  { model: "dueDiligenceReview", field: "reviewerId" },
  { model: "boardReview", field: "reviewerId" },
  { model: "investmentValuationEvent", field: "createdById" },
  { model: "investmentExitEvent", field: "recordedById" },
  { model: "fundDisbursement", field: "approvedById" },
  { model: "fundDisbursement", field: "disbursedById" },
  { model: "fund", field: "createdById" },
  { model: "target", field: "createdById" },
  { model: "stakeholder", field: "relationshipManagerId" },
  { model: "stakeholderOnboarding", field: "initiatedBy" },
  { model: "stakeholderOnboarding", field: "assignedTo" },
  { model: "stakeholderEngagement", field: "initiatedBy" },
  { model: "reportTemplate", field: "createdBy" },
  { model: "varianceReport", field: "preparedBy" },
  { model: "varianceReport", field: "approvedBy" },
  { model: "turnoverAnalysisReport", field: "preparedBy" },
  { model: "turnoverAnalysisReport", field: "approvedBy" },
  { model: "dealSourcingGoal", field: "assignedToId" },
  { model: "dealSourcingGoal", field: "createdById" },
  { model: "dealProgress", field: "assignedToId" },
  { model: "dealProgress", field: "managerId" },
  { model: "dealProgressUpdate", field: "userId" },
  { model: "researchReport", field: "assignedToId" },
  { model: "researchReport", field: "createdById" },
  { model: "researchReportActivity", field: "userId" },
  { model: "riskAssessment", field: "assignedToId" },
  { model: "riskAssessment", field: "createdById" },
  { model: "budget", field: "createdById" },
  { model: "budgetItem", field: "createdById" },
  { model: "portfolioValuation", field: "assignedToId" },
  { model: "portfolioValuation", field: "createdById" },
  { model: "portfolioValuationActivity", field: "userId" },
  { model: "exitInterview", field: "conductedById" },
  { model: "event", field: "budgetApprovedBy" },
  { model: "eventGuest", field: "checkedInBy" },
  { model: "eventBudgetItem", field: "approvedBy" },
  { model: "eventExpense", field: "approvedBy" },
  { model: "eventCheckIn", field: "checkedInBy" },
  { model: "eventReport", field: "generatedBy" },
  { model: "application", field: "assignedAnalystId" },
  { model: "investmentImplementation", field: "initiatedById" },
  { model: "cashbookTemplate", field: "createdById" },
  { model: "bankStatement", field: "reconciledById" },
  { model: "reconciliationMismatch", field: "resolvedById" },
  { model: "contraEntryConfig", field: "createdById" },
  { model: "contraEntry", field: "createdById" },
  { model: "cashbookImportBatch", field: "createdById" },
  { model: "cashbookBatch", field: "createdById" },
  { model: "accountingPeriod", field: "lockedById" },
  { model: "cashbookEntryTypeConfig", field: "createdById" },
  { model: "cashbookEntryTypeConfig", field: "updatedById" },
  { model: "cashbookTransfer", field: "createdById" },
  { model: "cashbookTransfer", field: "postedById" },
  { model: "periodLockout", field: "lockedById" },
  { model: "periodLockout", field: "createdById" },
  { model: "cashbookReconciliationSession", field: "createdById" },
  { model: "cashbookReconciliationSession", field: "finishedById" },
  { model: "procurementApprovalConfig", field: "createdById" },
  { model: "procurementApprovalStage", field: "userId" },
  { model: "approvalRequest", field: "requestedById" },
  { model: "rfqClarification", field: "userId" },
  { model: "shortTermInvestmentInstrument", field: "createdById" },
  { model: "shortTermInvestmentInstrument", field: "voidedById" },
  { model: "shortTermInvestmentApyRate", field: "createdById" },
  { model: "modulePeriodLock", field: "updatedById" },
  { model: "periodLockDraft", field: "updatedById" },
  { model: "periodLockAuditLog", field: "performedById" },
  { model: "bscBudgetVarianceReport", field: "submittedById" },
  { model: "bscStatutorySubmission", field: "submittedById" },
  { model: "bscStatutorySubmission", field: "managerSignOffById" },
  { model: "newsletterAudienceConfig", field: "updatedById" },
  { model: "activityLog", field: "userId" }
];

const BLOCKER_CHECKS: Array<{ label: string; count: (userId: string) => Promise<number> }> = [
  { label: "journal entries", count: (id) => prisma.journalEntry.count({ where: { createdById: id } }) },
  { label: "expenses", count: (id) => prisma.expense.count({ where: { createdById: id } }) },
  { label: "invoices", count: (id) => prisma.invoice.count({ where: { createdById: id } }) },
  { label: "revenues", count: (id) => prisma.revenue.count({ where: { createdById: id } }) },
  { label: "cashbook entries", count: (id) => prisma.cashbookEntry.count({ where: { createdById: id } }) },
  { label: "payroll runs", count: (id) => prisma.payrollRun.count({ where: { createdById: id } }) },
  { label: "purchase orders", count: (id) => prisma.purchaseOrder.count({ where: { createdById: id } }) },
  {
    label: "procurement approvals",
    count: (id) => prisma.approval.count({ where: { OR: [{ approverId: id }, { delegatedToId: id }] } })
  }
];

function formatBlockerList(parts: string[]): string {
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

export async function getUserDeleteBlockers(userId: string) {
  const results = await Promise.all(
    BLOCKER_CHECKS.map(async (check) => {
      try {
        return { label: check.label, count: await check.count(userId) };
      } catch (error) {
        if (isMissingTableError(error)) return { label: check.label, count: 0 };
        throw error;
      }
    })
  );
  return results.filter((r) => r.count > 0);
}

export async function resolveAdminReassignTarget(excludeUserId: string) {
  const admin = await prisma.user.findFirst({
    where: {
      id: { not: excludeUserId },
      role: { name: "admin" }
    },
    select: { id: true, firstName: true, lastName: true, email: true },
    orderBy: { createdAt: "asc" }
  });

  if (!admin) {
    throw new Error("No admin user available to receive reassigned records");
  }

  return admin;
}

export async function reassignUserReferences(fromUserId: string, toUserId: string) {
  if (fromUserId === toUserId) {
    throw new Error("Cannot reassign user references to the same user");
  }

  const target = await prisma.user.findUnique({
    where: { id: toUserId },
    select: { id: true, firstName: true, lastName: true, email: true }
  });
  if (!target) {
    throw new Error("Admin user for reassignment not found");
  }

  for (const { model, field } of USER_REFERENCE_UPDATES) {
    const delegate = prisma[model];
    if (!delegate?.updateMany) continue;
    await runIgnoringMissingTable(() =>
      delegate.updateMany({
        where: { [field]: fromUserId },
        data: { [field]: toUserId }
      })
    );
  }

  await runIgnoringMissingTable(() => prisma.approval.deleteMany({ where: { approverId: fromUserId } }));
  await runIgnoringMissingTable(() =>
    prisma.approval.updateMany({
      where: { delegatedToId: fromUserId },
      data: { delegatedToId: null }
    })
  );

  return target;
}

/** Delete user row; falls back to raw SQL when Prisma relation checks hit unmigrated tables. */
export async function deleteUserRecord(userId: string) {
  try {
    await prisma.user.delete({ where: { id: userId } });
  } catch (error) {
    if (!isMissingTableError(error)) throw error;
    await prisma.$executeRawUnsafe("DELETE FROM users WHERE id = ?", userId);
  }
}

export function formatReassignedRecordsMessage(
  blockers: Array<{ label: string; count: number }>,
  admin: { firstName: string; lastName: string }
): string {
  if (blockers.length === 0) {
    return "User deleted successfully";
  }
  const parts = blockers.map((b) => `${b.count} ${b.label}`);
  const adminName = `${admin.firstName} ${admin.lastName}`.trim();
  return `User deleted successfully. ${formatBlockerList(parts)} reassigned to admin ${adminName}.`;
}
