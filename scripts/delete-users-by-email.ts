// @ts-nocheck
import { prisma } from "../src/utils/database";

// Emails to delete
const emailsToDelete = [
  "nyashakarata1@gmail.com",
  "nyasha@lysp.io"
];

async function main() {
  try {
    console.log("🔍 Starting user deletion process...\n");

    for (const email of emailsToDelete) {
      const trimmedEmail = email.trim().toLowerCase();
      
      console.log(`📋 Checking for user: ${trimmedEmail}`);
      
      // First, check if user exists and get details
      const user = await prisma.user.findFirst({
        where: {
          email: trimmedEmail
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          userDepartment: true,
          role: {
            select: {
              name: true
            }
          }
        }
      });

      if (!user) {
        console.log(`   ⚠️  No user found with email: ${trimmedEmail}\n`);
        continue;
      }

      console.log(`   ✅ Found user:`);
      console.log(`      ID: ${user.id}`);
      console.log(`      Name: ${user.firstName} ${user.lastName}`);
      console.log(`      Department: ${user.userDepartment || 'N/A'}`);
      console.log(`      Role: ${user.role?.name || 'N/A'}`);
      console.log(`   🗑️  Deleting user...`);

      // Delete user by ID (cascade will handle related data)
      try {
        await prisma.user.delete({
          where: {
            id: user.id
          }
        });
        console.log(`   ✅ Successfully deleted user with email: ${trimmedEmail}\n`);
      } catch (deleteError: any) {
        // If delete fails due to foreign key constraints, try to handle password reset tokens first
        if (deleteError.message?.includes('password_reset_tokens')) {
          try {
            // Try to delete password reset tokens first if they exist
            await prisma.passwordResetToken.deleteMany({
              where: {
                userId: user.id
              }
            }).catch(() => {
              // Ignore if table doesn't exist
            });
            
            // Now try deleting user again
            await prisma.user.delete({
              where: {
                id: user.id
              }
            });
            console.log(`   ✅ Successfully deleted user with email: ${trimmedEmail}\n`);
          } catch (retryError: any) {
            console.log(`   ⚠️  Could not delete user: ${retryError.message}\n`);
          }
        } else {
          throw deleteError;
        }
      }
    }

    console.log("🎉 User deletion process completed!");
  } catch (error: any) {
    console.error("❌ Failed to delete users:", error.message);
    if (error.stack) {
      console.error("Stack trace:", error.stack);
    }
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
