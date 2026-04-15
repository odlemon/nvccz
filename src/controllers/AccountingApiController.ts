// @ts-nocheck
import { Request, Response } from "express";
import { prisma } from "../utils/database";
import { ResponseHelper } from "../utils/responseHelper";
import JournalEntryService from "../services/JournalEntryService";

type PostJournalEntryBody = {
  date: string; // YYYY-MM-DD
  description: string;
  currencyId?: string;
  totalDebit?: number;
  totalCredit?: number;
  lines: Array<{
    accountCode: string; // chart account number, e.g. "1502"
    debitAmount: number;
    creditAmount: number;
    description?: string;
  }>;
};

export class AccountingApiController {
  static async postJournalEntry(req: Request, res: Response) {
    const user = (req as any).user;
    const userId = user?.id || user?.userId;
    if (!userId) {
      return ResponseHelper.error(res, "Unauthorized", undefined, 401);
    }

    const body = req.body as PostJournalEntryBody;
    if (!body?.date || !body?.description || !Array.isArray(body?.lines) || body.lines.length === 0) {
      return ResponseHelper.error(res, "Invalid payload (date, description, lines[] required)", undefined, 400);
    }

    const txDate = new Date(body.date);
    if (Number.isNaN(txDate.getTime())) {
      return ResponseHelper.error(res, "Invalid date (expected YYYY-MM-DD)", undefined, 400);
    }

    const totalDebitCalc = body.lines.reduce((s, l) => s + Number(l.debitAmount || 0), 0);
    const totalCreditCalc = body.lines.reduce((s, l) => s + Number(l.creditAmount || 0), 0);
    const totalDebit = body.totalDebit ?? totalDebitCalc;
    const totalCredit = body.totalCredit ?? totalCreditCalc;
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return ResponseHelper.error(res, "Journal entry must balance (totalDebit == totalCredit)", undefined, 400);
    }

    const accountNos = [...new Set(body.lines.map((l) => String(l.accountCode)).filter(Boolean))];
    if (accountNos.includes("1000")) {
      return ResponseHelper.error(
        res,
        "Invalid accountCode: 1000 is a reporting bucket and cannot be posted to.",
        undefined,
        400
      );
    }

    for (const [idx, l] of body.lines.entries()) {
      const d = Number(l.debitAmount || 0);
      const c = Number(l.creditAmount || 0);
      if (d < 0 || c < 0) {
        return ResponseHelper.error(res, `Invalid line ${idx + 1}: negative amounts not allowed`, undefined, 400);
      }
      const hasDebit = d > 0;
      const hasCredit = c > 0;
      if ((hasDebit && hasCredit) || (!hasDebit && !hasCredit)) {
        return ResponseHelper.error(
          res,
          `Invalid line ${idx + 1}: each line must have exactly one of debitAmount or creditAmount > 0`,
          undefined,
          400
        );
      }
    }

    const accounts = await prisma.chartOfAccounts.findMany({
      where: { accountNo: { in: accountNos }, isActive: true },
      select: { id: true, accountNo: true },
    });
    const byNo = new Map(accounts.map((a) => [a.accountNo, a.id]));

    const missing = accountNos.filter((n) => !byNo.has(n));
    if (missing.length > 0) {
      return ResponseHelper.error(res, `Unknown/Inactive accountCode(s): ${missing.join(", ")}`, undefined, 400);
    }

    const currencyId =
      body.currencyId ||
      (await prisma.currency.findFirst({ where: { isDefault: true }, select: { id: true } }))?.id ||
      (await prisma.currency.findFirst({ select: { id: true } }))?.id;
    if (!currencyId) {
      return ResponseHelper.error(res, "No currency configured", undefined, 500);
    }

    const result = await JournalEntryService.createManualJournalEntry({
      transactionDate: txDate,
      referenceNumber: `API-${Date.now()}`,
      description: body.description,
      currencyId,
      journalEntryLines: body.lines.map((l) => ({
        chartOfAccountId: byNo.get(String(l.accountCode))!,
        debitAmount: Number(l.debitAmount || 0),
        creditAmount: Number(l.creditAmount || 0),
        description: l.description || body.description,
      })),
      createdById: userId,
    } as any);

    if (!result?.success || !result?.journalEntry) {
      return ResponseHelper.error(res, result?.error || "Failed to post journal entry", undefined, 500);
    }

    return ResponseHelper.success(
      res,
      "Journal entry posted",
      {
        accountingJEId: result.journalEntry.id,
        journalEntryId: result.journalEntry.id,
        referenceNumber: result.journalEntry.referenceNumber,
      },
      201
    );
  }
}

