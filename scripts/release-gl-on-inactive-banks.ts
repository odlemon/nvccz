import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const r = await prisma.bank.updateMany({
    where: { isActive: false, glAccountId: { not: null } },
    data: { glAccountId: null },
  });
  console.log("Released glAccountId on inactive banks:", r.count);
}
main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
