// @ts-nocheck
import { prisma } from "../../utils/database";
import { JournalEntryService } from "../JournalEntryService";

export class FundraisingGlPostingService {
  private static async getDefaultCurrencyId(): Promise<string> {
    const currency = await prisma.currency.findFirst({ where: { isDefault: true } });
    if (currency) return currency.id;
    const fallback = await prisma.currency.findFirst();
    if (!fallback) throw new Error("No currencies configured");
    return fallback.id;
  }

  private static async resolveAccountCodes(campaignId: string) {
    const mapping = await prisma.fundraisingCampaignGlMapping.findUnique({ where: { campaignId } });
    return {
      receivable: mapping?.receivableAccountCode ?? "1125",
      committedCapital: mapping?.committedCapitalAccountCode ?? "3010",
    };
  }

  private static async createJournalEntryFromAccountCodes(args: {
    createdById: string;
    transactionDateIso: string;
    description: string;
    currencyId: string;
    referenceNumber: string;
    lines: Array<{ accountCode: string; debitAmount: number; creditAmount: number; description?: string }>;
  }): Promise<string> {
    const accountNos = [...new Set(args.lines.map((l) => l.accountCode))];
    const accounts = await prisma.chartOfAccounts.findMany({
      where: { accountNo: { in: accountNos }, isActive: true },
      select: { id: true, accountNo: true },
    });
    const byNo = new Map(accounts.map((a) => [a.accountNo, a.id]));
    const missing = accountNos.filter((n) => !byNo.has(n));
    if (missing.length) throw new Error(`Unknown/inactive account codes: ${missing.join(", ")}`);

    const result = await JournalEntryService.createManualJournalEntry({
      transactionDate: new Date(args.transactionDateIso),
      referenceNumber: args.referenceNumber,
      description: args.description,
      currencyId: args.currencyId,
      journalEntryLines: args.lines.map((l) => ({
        chartOfAccountId: byNo.get(l.accountCode)!,
        debitAmount: l.debitAmount,
        creditAmount: l.creditAmount,
        description: l.description,
      })),
      createdById: args.createdById,
    });
    return result.id;
  }

  static async postCommitment(args: {
    campaignId: string;
    dealId: string;
    clientName: string;
    amount: number;
    createdById: string;
    effectiveDate?: Date;
  }): Promise<string> {
    const codes = await FundraisingGlPostingService.resolveAccountCodes(args.campaignId);
    const currencyId = await FundraisingGlPostingService.getDefaultCurrencyId();
    const amt = Number(args.amount);
    const dateIso = (args.effectiveDate ?? new Date()).toISOString().slice(0, 10);

    return FundraisingGlPostingService.createJournalEntryFromAccountCodes({
      createdById: args.createdById,
      transactionDateIso: dateIso,
      description: `LP commitment — ${args.clientName}`,
      currencyId,
      referenceNumber: `FR-COMMIT-${args.dealId.slice(0, 8).toUpperCase()}`,
      lines: [
        {
          accountCode: codes.receivable,
          debitAmount: amt,
          creditAmount: 0,
          description: "LP commitment receivable",
        },
        {
          accountCode: codes.committedCapital,
          debitAmount: 0,
          creditAmount: amt,
          description: "Committed capital",
        },
      ],
    });
  }
}
