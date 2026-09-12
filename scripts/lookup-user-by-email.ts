import "dotenv/config";
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const email = process.argv[2] || "nyasha@lysp.io";
async function main() {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      employee: { select: { id: true, employeeNumber: true } },
    },
  });
  console.log(JSON.stringify(user, null, 2));
}
main().finally(() => prisma.$disconnect());
