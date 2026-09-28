// @ts-nocheck
/** GET /api/cashbook/position — each active bank account: the cashbook balance (posted receipts − payments), the ledger
 *  balance of its bank GL account (posted journals, voided pairs left out as in the reports), the difference between the
 *  two (a posting to the bank account that has no cashbook line), this month's money in and out, entries waiting to be
 *  posted, and what is not reconciled. Read by the Cashbook page. */
import { Response } from "express";
import { AuthRequest } from "../middleware/authenticate";
import { prisma } from "../utils/database";
import { buildJournalEntryWhereForGlReporting } from "../utils/journalEntryReportingFilter";

const n = (v: any) => (v == null ? 0 : Number(v.toString()) || 0);
const r2 = (x: number) => Math.round(x * 100) / 100;

export const CashbookPositionController = {
  async position(req: AuthRequest, res: Response) {
    try {
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      // through the end of today: an entry dated today is stored at noon UTC
      const { default: FiscalCalendarService } = await import("../services/FiscalCalendarService");
      const tz = await FiscalCalendarService.getFiscalTimezone().catch(() => "Africa/Harare");
      const [ty, tm, td] = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now).split("-").map(Number);
      const upto = new Date(Date.UTC(ty, tm - 1, td, 23, 59, 59, 999));
      const banks = await prisma.bank.findMany({ where: { isActive: true }, select: { id: true, name: true, accountNumber: true, glAccountId: true, currency: { select: { id: true, code: true } }, glAccount: { select: { accountNo: true, accountName: true } } }, orderBy: { name: "asc" } });
      const rows = await Promise.all(banks.map(async (b) => {
        const [byType, month, pending, unrec, ledger] = await Promise.all([
          prisma.cashbookEntry.groupBy({ by: ["type"], where: { bankId: b.id, status: "POSTED", transactionDate: { lte: upto } }, _sum: { amount: true } }),
          prisma.cashbookEntry.groupBy({ by: ["type"], where: { bankId: b.id, status: "POSTED", transactionDate: { gte: monthStart, lte: upto } }, _sum: { amount: true }, _count: { _all: true } }),
          prisma.cashbookEntry.count({ where: { bankId: b.id, status: "PENDING" } }),
          prisma.cashbookEntry.count({ where: { bankId: b.id, status: "POSTED", isReconciled: false } }),
          b.glAccountId
            ? prisma.journalEntryLine.aggregate({ where: { chartOfAccountId: b.glAccountId, journalEntry: buildJournalEntryWhereForGlReporting({ lte: upto }) }, _sum: { debitAmount: true, creditAmount: true } })
            : null,
        ]);
        const sum = (arr, t) => n(arr.find((g) => g.type === t)?._sum?.amount);
        const cashbook = r2(sum(byType, "RECEIPT") - sum(byType, "PAYMENT"));
        const ledgerBal = ledger ? r2(n(ledger._sum.debitAmount) - n(ledger._sum.creditAmount)) : null;
        return {
          bank: { id: b.id, name: b.name, accountNumber: b.accountNumber, currency: b.currency?.code || null, glAccount: b.glAccount ? `${b.glAccount.accountNo} ${b.glAccount.accountName}` : null },
          cashbookBalance: cashbook,
          ledgerBalance: ledgerBal,
          difference: ledgerBal == null ? null : r2(ledgerBal - cashbook),
          thisMonth: { receipts: r2(sum(month, "RECEIPT")), payments: r2(sum(month, "PAYMENT")), entries: month.reduce((t, g) => t + g._count._all, 0) },
          pendingEntries: pending,
          unreconciledEntries: unrec,
        };
      }));
      res.json({ success: true, data: rows });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e?.message || "Failed to read the cash position" });
    }
  },
};
