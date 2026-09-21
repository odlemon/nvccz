/**
 * Adds the chart-of-accounts entries a distribution needs in order to be posted according to what
 * it actually is.
 *
 * Why: `DistributionService.create` originally resolved one account — `4100 Dividend Income` —
 * and debited it for **every** distribution regardless of `source`. A realisation of an investment
 * was therefore booked to dividend income, and so was interest. Two of the SRD's six distribution
 * types (`RETURN_OF_CAPITAL`, `INCOME`) could not be created at all, partly because there was
 * nowhere sensible to post them: a return of contributed capital is not income and must not touch
 * an income account.
 *
 * `3020` (Equity) is what `DistributionService` actually posts to today for `RETURN_OF_CAPITAL` —
 * required for that distribution type to work at all. As of the v3 fix in `DistributionService.ts`
 * (see the `SOURCE_DEBIT_ACCOUNT` comment there), revenue-sourced distributions (DIVIDEND /
 * INTEREST / EXIT_PROCEEDS / REALISATION_PROCEEDS / INCOME / OTHER) debit `3100 Retained Earnings`
 * instead of a per-source revenue account, so `4110`/`4120`/`4130` below are no longer written by
 * `DistributionService` — they're kept here as general-purpose revenue accounts (for whatever
 * eventually records interest/realised-gain/other-investment income itself, the way
 * `PortfolioCompanyAccountingService` already does for dividends via `4100`), not because
 * anything currently posts to them from this flow.
 *
 * Numbers continue the existing series (41xx revenue, 30xx equity) and the naming follows the
 * accounts already present.
 *
 * Idempotent: each account is created only if its number is absent. Nothing is renamed, disabled
 * or repointed, and no journal entries are rewritten — existing postings keep whatever account
 * they were made against.
 *
 * Run with:  npx ts-node scripts/create-distribution-source-accounts.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Spec = {
  accountNo: string;
  accountName: string;
  accountType: string;
  naturalBalance: "DEBIT" | "CREDIT";
  financialStatement: string;
  notes: string;
};

const ACCOUNTS: Spec[] = [
  {
    accountNo: "4110",
    accountName: "Interest Income",
    accountType: "Revenue",
    naturalBalance: "CREDIT",
    financialStatement: "Income Statement",
    notes: "Debited when an LP distribution with source INTEREST is declared (DistributionService).",
  },
  {
    accountNo: "4120",
    accountName: "Realised Gain on Investments",
    accountType: "Revenue",
    naturalBalance: "CREDIT",
    financialStatement: "Income Statement",
    notes:
      "Debited when an LP distribution with source EXIT_PROCEEDS / REALISATION_PROCEEDS is declared. " +
      "Proceeds from realising an investment are not dividend income.",
  },
  {
    accountNo: "4130",
    accountName: "Other Investment Income",
    accountType: "Revenue",
    naturalBalance: "CREDIT",
    financialStatement: "Income Statement",
    notes: "Debited for LP distributions with source INCOME or OTHER (DistributionService).",
  },
  {
    accountNo: "3020",
    accountName: "Partners Capital - Contributed",
    accountType: "Equity",
    naturalBalance: "CREDIT",
    financialStatement: "Balance Sheet",
    notes:
      "Debited when an LP distribution with source RETURN_OF_CAPITAL is declared: contributed " +
      "capital is being returned to partners, which reduces equity and is not income.",
  },
];

async function main() {
  let created = 0;
  for (const a of ACCOUNTS) {
    const existing = await prisma.chartOfAccounts.findUnique({
      where: { accountNo: a.accountNo },
      select: { accountNo: true, accountName: true },
    });
    if (existing) {
      console.log(`[skip]    ${a.accountNo} already exists as "${existing.accountName}"`);
      continue;
    }
    await prisma.chartOfAccounts.create({ data: { ...a, isActive: true } });
    console.log(`[created] ${a.accountNo} ${a.accountName} (${a.accountType})`);
    created++;
  }
  console.log(`\n${created} account(s) created, ${ACCOUNTS.length - created} already present.`);
}

main()
  .catch((e) => {
    console.error("[failed]", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
