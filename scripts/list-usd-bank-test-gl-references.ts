import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const prefix = "USD Bank Test";
  const accounts = await prisma.chartOfAccounts.findMany({
    where: { accountName: { startsWith: prefix } },
    orderBy: { accountNo: "asc" },
  });

  console.log(`Found ${accounts.length} ChartOfAccounts with accountName startsWith '${prefix}'`);

  for (const a of accounts) {
    const [
      journalLineCount,
      cashbookCounterpartyCount,
      bankGlCount,
      templateCount,
      entryTypeDefaultCount,
      contraConfigCount,
      contraDebitCount,
      contraCreditCount,
    ] = await Promise.all([
      prisma.journalEntryLine.count({ where: { chartOfAccountId: a.id } }),
      prisma.cashbookEntry.count({ where: { glAccountId: a.id } }),
      prisma.bank.count({ where: { glAccountId: a.id } }),
      prisma.cashbookTemplate.count({ where: { glAccountId: a.id } }),
      prisma.cashbookEntryTypeConfig.count({ where: { defaultGlAccountId: a.id } }),
      prisma.contraEntryConfig.count({ where: { glAccountId: a.id } }),
      prisma.contraEntry.count({ where: { debitAccountId: a.id } }),
      prisma.contraEntry.count({ where: { creditAccountId: a.id } }),
    ]);

    console.log(`\n- ${a.id} | ${a.accountNo} | ${a.accountName} | ${a.accountType} | ${a.financialStatement}`);
    console.log(`  journalEntryLines: ${journalLineCount}`);
    console.log(`  cashbookEntry (counterparty) glAccountId: ${cashbookCounterpartyCount}`);
    console.log(`  bank glAccountId: ${bankGlCount}`);
    console.log(`  cashbookTemplate glAccountId: ${templateCount}`);
    console.log(`  cashbookEntryTypeConfig defaultGlAccountId: ${entryTypeDefaultCount}`);
    console.log(`  contraEntryConfig glAccountId: ${contraConfigCount}`);
    console.log(`  contraEntry debitAccountId: ${contraDebitCount}`);
    console.log(`  contraEntry creditAccountId: ${contraCreditCount}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
