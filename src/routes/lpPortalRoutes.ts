// @ts-nocheck
import { Router } from "express";
import multer from "multer";
import { authenticate } from "../middleware/authenticate";
import {
  requireLpPortalAccess,
  requireLpManager,
  requireLpSignatory,
  requireGpAdmin,
  requireSysAdmin,
} from "../middleware/lpPortalAuth";
import {
  lpPortalContract,
  lpPortalErrorHandler,
  requireLpPermission,
  requireLpIdempotencyKey,
} from "../middleware/lpPortalFoundation";
import { LpPortalController } from "../controllers/LpPortalController";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.use(authenticate);
router.use(lpPortalContract);

const read = [requireLpPortalAccess];
const signatory = [requireLpPortalAccess, requireLpSignatory];
const manager = [requireLpPortalAccess, requireLpManager];

// Session / dashboard
router.get("/session", ...read, requireLpPermission("lp.portal.access"), LpPortalController.getSession);
router.get("/dashboard", ...read, requireLpPermission("lp.dashboard.view"), LpPortalController.getDashboard);
router.get(
  "/dashboard/actions",
  ...read,
  requireLpPermission("lp.dashboard.view"),
  LpPortalController.getDashboardActions
);
router.get(
  "/dashboard/activity/recent",
  ...read,
  requireLpPermission("lp.activity.view"),
  LpPortalController.getDashboardRecentActivity
);

// Capital calls
router.get(
  "/capital-calls/summary",
  ...read,
  requireLpPermission("lp.capital_calls.view"),
  LpPortalController.capitalCallSummary
);
router.get(
  "/capital-calls",
  ...read,
  requireLpPermission("lp.capital_calls.view"),
  LpPortalController.listCapitalCalls
);
router.get(
  "/capital-calls/:id",
  ...read,
  requireLpPermission("lp.capital_calls.view"),
  LpPortalController.getCapitalCall
);
router.post(
  "/capital-calls/:id/acknowledge",
  ...signatory,
  requireLpPermission("lp.capital_calls.acknowledge"),
  requireLpIdempotencyKey("capital-call-ack"),
  LpPortalController.acknowledgeCapitalCall
);
router.post(
  "/capital-calls/:id/payment-confirmations",
  ...signatory,
  requireLpPermission("lp.capital_calls.upload_payment_confirmation"),
  requireLpIdempotencyKey("capital-call-payment"),
  upload.single("file"),
  LpPortalController.uploadPaymentConfirmation
);
router.get(
  "/capital-calls/:id/notice/download",
  ...read,
  requireLpPermission("lp.capital_calls.download_notice"),
  LpPortalController.downloadCapitalCallNotice
);
router.get(
  "/capital-calls/:id/documents",
  ...read,
  requireLpPermission("lp.capital_calls.view"),
  LpPortalController.listCapitalCallDocuments
);

// Distributions
router.get(
  "/distributions/statement/download",
  ...read,
  requireLpPermission("lp.distributions.download"),
  LpPortalController.downloadDistributionStatement
);
router.get(
  "/distributions",
  ...read,
  requireLpPermission("lp.distributions.view"),
  LpPortalController.listDistributions
);
router.get(
  "/distributions/:id",
  ...read,
  requireLpPermission("lp.distributions.view"),
  LpPortalController.getDistribution
);
router.get(
  "/distributions/:id/download",
  ...read,
  requireLpPermission("lp.distributions.download"),
  LpPortalController.downloadDistribution
);

// Account activity (+ ledger aliases)
router.get(
  "/account-activity",
  ...read,
  requireLpPermission("lp.activity.view"),
  LpPortalController.listAccountActivity
);
router.get(
  "/account-activity/export",
  ...read,
  requireLpPermission("lp.activity.export"),
  LpPortalController.exportAccountActivity
);
router.get("/ledger", ...read, requireLpPermission("lp.activity.view"), LpPortalController.listLedger);
router.get(
  "/ledger/:entryId",
  ...read,
  requireLpPermission("lp.activity.view"),
  LpPortalController.getLedgerEntry
);

// Dealing
router.get("/dealing/overview", ...read, requireLpPermission("lp.dealing.view"), LpPortalController.dealingOverview);
router.get("/dealing/rules", ...read, requireLpPermission("lp.dealing.view"), LpPortalController.dealingRules);
router.get(
  "/dealing/requests",
  ...read,
  requireLpPermission("lp.dealing.view"),
  LpPortalController.listDealingRequests
);
router.post(
  "/dealing/subscriptions/estimate",
  ...read,
  requireLpPermission("lp.dealing.estimate"),
  LpPortalController.estimateSubscription
);
router.post(
  "/dealing/subscriptions",
  ...signatory,
  requireLpPermission("lp.dealing.subscribe"),
  requireLpIdempotencyKey("subscription"),
  upload.single("file"),
  LpPortalController.createSubscription
);
router.post(
  "/dealing/redemptions/estimate",
  ...read,
  requireLpPermission("lp.dealing.estimate"),
  LpPortalController.estimateRedemption
);
router.post(
  "/dealing/redemptions",
  ...signatory,
  requireLpPermission("lp.dealing.redeem"),
  requireLpIdempotencyKey("redemption"),
  LpPortalController.createRedemption
);
router.get(
  "/dealing/bank-accounts",
  ...read,
  requireLpPermission("lp.dealing.view"),
  LpPortalController.listBankAccounts
);

// Performance
router.get(
  "/performance",
  ...read,
  requireLpPermission("lp.performance.view"),
  LpPortalController.getPerformance
);
router.get(
  "/performance/history",
  ...read,
  requireLpPermission("lp.performance.view"),
  LpPortalController.performanceHistory
);
router.get(
  "/performance/benchmarks",
  ...read,
  requireLpPermission("lp.performance.view"),
  LpPortalController.performanceBenchmarks
);
router.get(
  "/performance/by-fund",
  ...read,
  requireLpPermission("lp.performance.view"),
  LpPortalController.performanceByFund
);
router.get(
  "/performance/report/download",
  ...read,
  requireLpPermission("lp.performance.download_report"),
  LpPortalController.downloadPerformanceReport
);
router.post(
  "/jobs/performance-report",
  ...read,
  requireLpPermission("lp.performance.download_report"),
  requireLpIdempotencyKey("perf-report-job"),
  LpPortalController.createPerformanceJob
);
router.get("/jobs/:jobId", ...read, requireLpPermission("lp.portal.access"), LpPortalController.getJob);

// Documents (+ vault aliases)
router.get("/documents", ...read, requireLpPermission("lp.documents.view"), LpPortalController.listDocuments);
router.get("/documents/:id", ...read, requireLpPermission("lp.documents.view"), LpPortalController.getDocument);
router.get(
  "/documents/:id/download",
  ...read,
  requireLpPermission("lp.documents.download"),
  LpPortalController.downloadDocument
);
router.get(
  "/documents/:id/preview",
  ...read,
  requireLpPermission("lp.documents.view"),
  LpPortalController.previewDocument
);
router.get("/vault", ...read, requireLpPermission("lp.documents.view"), LpPortalController.listVault);
router.get(
  "/vault/:documentId/download",
  ...read,
  requireLpPermission("lp.documents.download"),
  LpPortalController.downloadVaultDoc
);
router.get(
  "/vault/:documentId/verify",
  ...read,
  requireLpPermission("lp.documents.view"),
  LpPortalController.verifyVaultDoc
);

// Notices
router.get("/notices", ...read, requireLpPermission("lp.notices.view"), LpPortalController.listNotices);
router.get("/notices/:id", ...read, requireLpPermission("lp.notices.view"), LpPortalController.getNotice);
router.post(
  "/notices/:id/acknowledge",
  ...signatory,
  requireLpPermission("lp.notices.acknowledge"),
  requireLpIdempotencyKey("notice-ack"),
  LpPortalController.acknowledgeNotice
);

// Requests / messages
router.get("/requests", ...read, requireLpPermission("lp.requests.view"), LpPortalController.listRequests);
router.get(
  "/requests/:reference",
  ...read,
  requireLpPermission("lp.requests.view"),
  LpPortalController.getRequest
);
router.post(
  "/requests",
  ...signatory,
  requireLpPermission("lp.requests.create"),
  requireLpIdempotencyKey("service-request"),
  LpPortalController.createRequest
);
router.post(
  "/requests/:reference/messages",
  ...signatory,
  requireLpPermission("lp.messages.reply"),
  LpPortalController.addRequestMessage
);
router.get("/messages", ...read, requireLpPermission("lp.messages.view"), LpPortalController.listMessageThreads);
router.get(
  "/messages/:id",
  ...read,
  requireLpPermission("lp.messages.view"),
  LpPortalController.getMessageThread
);
router.post(
  "/messages/:id/replies",
  ...signatory,
  requireLpPermission("lp.messages.reply"),
  LpPortalController.replyMessageThread
);
router.post(
  "/messages/:id/read",
  ...read,
  requireLpPermission("lp.messages.view"),
  LpPortalController.markThreadRead
);

// Organisation / colleagues / settings
router.get(
  "/organisation",
  ...read,
  requireLpPermission("lp.organisation.view"),
  LpPortalController.getOrganisation
);
router.get(
  "/colleagues",
  ...manager,
  requireLpPermission("lp.organisation.manage_colleagues"),
  LpPortalController.listColleagues
);
router.post(
  "/colleagues",
  ...manager,
  requireLpPermission("lp.organisation.manage_colleagues"),
  requireLpIdempotencyKey("invite-colleague"),
  LpPortalController.inviteColleague
);
router.patch(
  "/colleagues/:membershipId",
  ...manager,
  requireLpPermission("lp.organisation.manage_colleagues"),
  LpPortalController.patchColleague
);
router.patch(
  "/colleagues/:membershipId/revoke",
  ...manager,
  requireLpPermission("lp.organisation.manage_colleagues"),
  LpPortalController.revokeColleague
);
router.get("/settings", ...read, requireLpPermission("lp.settings.view"), LpPortalController.getSettings);
router.patch(
  "/settings/notifications",
  ...read,
  requireLpPermission("lp.settings.view"),
  LpPortalController.patchNotifications
);
router.get(
  "/settings/mfa",
  ...read,
  requireLpPermission("lp.settings.view"),
  LpPortalController.getMfaSettings
);

// Reports (legacy map)
router.get("/reports", ...read, requireLpPermission("lp.documents.view"), LpPortalController.listReports);
router.get(
  "/reports/:jobId/download",
  ...read,
  requireLpPermission("lp.documents.download"),
  LpPortalController.downloadReport
);

// GP admin
router.get("/admin/memberships", requireGpAdmin, LpPortalController.listAdminMemberships);
router.post("/admin/memberships", requireGpAdmin, LpPortalController.createAdminMembership);
router.patch(
  "/admin/memberships/:membershipId/revoke",
  requireGpAdmin,
  LpPortalController.revokeAdminMembership
);
router.post(
  "/admin/documents",
  requireGpAdmin,
  upload.single("file"),
  LpPortalController.publishAdminDocument
);
router.get("/admin/mfa-policy", requireSysAdmin, LpPortalController.getMfaPolicy);
router.put("/admin/mfa-policy", requireSysAdmin, LpPortalController.updateMfaPolicy);

router.use(lpPortalErrorHandler as any);

export default router;
