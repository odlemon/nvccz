// @ts-nocheck
/**
 * Generate Secure Admin Password Script
 * 
 * This script generates a strong, complex password and updates the admin user.
 * The password will be displayed once - make sure to save it securely!
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const prisma = new PrismaClient();

const ADMIN_EMAIL = 'admin@nvccz.co.zw';

/**
 * Generate a strong, complex password
 * - At least 16 characters
 * - Contains uppercase, lowercase, numbers, and special characters
 */
function generateSecurePassword(): string {
  const length = 20; // Strong password length
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  
  // Ensure at least one character from each category
  let password = '';
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];
  
  // Fill the rest with random characters from all categories
  const allChars = uppercase + lowercase + numbers + special;
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  
  // Shuffle the password to randomize character positions
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

async function updateAdminPassword() {
  console.log('🔐 GENERATING SECURE ADMIN PASSWORD');
  console.log('=' .repeat(60));
  console.log(`📧 Admin Email: ${ADMIN_EMAIL}`);
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

    // Generate secure password
    console.log('🔐 Generating secure password...');
    const newPassword = generateSecurePassword();
    console.log('✅ Secure password generated');

    // Hash the new password
    console.log('🔐 Hashing password...');
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    console.log('✅ Password hashed');

    // Update the password and set passwordChangedAt to invalidate old tokens
    console.log('💾 Updating password in database...');
    await prisma.user.update({
      where: { email: ADMIN_EMAIL },
      data: {
        password: hashedPassword,
        passwordChangedAt: new Date() // This will invalidate all existing tokens
      }
    });

    console.log('');
    console.log('🎉 ADMIN PASSWORD UPDATED SUCCESSFULLY!');
    console.log('=' .repeat(60));
    console.log(`📧 Email: ${ADMIN_EMAIL}`);
    console.log('');
    console.log('🔑 NEW PASSWORD (SAVE THIS SECURELY!):');
    console.log('─'.repeat(60));
    console.log(`   ${newPassword}`);
    console.log('─'.repeat(60));
    console.log('');
    console.log('⚠️  IMPORTANT:');
    console.log('   • This password is shown only once');
    console.log('   • Save it in a secure password manager');
    console.log('   • Do not share it or commit it to version control');
    console.log('');
    console.log('✅ You can now login with the new password');
    console.log(`   URL: http://app.kyntaro.com/login`);

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

