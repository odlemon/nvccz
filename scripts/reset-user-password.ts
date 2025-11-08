import bcrypt from 'bcryptjs';
import { prisma } from '../src/utils/database';

async function main() {
  const email = process.argv[2];
  const newPassword = process.argv[3];

  if (!email || !newPassword) {
    console.error('Usage: npx ts-node scripts/reset-user-password.ts <email> <newPassword>');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`❌ No user found with email ${email}`);
    return;
  }

  const hashed = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { email },
    data: {
      password: hashed,
      updatedAt: new Date()
    }
  });

  console.log(`✅ Password reset for ${email}`);
}

main()
  .catch(error => {
    console.error('❌ Failed to reset password', error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
