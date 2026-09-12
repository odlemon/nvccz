import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const cace = await prisma.chartOfAccounts.findFirst({
    where: { accountNo: "1000" },
    select: { id: true, accountNo: true, accountName: true },
  });

  const journalLinesPostingTo1000 = await prisma.journalEntryLine.count({
    where: { chartOfAccount: { accountNo: "1000" } },
  });

  const activeBanks = await prisma.bank.count({ where: { isActive: true } });

  const banksLinkedTo1000 = await prisma.bank.count({
    where: { isActive: true, glAccount: { accountNo: "1000" } },
  });

  const shared = (await prisma.$queryRawUnsafe<{ glAccountId: string; n: bigint }[]>(
    `
      SELECT glAccountId, COUNT(*) AS n
      FROM banks
      WHERE isActive = 1
      GROUP BY glAccountId
      HAVING COUNT(*) > 1
    `
  )) ?? [];

  const acc1100 = await prisma.chartOfAccounts.findFirst({
    where: { accountNo: "1100" },
    select: {
      accountNo: true,
      accountName: true,
      accountType: true,
      financialStatement: true,
      isActive: true,
      notes: true,
    },
  });

  const acc1510 = await prisma.chartOfAccounts.findFirst({
    where: { accountNo: "1510" },
    select: {
      accountNo: true,
      accountName: true,
      accountType: true,
      financialStatement: true,
      isActive: true,
      notes: true,
    },
  });

  console.log(
    JSON.stringify(
      {
        cace,
        journalLinesPostingTo1000,
        activeBanks,
        sharedGlAccountGroups: shared.length,
        banksLinkedTo1000,
        acc1100,
        acc1510,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

