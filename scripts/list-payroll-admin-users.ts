// @ts-nocheck
import "dotenv/config";
import { prisma } from "../src/utils/database";

async function main() {
  const roles = await prisma.role.findMany({ select: { id: true, name: true } });
  console.log("Roles:", roles);

  const admins = await prisma.user.findMany({
    where: {
      OR: [
        { role: { name: { in: ["admin", "administrator", "System Administrator"] } } },
        { roleCode: { in: ["ADMIN", "SYSADMIN", "SUPER_ADMIN"] } },
      ],
    },
    select: { email: true, firstName: true, lastName: true, roleCode: true, role: { select: { name: true } } },
    take: 10,
  });
  console.log("Admin-like users:", admins);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
