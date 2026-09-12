// @ts-nocheck
/**
 * Force Invalidate All Admin Tokens
 * 
 * This script forcefully sets passwordChangedAt to NOW() for admin user
 * to invalidate ALL existing tokens immediately.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ADMIN_EMAIL = 'admin@nvccz.co.zw';

async function forceInvalidateTokens() {
  console.log('🔐 FORCE INVALIDATING ALL ADMIN TOKENS');
  console.log('=' .repeat(60));
  console.log(`📧 Admin Email: ${ADMIN_EMAIL}`);
  console.log('');

  try {
    // Force update passwordChangedAt to NOW() to invalidate ALL tokens
    console.log('💾 Updating passwordChangedAt to NOW()...');
    await prisma.$executeRawUnsafe(`
      UPDATE users 
      SET passwordChangedAt = NOW() 
      WHERE email = '${ADMIN_EMAIL}'
    `);

    // Verify the update
    const adminUser = await prisma.user.findUnique({
      where: { email: ADMIN_EMAIL },
      select: {
        email: true,
        passwordChangedAt: true
      }
    });

    if (!adminUser) {
      throw new Error(`Admin user not found: ${ADMIN_EMAIL}`);
    }

    console.log('✅ Admin user updated');
    console.log('');
    console.log('📊 VERIFICATION:');
    console.log(`   Email: ${adminUser.email}`);
    console.log(`   Password Changed At: ${adminUser.passwordChangedAt}`);
    console.log('');
    console.log('🎉 ALL ADMIN TOKENS INVALIDATED!');
    console.log('=' .repeat(60));
    console.log('');
    console.log('⚠️  IMPORTANT:');
    console.log('   • All existing admin sessions are now invalid');
    console.log('   • Users must login again with the new password');
    console.log('   • Any API requests with old tokens will be rejected');
    console.log('');

  } catch (error) {
    console.error('❌ Error invalidating tokens:', error);
    throw error;
  }
}

async function main() {
  try {
    await forceInvalidateTokens();
  } catch (error) {
    console.error('❌ Operation failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

