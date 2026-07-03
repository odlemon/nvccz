// @ts-nocheck
import { createHash } from "crypto";
import { prisma } from "../../utils/database";
import { JournalEntryService } from "../JournalEntryService";

export class DealExecutionPackGlPostingService {
  private static async getDefaultCurrencyId(): Promise<string> {
    const currency = await prisma.currency.findFirst({ where: { isDefault: true } });
    if (currency) return currency.id;
    const fallback = await prisma.currency.findFirst();
    if (!fallback) throw new Error("No currencies configured");
    return fallback.id;
  }

  static async postInvestment(args: {
    packId: string;
    portfolioCompanyName: string;
    amount: number;
    createdById: string;
    effectiveDate?: Date;
  }): Promise<string> {
    const amt = Number(args.amount);
    if (!amt || amt <= 0) {
      throw new Error("Investment amount must be positive to post GL entry");
    }

    const accountNos = ["1502", "1000"];
    const accounts = await prisma.chartOfAccounts.findMany({
      where: { accountNo: { in: accountNos }, isActive: true },
      select: { id: true, accountNo: true },
    });
    const byNo = new Map(accounts.map((a) => [a.accountNo, a.id]));
    const missing = accountNos.filter((n) => !byNo.has(n));
    if (missing.length) {
      throw new Error(`Unknown/inactive account codes: ${missing.join(", ")}`);
    }

    const currencyId = await DealExecutionPackGlPostingService.getDefaultCurrencyId();
    const dateIso = (args.effectiveDate ?? new Date()).toISOString().slice(0, 10);

    const result = await JournalEntryService.createManualJournalEntry({
      transactionDate: new Date(dateIso),
      referenceNumber: `DEP-EXEC-${args.packId.slice(0, 8).toUpperCase()}`,
      description: `Portfolio investment — ${args.portfolioCompanyName}`,
      currencyId,
      journalEntryLines: [
        {
          chartOfAccountId: byNo.get("1502")!,
          debitAmount: amt,
          creditAmount: 0,
          description: "Investment asset — portfolio",
        },
        {
          chartOfAccountId: byNo.get("1000")!,
          debitAmount: 0,
          creditAmount: amt,
          description: "Cash — bank operating",
        },
      ],
      createdById: args.createdById,
    });

    return result.id;
  }
}
