const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function checkAdminLogin() {
  console.log('\n🔍 Checking Admin Login Issue...\n');

  try {
    // Step 1: Check if admin user exists
    console.log('Step 1: Checking if admin user exists...');
    const adminUser = await prisma.user.findUnique({
      where: { email: 'admin@nvccz.co.zw' },
      include: {
        role: true,
        department: true
      }
    });

    if (!adminUser) {
      console.log('❌ Admin user not found!');
      console.log('\n📝 Creating admin user...');
      
      // Get admin role
      const adminRole = await prisma.role.findFirst({
        where: { name: 'admin' }
      });

      if (!adminRole) {
        console.log('❌ Admin role not found! Creating admin role...');
        const newAdminRole = await prisma.role.create({
          data: {
            name: 'admin',
            description: 'Full access to all features',
            permissions: [
              { name: "view_dashboard", value: true },
              { name: "view_reports", value: true },
              { name: "view_structure", value: true },
              { name: "manage_structure", value: true },
              { name: "view_accounting", value: true },
              { name: "manage_accounting", value: true },
              { name: "view_financial_reports", value: true },
              { name: "manage_financial_reports", value: true },
              { name: "view_ledger", value: true },
              { name: "manage_ledger", value: true },
              { name: "manage_users", value: true },
              { name: "manage_roles", value: true },
              { name: "create_worklog", value: true },
              { name: "edit_worklog", value: true },
              { name: "delete_worklog", value: true },
              { name: "view_worklog", value: true },
              { name: "view_business_operations", value: true },
              { name: "manage_business_operations", value: true },
              { name: "view_company_data", value: true },
              { name: "manage_company_data", value: true },
              { name: "view_erp_reports", value: true },
              { name: "manage_erp_reports", value: true },
              { name: "view_subscription", value: true },
              { name: "manage_subscription", value: true },
              { name: "manage_firm_settings", value: true },
              { name: "bank_reconciliation", value: true }
            ]
          }
        });
        console.log('✅ Admin role created');
      }

      // Get Operations department
      const operationsDept = await prisma.department.findFirst({
        where: { name: 'Operations' }
      });

      // Hash password
      const hashedPassword = await bcrypt.hash('admin123', 10);

      // Create admin user
      const newAdmin = await prisma.user.create({
        data: {
          email: 'admin@nvccz.co.zw',
          firstName: 'Admin',
          lastName: 'User',
          password: hashedPassword,
          roleId: adminRole?.id || (await prisma.role.findFirst({ where: { name: 'admin' } }))?.id,
          departmentId: operationsDept?.id,
          userDepartment: 'Operations',
          roleCode: null
        }
      });

      console.log('✅ Admin user created successfully!');
      console.log(`   Email: ${newAdmin.email}`);
      console.log(`   Password: admin123`);
      console.log(`   Role: admin`);
      return;
    }

    console.log('✅ Admin user exists');
    console.log(`   Email: ${adminUser.email}`);
    console.log(`   Name: ${adminUser.firstName} ${adminUser.lastName}`);
    console.log(`   Role: ${adminUser.role?.name || 'N/A'}`);
    console.log(`   Department: ${adminUser.department?.name || adminUser.userDepartment || 'N/A'}`);
    console.log('');

    // Step 2: Test password
    console.log('Step 2: Testing password...');
    const passwordToTest = 'admin123';
    const isMatch = await bcrypt.compare(passwordToTest, adminUser.password);
    
    if (!isMatch) {
      console.log('❌ Password does not match!');
      console.log('\n📝 Resetting admin password to "admin123"...');
      
      const newHashedPassword = await bcrypt.hash('admin123', 10);
      await prisma.user.update({
        where: { id: adminUser.id },
        data: { password: newHashedPassword }
      });
      
      console.log('✅ Admin password reset successfully!');
      console.log('   New password: admin123');
    } else {
      console.log('✅ Password matches correctly');
    }

    // Step 3: Check if user can be found with normalized email
    console.log('\nStep 3: Testing email normalization...');
    const normalizedEmail = 'admin@nvccz.co.zw'.trim().toLowerCase();
    const userByNormalizedEmail = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (!userByNormalizedEmail) {
      console.log('❌ User not found with normalized email!');
      console.log(`   Normalized email: ${normalizedEmail}`);
      console.log(`   Original email in DB: ${adminUser.email}`);
      
      // Check if there's a case/whitespace issue
      if (adminUser.email !== normalizedEmail) {
        console.log('\n📝 Updating email to normalized version...');
        await prisma.user.update({
          where: { id: adminUser.id },
          data: { email: normalizedEmail }
        });
        console.log('✅ Email normalized');
      }
    } else {
      console.log('✅ User found with normalized email');
    }

    // Step 4: Verify login would work
    console.log('\nStep 4: Simulating login...');
    const testPassword = 'admin123';
    const finalPasswordCheck = await bcrypt.compare(testPassword, adminUser.password);
    
    if (finalPasswordCheck) {
      console.log('✅ Login simulation successful!');
      console.log('   Admin should be able to login with:');
      console.log('   Email: admin@nvccz.co.zw');
      console.log('   Password: admin123');
    } else {
      console.log('❌ Login simulation failed - password still incorrect');
      console.log('   Please check the password hash');
    }

    console.log('\n✅ Admin login check complete!\n');

  } catch (error) {
    console.error('\n❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAdminLogin();

