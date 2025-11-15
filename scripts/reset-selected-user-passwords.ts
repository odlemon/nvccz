import bcrypt from "bcryptjs";
import { prisma } from "../src/utils/database";

interface PasswordResetTarget {
  email: string;
  newPassword: string;
}

const targets: PasswordResetTarget[] = [
  { email: "blessingmwalein+10@gmail.com", newPassword: "bless123" },
  { email: "logixvine@gmail.com", newPassword: "log123" }
];

async function resetPassword({ email, newPassword }: PasswordResetTarget) {
  console.log(`🔄 Resetting password for ${email}`);

  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true }
  });

  if (!user) {
    console.error(`❌ No user found with email ${email}`);
    return;
  }

  const hashedPassword = await bcrypt.hash(newPassword, 12);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      updatedAt: new Date()
    }
  });

  console.log(`✅ Password reset complete for ${email}`);
}

async function main() {
  for (const target of targets) {
    try {
      await resetPassword(target);
    } catch (error) {
      console.error(`🚨 Failed to reset password for ${target.email}`, error);
    }
  }
}

main()
  .catch(error => {
    console.error("🚨 Unexpected error while resetting passwords", error);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });



