/**
 * List admin users to help generate ADMIN_JWT for Postman testing.
 *
 * Usage:
 *   npx ts-node scripts/list-admin-users.ts
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";

async function main() {
  const rows = await prisma.user.findMany({
    where: {
      OR: [{ roleCode: "admin" }, { roleCode: "ADMIN" }, { role: { name: { contains: "admin" } } }],
    },
    select: { id: true, email: true, firstName: true, lastName: true, roleCode: true, role: { select: { name: true } } },
    take: 50,
    orderBy: { createdAt: "desc" },
  });

  if (rows.length === 0) {
    console.log("No admin users found by roleCode/role.name heuristics.");
    return;
  }

  for (const u of rows) {
    console.log(
      `${u.id}\t${u.email}\t${[u.firstName, u.lastName].filter(Boolean).join(" ")}\troleCode=${u.roleCode ?? ""}\troleName=${u.role?.name ?? ""}`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

