// @ts-nocheck
/**
 * Update Admin Password Script
 * 
 * This script updates the admin user's password.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const NEW_PASSWORD = 'admin1@kyntaro.com';

async function updateAdminPassword() {
  console.log('🔐 UPDATING ADMIN PASSWORD');
  console.log('=' .repeat(60));
  console.log(`📧 Admin Email: ${ADMIN_EMAIL}`);
  console.log(`🔑 New Password: ${NEW_PASSWORD}`);
  console.log('');

  try {
    // Find admin user
    const adminUser = await prisma.user.findUnique({
      where: { email: ADMIN_EMAIL }
    });

    if (!adminUser) {
      throw new Error(`Admin user not found: ${ADMIN_EMAIL}`);
    }

    console.log(`✅ Found admin user: ${adminUser.firstName} ${adminUser.lastName}`);

    // Hash the new password
    console.log('🔐 Hashing new password...');
    const hashedPassword = await bcrypt.hash(NEW_PASSWORD, 10);
    console.log('✅ Password hashed');

    // Update the password
    console.log('💾 Updating password...');
    await prisma.user.update({
      where: { email: ADMIN_EMAIL },
      data: {
        password: hashedPassword
      }
    });

    console.log('');
    console.log('🎉 ADMIN PASSWORD UPDATED SUCCESSFULLY!');
    console.log('=' .repeat(60));
    console.log(`📧 Email: ${ADMIN_EMAIL}`);
    console.log(`🔑 New Password: ${NEW_PASSWORD}`);
    console.log('');
    console.log('✅ You can now login with the new password');

  } catch (error) {
    console.error('❌ Error updating admin password:', error);
    throw error;
  }
}

async function main() {
  try {
    await updateAdminPassword();
  } catch (error) {
    console.error('❌ Update failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

