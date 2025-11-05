const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function resetApplicantPassword() {
  const email = 'blessingmwalein@gmail.com';
  const newPassword = 'blessing@123';

  console.log('\n🔐 Resetting Applicant Password...\n');
  console.log(`Email: ${email}`);
  console.log(`New Password: ${newPassword}\n`);

  try {
    // Step 1: Find the applicant in Application table
    console.log('Step 1: Finding applicant...');
    const application = await prisma.application.findFirst({
      where: { applicantEmail: email },
      select: {
        id: true,
        applicantEmail: true,
        applicantName: true
      }
    });

    if (!application) {
      console.log('❌ Applicant not found!');
      console.log(`   Email: ${email} does not exist in the applications.`);
      return;
    }

    console.log('✅ Applicant found:');
    console.log(`   Application ID: ${application.id}`);
    console.log(`   Name: ${application.applicantName}`);
    console.log(`   Email: ${application.applicantEmail}`);

    // Step 2: Check if there's a User record for this applicant
    console.log('\nStep 2: Checking for User record...');
    let user = await prisma.user.findUnique({
      where: { email: email },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true
      }
    });

    if (!user) {
      console.log('⚠️  No User record found for this applicant.');
      console.log('   Creating User record for applicant...');
      
      // Get or create applicant role
      let applicantRole = await prisma.role.findUnique({
        where: { name: "applicant" }
      });

      if (!applicantRole) {
        applicantRole = await prisma.role.create({
          data: {
            name: "applicant",
            description: "Applicant user role - can create and manage company profiles",
            permissions: {
              "portfolio_company": ["read", "write"],
              "profile": ["read", "write"],
              "applications": ["read", "write"],
              "term_sheets": ["read", "write"]
            }
          }
        });
        console.log('✅ Created applicant role');
      }

      // Parse name from applicantName
      const nameParts = application.applicantName.trim().split(/\s+/);
      const firstName = nameParts[0] || application.applicantName;
      const lastName = nameParts.slice(1).join(' ') || '';

      // Hash the password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Create user
      user = await prisma.user.create({
        data: {
          firstName: firstName,
          lastName: lastName,
          email: email,
          password: hashedPassword,
          roleId: applicantRole.id
        }
      });

      console.log('✅ User record created:');
      console.log(`   User ID: ${user.id}`);
      console.log(`   Name: ${user.firstName} ${user.lastName}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Password: ${newPassword} (already set)`);
      console.log('\n✅ Password reset complete!');
      return;
    }

    console.log('✅ User record found:');
    console.log(`   User ID: ${user.id}`);
    console.log(`   Name: ${user.firstName} ${user.lastName}`);

    // Step 3: Hash the new password
    console.log('\nStep 3: Hashing new password...');
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    console.log('✅ Password hashed successfully');

    // Step 4: Update the password
    console.log('\nStep 4: Updating password in database...');
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

resetApplicantPassword();

