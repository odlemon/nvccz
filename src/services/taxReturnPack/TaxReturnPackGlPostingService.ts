// @ts-nocheck
import { prisma } from "../../utils/database";
import { JournalEntryService } from "../JournalEntryService";

export class TaxReturnPackGlPostingService {
  private static async getDefaultCurrencyId(): Promise<string> {
    const currency = await prisma.currency.findFirst({ where: { isDefault: true } });
    if (currency) return currency.id;
    const fallback = await prisma.currency.findFirst();
    if (!fallback) throw new Error("No currencies configured");
    return fallback.id;
  }

  static async postTaxAccrual(args: {
    packId: string;
    entityName: string;
    amount: number;
    createdById: string;
    effectiveDate?: Date;
  }): Promise<string> {
    const amt = Number(args.amount);
    if (!amt || amt <= 0) {
      throw new Error("Tax liability must be positive to post GL entry");
    }

    const accountNos = ["5500", "2210"];
    const accounts = await prisma.chartOfAccounts.findMany({
      where: { accountNo: { in: accountNos }, isActive: true },
      select: { id: true, accountNo: true },
    });
    const byNo = new Map(accounts.map((a) => [a.accountNo, a.id]));
    const missing = accountNos.filter((n) => !byNo.has(n));
    if (missing.length) {
      throw new Error(`Unknown/inactive account codes: ${missing.join(", ")}`);
    }

    const currencyId = await TaxReturnPackGlPostingService.getDefaultCurrencyId();
    const dateIso = (args.effectiveDate ?? new Date()).toISOString().slice(0, 10);

    const result = await JournalEntryService.createManualJournalEntry({
      transactionDate: new Date(dateIso),
      referenceNumber: `TRP-${args.packId.slice(0, 8).toUpperCase()}`,
      description: `Corporate tax accrual — ${args.entityName}`,
      currencyId,
      journalEntryLines: [
        {
          chartOfAccountId: byNo.get("5500")!,
          debitAmount: amt,
          creditAmount: 0,
          description: "Corporate tax expense",
        },
        {
          chartOfAccountId: byNo.get("2210")!,
          debitAmount: 0,
          creditAmount: amt,
          description: "Corporate tax liability — ZIMRA",
        },
      ],
      createdById: args.createdById,
    });

    return result.journalEntry.id;
  }
}
