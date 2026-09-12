/**
 * Ensures GL **1210** (Capital Contributions Receivable) and **3010** (Partners Capital - Uncalled)
 * exist and are active — same accountNo values used by src/services/CapitalCallService.ts
 * (DR_ACCOUNT_NO / CR_ACCOUNT_NO).
 *
 * Run: npm run db:ensure:capital-call-accounts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CAPITAL_CALL_GL: Array<{
  accountNo: string;
  accountName: string;
  accountType: string;
  financialStatement: string;
  naturalBalance: "DEBIT" | "CREDIT";
  notes: string;
}> = [
  {
    accountNo: "1210",
    accountName: "Capital Contributions Receivable",
    accountType: "Current Asset",
    financialStatement: "Balance Sheet",
    naturalBalance: "DEBIT",
    notes: "LP capital calls: debit on call initiation (CapitalCallService)",
  },
  {
    accountNo: "3010",
    accountName: "Partners Capital - Uncalled",
    accountType: "Equity",
    financialStatement: "Balance Sheet",
    naturalBalance: "CREDIT",
    notes: "LP capital calls: credit on call initiation (CapitalCallService)",
  },
];

async function main() {
  console.log("Ensuring capital-call GL accounts 1210 & 3010 (must match CapitalCallService)...\n");

  for (const row of CAPITAL_CALL_GL) {
    const existing = await prisma.chartOfAccounts.findUnique({
      where: { accountNo: row.accountNo },
    });

    if (existing) {
      if (!existing.isActive) {
        await prisma.chartOfAccounts.update({
          where: { id: existing.id },
          data: { isActive: true },
        });
        console.log(`  reactivated  ${row.accountNo}  ${existing.accountName}`);
      } else {
        console.log(`  ok (exists)    ${row.accountNo}  ${existing.accountName}  id=${existing.id}`);
      }
      continue;
    }

    const created = await prisma.chartOfAccounts.create({
      data: {
        accountNo: row.accountNo,
        accountName: row.accountName,
        accountType: row.accountType,
        financialStatement: row.financialStatement,
        naturalBalance: row.naturalBalance,
        notes: row.notes,
        isActive: true,
      },
    });
    console.log(`  created        ${row.accountNo}  ${created.accountName}  id=${created.id}`);
  }

  console.log("\nDone. CapitalCallService posts: Dr 1210, Cr 3010.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
