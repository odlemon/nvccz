// @ts-nocheck
/** Bank reconciliation workbench endpoints (mounted under /api/cashbook/reconciliation; writes need bank_reconciliation
 *  through the Accounting access guard; reopening also needs manage_ledger). See BankReconciliationWorkbenchService. */
import { Response } from "express";
import { AuthRequest } from "../middleware/authenticate";
import { prisma } from "../utils/database";
import { userHasEffectivePermission } from "../config/cfoModulePermissions";
import { BankReconciliationWorkbenchService as W } from "../services/BankReconciliationWorkbenchService";

const run = (fn) => async (req: AuthRequest, res: Response) => {
  try {
    res.json({ success: true, data: await fn(req) });
  } catch (e: any) {
    res.status(typeof e?.statusCode === "number" ? e.statusCode : 400).json({ success: false, message: e?.message || "Error" });
  }
};

export const BankReconciliationWorkbenchController = {
  workbench: run((req) => W.workbench(req.params.sessionId)),
  importStatement: run((req) =>
    W.importStatement({
      sessionId: req.params.sessionId,
      userId: req.user.id,
      fileBuffer: req.file ? req.file.buffer : undefined,
      fileName: req.file ? req.file.originalname : null,
      items: req.body?.items,
      openingBalance: req.body?.openingBalance != null && req.body.openingBalance !== "" ? Number(req.body.openingBalance) : null,
      closingBalance: req.body?.closingBalance != null && req.body.closingBalance !== "" ? Number(req.body.closingBalance) : null,
    })
  ),
  autoMatch: run((req) => W.autoMatch(req.params.sessionId, req.user.id)),
  match: run(async (req) => { await W.matchLine(req.params.sessionId, req.params.itemId, String(req.body?.cashbookEntryId || ""), req.user.id); return { matched: true }; }),
  unmatch: run(async (req) => { await W.unmatchLine(req.params.sessionId, req.params.itemId, req.user.id); return { matched: false }; }),
  book: run((req) => W.bookLine(req.params.sessionId, req.params.itemId, { glAccountId: String(req.body?.glAccountId || ""), description: req.body?.description || null, userId: req.user.id })),
  tick: run(async (req) => { await W.tick(req.params.sessionId, String(req.body?.cashbookEntryId || ""), !!req.body?.selected); return { ticked: !!req.body?.selected }; }),
  reopen: run(async (req) => {
    if (!userHasEffectivePermission(req.user, "manage_ledger")) throw Object.assign(new Error("Reopening a finished reconciliation needs an approver (ledger posting authority)."), { statusCode: 403 });
    await W.reopen(req.params.sessionId, req.user.id, req.body?.reason);
    return { reopened: true };
  }),
  /** Each bank: last day reconciled, an open draft, and what is not reconciled yet. */
  status: run(async () => {
    const banks = await prisma.bank.findMany({ where: { isActive: true }, select: { id: true, name: true, accountNumber: true, currency: { select: { code: true } } }, orderBy: { name: "asc" } });
    return Promise.all(banks.map(async (b) => {
      const [last, draft, open] = await Promise.all([
        prisma.cashbookReconciliationSession.findFirst({ where: { bankId: b.id, status: "FINALIZED" }, orderBy: { statementDate: "desc" }, select: { id: true, statementDate: true, closingBalance: true, finishedAt: true } }),
        prisma.cashbookReconciliationSession.findFirst({ where: { bankId: b.id, status: "DRAFT" }, orderBy: { updatedAt: "desc" }, select: { id: true, statementDate: true, statementEndBalance: true } }),
        prisma.cashbookEntry.groupBy({ by: ["type"], where: { bankId: b.id, status: "POSTED", isReconciled: false }, _count: { _all: true }, _sum: { amount: true } }),
      ]);
      const count = open.reduce((t, g) => t + g._count._all, 0);
      const oldest = count ? await prisma.cashbookEntry.findFirst({ where: { bankId: b.id, status: "POSTED", isReconciled: false }, orderBy: { transactionDate: "asc" }, select: { transactionDate: true } }) : null;
      return {
        bank: b,
        lastReconciled: last ? { sessionId: last.id, statementDate: last.statementDate, closingBalance: last.closingBalance != null ? Number(last.closingBalance) : null, finishedAt: last.finishedAt } : null,
        draft: draft ? { sessionId: draft.id, statementDate: draft.statementDate, statementEndBalance: Number(draft.statementEndBalance) } : null,
        unreconciled: { count, receipts: Number(open.find((g) => g.type === "RECEIPT")?._sum.amount || 0), payments: Number(open.find((g) => g.type === "PAYMENT")?._sum.amount || 0), oldest: oldest ? oldest.transactionDate : null },
      };
    }));
  }),
};
