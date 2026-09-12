import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const prefix = "USD Bank Test";

  const accounts = await prisma.chartOfAccounts.findMany({
    where: { accountName: { startsWith: prefix } },
    orderBy: { accountNo: "asc" },
  });

  const ids = accounts.map((a) => a.id);
  console.log(`Hard deleting ${ids.length} ChartOfAccounts with accountName startsWith '${prefix}'`);
  if (ids.length === 0) {
    return;
  }

  // Final sanity check: ensure there are no journal lines referencing them.
  const journalLines = await prisma.journalEntryLine.count({
    where: { chartOfAccountId: { in: ids } },
  });
  if (journalLines !== 0) {
    console.error(`Aborting: journalEntryLines still reference these accounts (${journalLines}).`);
    process.exit(1);
  }

  const del = await prisma.chartOfAccounts.deleteMany({
    where: { id: { in: ids } },
  });

  console.log(`Deleted ${del.count} row(s) from chart_of_accounts.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
