// @ts-nocheck
import { prisma } from "../src/utils/database";

// Emails to delete
const emailsToDelete = [
  "nyashakarata1@gmail.com",
  "nyasha@lysp.io"
];

async function createPasswordResetTokensTable() {
  try {
    console.log("🔧 Creating password_reset_tokens table if it doesn't exist...\n");
    
    // Check if table exists by trying to query it
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id VARCHAR(191) NOT NULL,
        userId VARCHAR(191) NOT NULL,
        tokenHash VARCHAR(191) NOT NULL,
        expiresAt DATETIME(3) NOT NULL,
        usedAt DATETIME(3) NULL,
        createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY password_reset_tokens_tokenHash_key (tokenHash),
        KEY password_reset_tokens_userId_fkey (userId),
        CONSTRAINT password_reset_tokens_userId_fkey FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
    
    console.log("✅ password_reset_tokens table is ready\n");
  } catch (error: any) {
    // If table already exists, that's fine
    if (error.message?.includes('already exists') || error.message?.includes('Duplicate')) {
      console.log("✅ password_reset_tokens table already exists\n");
    } else {
      console.error("⚠️  Error creating table (may already exist):", error.message);
      console.log("   Continuing with user deletion...\n");
    }
  }
}

async function deleteUsers() {
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

      // Delete password reset tokens first (if table exists)
      try {
        await prisma.$executeRawUnsafe(`
          DELETE FROM password_reset_tokens WHERE userId = ?
        `, user.id);
      } catch (error: any) {
        // Ignore if table doesn't exist or other errors
        console.log(`   ℹ️  Skipping password reset tokens cleanup (table may not exist)`);
      }

      // Delete Approval records where user is approver (required relation without cascade)
      try {
        const approvalCount = await prisma.approval.deleteMany({
          where: {
            approverId: user.id
          }
        });
        if (approvalCount.count > 0) {
          console.log(`   🗑️  Deleted ${approvalCount.count} approval record(s)`);
        }
      } catch (error: any) {
        console.log(`   ℹ️  Skipping approvals cleanup: ${error.message}`);
      }

      // Delete Approval records where user is delegated to
      try {
        const delegatedCount = await prisma.approval.deleteMany({
          where: {
            delegatedToId: user.id
          }
        });
        if (delegatedCount.count > 0) {
          console.log(`   🗑️  Deleted ${delegatedCount.count} delegated approval record(s)`);
        }
      } catch (error: any) {
        console.log(`   ℹ️  Skipping delegated approvals cleanup: ${error.message}`);
      }

      // Delete user by ID (cascade will handle related data)
      await prisma.user.delete({
        where: {
          id: user.id
        }
      });
      
      console.log(`   ✅ Successfully deleted user with email: ${trimmedEmail}\n`);
    }

    console.log("🎉 User deletion process completed!");
  } catch (error: any) {
    console.error("❌ Failed to delete users:", error.message);
    if (error.stack) {
      console.error("Stack trace:", error.stack);
    }
    throw error;
  }
}

async function main() {
  try {
    await createPasswordResetTokensTable();
    await deleteUsers();
  } catch (error: any) {
    console.error("❌ Script failed:", error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
