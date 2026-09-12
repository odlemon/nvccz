/**
 * Set a user's password (bcrypt rounds 10, same as AuthController).
 *
 * Usage:
 *   npx ts-node scripts/reset-user-password.ts <email> <newPlainPassword>
 *
 * Requires DATABASE_URL.
 */
import "dotenv/config";
import bcrypt from "bcrypt";
import { prisma } from "../src/utils/database";

async function main() {
  const email = String(process.argv[2] || "").trim().toLowerCase();
  const plain = process.argv[3];
  if (!email || plain == null || plain === "") {
    console.error("Usage: npx ts-node scripts/reset-user-password.ts <email> <newPlainPassword>");
    process.exit(1);
  }

  const hashed = await bcrypt.hash(String(plain), 10);
  const user = await prisma.user.update({
    where: { email },
    data: { password: hashed },
    select: { id: true, email: true, firstName: true, lastName: true }
  });

  console.log(JSON.stringify({ ok: true, user }, null, 2));
}

main()
  .catch((e) => {
    console.error(e?.message || e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
