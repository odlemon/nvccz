import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const prefix = "USD Bank Test";
  const accounts = await prisma.chartOfAccounts.findMany({
    where: { accountName: { startsWith: prefix } },
    orderBy: { accountNo: "asc" },
  });

  console.log(`Checking parent/child relationships for ${accounts.length} accounts...`);

  for (const a of accounts) {
    const childCount = await prisma.chartOfAccounts.count({ where: { parentId: a.id } });
    console.log(`- ${a.accountNo} ${a.id} children(parentId=this): ${childCount}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
