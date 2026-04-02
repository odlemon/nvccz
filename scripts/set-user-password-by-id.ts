/**
 * Set a user's password by ID (bcrypt, same rounds as AuthController).
 *
 * Usage: npx ts-node scripts/set-user-password-by-id.ts <userId> <newPassword>
 */
import bcrypt from "bcrypt";
import { prisma } from "../src/utils/database";

async function main() {
  const userId = process.argv[2];
  const newPassword = process.argv[3];

  if (!userId || !newPassword) {
    console.error("Usage: npx ts-node scripts/set-user-password-by-id.ts <userId> <newPassword>");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, firstName: true, lastName: true }
  });

  if (!user) {
    console.error(`No user with id ${userId}`);
    process.exit(1);
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashedPassword, updatedAt: new Date() }
  });

  console.log(`Password updated for ${user.firstName} ${user.lastName} <${user.email}> (${user.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
