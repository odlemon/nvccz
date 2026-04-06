/**
 * Prints real bank + GL account (+ optional currency) IDs from the current DATABASE_URL
 * for Postman tests (cashbook receipt in a locked period).
 *
 * Run: npx ts-node scripts/print-cashbook-period-lock-test-ids.ts
 * Or:  npm run db:print:period-lock-test-ids
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const bank =
    (await prisma.bank.findFirst({
      where: { isActive: true },
      select: { id: true, name: true, currencyId: true, glAccountId: true },
      orderBy: { name: "asc" },
    })) ?? null;

  const incomeLike = await prisma.chartOfAccounts.findFirst({
    where: {
      isActive: true,
      OR: [
        { accountName: { contains: "Income" } },
        { accountName: { contains: "Revenue" } },
        { accountName: { contains: "Sales" } },
      ],
    },
    select: { id: true, accountNo: true, accountName: true },
    orderBy: { accountNo: "asc" },
  });

  const anyCoa =
    incomeLike ??
    (await prisma.chartOfAccounts.findFirst({
      where: {
        isActive: true,
        ...(bank?.glAccountId ? { id: { not: bank.glAccountId } } : {}),
      },
      select: { id: true, accountNo: true, accountName: true },
      orderBy: { accountNo: "asc" },
    }));

  console.log("\n=== Period lock / cashbook receipt test IDs (from DB) ===\n");
  if (bank) {
    console.log("bankId (use this OR keep AUTO_ZIG in Postman):");
    console.log(JSON.stringify({ id: bank.id, name: bank.name, currencyId: bank.currencyId }, null, 2));
  } else {
    console.log("No active bank found — use bankId: \"AUTO_ZIG\" in Postman.\n");
  }

  if (anyCoa) {
    console.log("\nglAccountId (GL counterparty receipt — credit side):");
    console.log(JSON.stringify(anyCoa, null, 2));
  } else {
    console.log("\nNo chart_of_accounts row found — create one or pick an id from your COA UI.\n");
  }

  console.log("\n--- Example POST /api/cashbook/receipts body ---\n");
  const glId = anyCoa?.id ?? "REPLACE_WITH_glAccountId_ABOVE";
  const bId = bank?.id ?? "AUTO_ZIG";
  console.log(
    JSON.stringify(
      {
        bankId: bId,
        transactionDate: "2026-04-15",
        description: "Test receipt in locked month",
        amount: 1,
        reference: `LOCK-TEST-${Date.now()}`,
        counterpartyType: "GL",
        glAccountId: glId,
        vatCode: "0%",
      },
      null,
      2
    )
  );

  console.log("\n--- Example POST /api/cashbook/periods/lock body (lockedBy from JWT, do not send) ---\n");
  console.log(
    JSON.stringify(
      {
        period: "2026-04",
        isLocked: true,
        reason: "Test period lock + posting exceptions",
      },
      null,
      2
    )
  );

  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
