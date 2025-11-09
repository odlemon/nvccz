import { prisma } from '../src/utils/database';
import bcrypt from 'bcrypt';

async function resetPassword(email: string, newPassword: string) {
  console.log(`Resetting password for ${email}`);

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true
    }
  });

  if (!user) {
    console.error(`User with email ${email} not found`);
    process.exit(1);
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword
    }
  });

  console.log(`Password reset complete for ${email}`);
}

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error('Usage: npx ts-node scripts/resetPassword.ts <email> <newPassword>');
  process.exit(1);
}

resetPassword(email, password)
  .catch((error) => {
    console.error('Failed to reset password', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

