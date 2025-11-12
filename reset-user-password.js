const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function resetPassword() {
  const email = 'janeterica@gmail.com';
  const newPassword = 'janet123';

  console.log('\n🔐 Resetting User Password...\n');
  console.log(`Email: ${email}`);
  console.log(`New Password: ${newPassword}\n`);

  try {
    // Step 1: Find the user
    console.log('Step 1: Finding user...');
    const user = await prisma.user.findUnique({
      where: { email: email },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true
      }
    });

    if (!user) {
      console.log('❌ User not found!');
      console.log(`   Email: ${email} does not exist in the database.`);
      return;
    }

    console.log('✅ User found:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Name: ${user.firstName} ${user.lastName}`);
    console.log(`   Email: ${user.email}`);

    // Step 2: Hash the new password
    console.log('\nStep 2: Hashing new password...');
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    console.log('✅ Password hashed successfully');

    // Step 3: Update the password
    console.log('\nStep 3: Updating password in database...');
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword }
    });

    console.log('✅ Password updated successfully!');
    console.log('\n📋 Summary:');
    console.log(`   Email: ${email}`);
    console.log(`   New Password: ${newPassword}`);
    console.log(`   Status: Password reset complete\n`);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.code) {
      console.error(`   Error Code: ${error.code}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

resetPassword();

