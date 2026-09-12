// @ts-nocheck
import { prisma } from "../../utils/database";
import { JournalEntryService } from "../JournalEntryService";

export class CapTableGlPostingService {
  private static async getDefaultCurrencyId(): Promise<string> {
    const currency = await prisma.currency.findFirst({ where: { isDefault: true } });
    if (currency) return currency.id;
    const fallback = await prisma.currency.findFirst();
    if (!fallback) throw new Error("No currencies configured");
    return fallback.id;
  }

  private static async resolveAccountCodes(registryId: string) {
    const mapping = await prisma.capTableGlMapping.findUnique({ where: { registryId } });
    return {
      cash: mapping?.cashAccountCode ?? "1010",
      shareCapital: mapping?.shareCapitalAccountCode ?? "3000",
      sharePremium: mapping?.sharePremiumAccountCode ?? "3050",
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
    if (accountNos.includes("1000")) {
      throw new Error("Invalid accountCode: 1000 is a reporting bucket");
    }
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
        description: l.description || args.description,
      })),
      createdById: args.createdById,
    } as any);

    if (!result?.success || !result?.journalEntry?.id) {
      throw new Error(result?.message || "Failed to create journal entry");
    }
    return result.journalEntry.id;
  }

  static async postIssuance(args: {
    userId: string;
    portfolioCompanyId: string;
    registryId: string;
    quantity: number;
    pricePerShare: number;
    parValue: number;
    issuanceDate: Date;
    referenceNumber: string;
    description: string;
  }): Promise<string> {
    const codes = await CapTableGlPostingService.resolveAccountCodes(args.registryId);
    const currencyId = await CapTableGlPostingService.getDefaultCurrencyId();
    const n = args.quantity;
    const cash = n * args.pricePerShare;
    const par = n * args.parValue;
    const premium = Math.max(0, cash - par);
    const txDate = args.issuanceDate.toISOString().slice(0, 10);

    return CapTableGlPostingService.createJournalEntryFromAccountCodes({
      createdById: args.userId,
      transactionDateIso: txDate,
      description: args.description,
      currencyId,
      referenceNumber: args.referenceNumber,
      lines: [
        { accountCode: codes.cash, debitAmount: cash, creditAmount: 0, description: "Cash — stock issuance" },
        { accountCode: codes.shareCapital, debitAmount: 0, creditAmount: par, description: "Share capital — par" },
        {
          accountCode: codes.sharePremium,
          debitAmount: 0,
          creditAmount: premium,
          description: "Share premium — excess over par",
        },
      ],
    });
  }
}
