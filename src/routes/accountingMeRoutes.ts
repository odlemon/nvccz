// @ts-nocheck
/** GET /api/accounting/me: which Accounting permissions the signed-in user holds, so screens show only the actions the
 *  server will accept. Exempt from the general Accounting access guard (ACCOUNTING_EXEMPT) on purpose: someone who
 *  holds only a narrow key such as accounting.timesheets.view needs this to learn that, and would otherwise be refused
 *  by the guard before ever reaching it — every other route still requires the key it actually needs; this one only
 *  discloses which keys the caller holds, which is not privileged. Portal accounts are excluded here instead.
 *  GET /api/accounting/me/counts: what is waiting for this user, per sidebar item — counted from the records, never
 *  from the screen's own copies. */
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { userHasEffectivePermission } from "../config/cfoModulePermissions";
import { ACC } from "../config/accountingAccess";
import { isExternalPortalUser } from "../utils/portalAuth";
import { prisma } from "../utils/database";

const router = express.Router();
router.use(authenticate);
router.use((req: any, res: any, next: any) => (isExternalPortalUser(req.user) ? res.status(403).json({ success: false, message: "Not available to portal accounts." }) : next()));
router.get("/", (req: any, res: any) => {
  const user = req.user;
  const keys = [...Object.values(ACC), "accounting.timesheets.view", "accounting.timesheets.manage"].filter((k) => userHasEffectivePermission(user, k));
  res.json({ success: true, data: { userId: user.id, roleCode: user.role?.code || user.roleCode || null, keys } });
});

router.get("/counts", async (req: any, res: any) => {
  try {
    const user = req.user;
    const can = (k) => userHasEffectivePermission(user, k);
    const now = new Date();
    const safe = (p) => p.catch(() => null);
    const [myApprovals, drafts, myDrafts, overdueAr, dueAp, staleBanks, stiDrafts, stiPlacements] = await Promise.all([
      // approvals assigned to this person that are still waiting on them
      safe(prisma.approval.count({ where: { approverId: user.id, status: "PENDING", request: { status: "PENDING" } } })),
      can(ACC.LEDGER_POST) ? safe(prisma.journalEntry.count({ where: { status: "PENDING", NOT: { createdById: user.id } } })) : null,
      safe(prisma.journalEntry.count({ where: { status: "PENDING", createdById: user.id } })),
      safe(prisma.invoice.count({ where: { status: { in: ["SENT", "PARTIALLY_PAID", "OVERDUE"] }, dueDate: { lt: now } } })),
      safe(prisma.purchaseInvoice.count({ where: { paymentStatus: { not: "PAID" }, status: { in: ["APPROVED", "POSTED", "BILLED"] }, dueDate: { lte: new Date(now.getTime() + 7 * 86400000) } } })),
      // bank accounts with unreconciled entries and no reconciliation finished in the last 35 days
      safe((async () => {
        const banks = await prisma.bank.findMany({ where: { isActive: true }, select: { id: true } });
        let n = 0;
        for (const b of banks) {
          const open = await prisma.cashbookEntry.count({ where: { bankId: b.id, status: "POSTED", isReconciled: false } });
          if (!open) continue;
          const last = await prisma.cashbookReconciliationSession.findFirst({ where: { bankId: b.id, status: "FINALIZED" }, orderBy: { statementDate: "desc" }, select: { statementDate: true } });
          if (!last || now.getTime() - last.statementDate.getTime() > 35 * 86400000) n++;
        }
        return n;
      })()),
      can(ACC.TREASURY_APPROVE) ? safe(prisma.shortTermInvestmentAccrual.count({ where: { status: "PENDING_POST", instrument: { status: "ACTIVE" } } })) : null,
      user.role?.code === "CFO" || user.roleCode === "CFO" ? safe(prisma.approvalRequest.count({ where: { stageType: "INVESTMENT_BOOKING", status: "PENDING" } })) : null,
    ]);
    // the month being closed: last month while its ledger is open, otherwise this month
    let closeOpen = null;
    try {
      const periods = await prisma.fiscalPeriod.findMany({ where: { startDate: { lte: now } }, orderBy: { startDate: "desc" }, take: 2, include: { moduleLocks: { where: { moduleCode: "GL" } } } });
      const [cur, prev] = periods;
      const target = prev && !(prev.moduleLocks[0] && prev.moduleLocks[0].lockStatus !== "OPEN") ? prev : cur;
      if (target) closeOpen = await prisma.accountingCloseTask.count({ where: { fiscalPeriodId: target.id, status: { not: "COMPLETE" } } });
    } catch { /* no calendar */ }
    res.json({
      success: true,
      data: {
        approvals: (myApprovals || 0) + (drafts || 0),
        journals: drafts != null ? drafts : myDrafts,
        close: closeOpen,
        reconciliation: staleBanks,
        receivables: overdueAr,
        payables: dueAp,
        investments: stiDrafts != null || stiPlacements != null ? (stiDrafts || 0) + (stiPlacements || 0) : null,
        claims: await safe((async () => { const { ExpenseClaimService } = await import("../services/ExpenseClaimService"); return (await ExpenseClaimService.list(user, "waiting")).length; })()),
      },
    });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e?.message || "Failed to count" });
  }
});
/** GET /api/accounting/me/queue: everything waiting on this user in Accounting, one list. Approval requests assigned to
 *  them (payments, investment bookings, chart-of-accounts changes, …) and, for someone who may post, draft journals
 *  prepared by others — each labelled with the record it was raised for, and whether it is posted here or where it
 *  was raised (an invoice or credit note is posted by sending it). */
const STAGE_LABEL = { PAYMENT_EXECUTION: "Payment", INVESTMENT_BOOKING: "Investment placement", MASTER_DATA_COA: "Chart of accounts change", PURCHASE_REQUISITION: "Purchase requisition", PURCHASE_ORDER: "Purchase order", INVOICE: "Supplier invoice", GRN: "Goods received", AWARD_RECOMMENDATION: "Tender award" };
const ACCOUNTING_STAGES = new Set(["PAYMENT_EXECUTION", "INVESTMENT_BOOKING", "MASTER_DATA_COA"]);
router.get("/queue", async (req: any, res: any) => {
  try {
    const user = req.user;
    const items: any[] = [];
    const approvals = await prisma.approval.findMany({
      where: { approverId: user.id, status: "PENDING", request: { status: "PENDING" } },
      include: { request: { include: { requestedBy: { select: { firstName: true, lastName: true, email: true } } } }, stage: { select: { stepNumber: true, stepName: true } } },
      orderBy: { createdAt: "asc" },
      take: 200,
    }).catch(() => []);
    for (const a of approvals) {
      const r = a.request, d = (r.entityData || {}) as any;
      const who = r.requestedBy ? [r.requestedBy.firstName, r.requestedBy.lastName].filter(Boolean).join(" ") || r.requestedBy.email : null;
      const amount = d.principal ?? d.amount ?? d.totalAmount ?? d.paymentAmount ?? null;
      items.push({
        kind: "approval", id: a.id, stageType: r.stageType, label: STAGE_LABEL[r.stageType] || r.stageType,
        title: d.name || d.vendorName || d.accountName || d.description || r.entityId, amount: amount != null ? Number(amount) : null, currency: d.currencyCode || null,
        requestedBy: who, requestedAt: r.requestDate, step: a.stage ? `${a.stage.stepName || "Step"} ${a.stage.stepNumber}` : null,
        where: ACCOUNTING_STAGES.has(r.stageType) ? "here" : "procurement",
      });
    }
    if (userHasEffectivePermission(user, ACC.LEDGER_POST)) {
      const drafts = await prisma.journalEntry.findMany({
        where: { status: "PENDING", NOT: { createdById: user.id } },
        select: { id: true, referenceNumber: true, description: true, totalAmount: true, transactionDate: true, createdAt: true, currencyId: true, createdBy: { select: { firstName: true, lastName: true, email: true } } },
        orderBy: { createdAt: "asc" },
        take: 300,
      });
      // currency codes looked up separately: a journal whose currency row is missing must not break the queue
      const codes = new Map((await prisma.currency.findMany({ select: { id: true, code: true } })).map((c) => [c.id, c.code]));
      const { default: JournalEntryService } = await import("../services/JournalEntryService");
      for (const j of drafts) {
        const source = await JournalEntryService.journalSourceOf(j.id).catch(() => null);
        const sentBy = source === "a customer invoice" || source === "a credit note";
        items.push({
          kind: "journal", id: j.id, label: source ? source.replace(/^an? /, "").replace(/^./, (c) => c.toUpperCase()) : "Manual journal", title: j.description, reference: j.referenceNumber,
          amount: Number(j.totalAmount), currency: codes.get(j.currencyId) || null, date: j.transactionDate, requestedAt: j.createdAt,
          requestedBy: j.createdBy ? [j.createdBy.firstName, j.createdBy.lastName].filter(Boolean).join(" ") || j.createdBy.email : null,
          where: sentBy ? "receivables" : "here",
        });
      }
    }
    res.json({ success: true, data: items });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e?.message || "Failed to build the queue" });
  }
});

export default router;
