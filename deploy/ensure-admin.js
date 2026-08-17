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
    await prisma.user.upsert({
      where: { email },
      update: { password: hash, roleId: role.id },
      create: {
        firstName: "Admin",
        lastName: "NTS",
        email,
        password: hash,
        roleId: role.id,
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
