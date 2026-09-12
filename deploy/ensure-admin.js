const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");

async function main() {
  const prisma = new PrismaClient();
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL || "admin@nts.com";
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || "admin123";
  try {
    let role = await prisma.role.findFirst({ where: { name: "admin" } });
    if (!role) {
      role = await prisma.role.create({
        data: { name: "admin", description: "Full access", permissions: [] },
      });
    }
    const hash = await bcrypt.hash(password, 10);
    // roleCode is set alongside roleId because User Management reads roleCode
    // for its Role Code column and its role filter. This bootstrap path bypasses
    // the admin user form (where department, department role and role code are
    // required fields), so accounts it creates previously showed "N/A" there —
    // admin@nvccz.co.zw had no roleCode at all.
    //
    // Department and departmentRole are deliberately left unset: those describe
    // where a person sits in the organisation and are not something this script
    // can infer. Assign them through User Management.
    await prisma.user.upsert({
      where: { email },
      update: { password: hash, roleId: role.id, roleCode: "admin" },
      create: {
        firstName: "Admin",
        lastName: "NTS",
        email,
        password: hash,
        roleId: role.id,
        roleCode: "admin",
      },
    });
    console.log("[arcus-api] admin ready", email);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[arcus-api] admin seed failed", err);
  process.exit(1);
});
