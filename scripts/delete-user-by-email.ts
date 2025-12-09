// @ts-nocheck
import { prisma } from "../src/utils/database";

// Get email from command line argument
const email = process.argv[2];

if (!email) {
  console.error("❌ Please provide an email address");
  console.log("Usage: npx ts-node scripts/delete-user-by-email.ts user@example.com");
  process.exit(1);
}

async function main() {
  try {
    // First, check if user exists
    const user = await prisma.user.findFirst({
      where: {
        email: email.trim().toLowerCase()
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        userDepartment: true
      }
    });

    if (!user) {
      console.log(`❌ No user found with email: ${email}`);
      return;
    }

    console.log(`📋 Found user:`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Name: ${user.firstName} ${user.lastName}`);
    console.log(`   Department: ${user.userDepartment || 'N/A'}`);
    console.log(`\n🗑️  Deleting user...`);

    const result = await prisma.user.deleteMany({
      where: {
        email: email.trim().toLowerCase()
      }
    });

    if (result.count > 0) {
      console.log(`✅ Successfully deleted ${result.count} user(s) with email: ${email}`);
    } else {
      console.log(`⚠️  No users were deleted`);
    }
  } catch (error) {
    console.error("❌ Failed to delete user:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();

