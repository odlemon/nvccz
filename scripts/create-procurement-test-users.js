// @ts-nocheck
/**
 * Script to create 5 procurement test users with different roles
 * Run with: node scripts/create-procurement-test-users.js
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

// Procurement test users to create
const procurementUsers = [
  {
    firstName: 'Procurement',
    lastName: 'Manager',
    email: 'proc.manager@testnvccz.com',
    department: 'Procurement',
    roleCode: 'PROC_MGR',
    departmentRole: 'HEAD'
  },
  {
    firstName: 'Procurement',
    lastName: 'Officer',
    email: 'proc.officer@testnvccz.com',
    department: 'Procurement',
    roleCode: 'PROC_OFF',
    departmentRole: 'DEPUTY'
  },
  {
    firstName: 'Procurement',
    lastName: 'Buyer',
    email: 'proc.buyer@testnvccz.com',
    department: 'Procurement',
    roleCode: 'BUYER',
    departmentRole: 'MEMBER'
  },
  {
    firstName: 'Procurement',
    lastName: 'Coordinator',
    email: 'proc.coordinator@testnvccz.com',
    department: 'Procurement',
    roleCode: 'PROC_COORD',
    departmentRole: 'MEMBER'
  },
  {
    firstName: 'Procurement',
    lastName: 'Member',
    email: 'proc.member@testnvccz.com',
    department: 'Procurement',
    roleCode: 'PROC_MEM',
    departmentRole: 'MEMBER'
  }
];

// Generate a simple password for testing
function generatePassword() {
  return 'TestPass123!';
}

async function createProcurementUsers() {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('📦 CREATING PROCUREMENT TEST USERS');
  console.log('════════════════════════════════════════════════════════════════\n');

  const createdUsers = [];
  const password = generatePassword();

  for (const userData of procurementUsers) {
    try {
      // Check if user already exists
      const existingUser = await prisma.user.findUnique({
        where: { email: userData.email.toLowerCase().trim() }
      });

      if (existingUser) {
        console.log(`⚠️  User ${userData.email} already exists, skipping...`);
        console.log(`   User ID: ${existingUser.id}`);
        console.log(`   Role Code: ${existingUser.roleCode || 'Not set'}`);
        console.log('');
        continue;
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Get or create a role (we need roleId even though we use roleCode)
      let role = await prisma.role.findFirst({
        where: { 
          name: { 
            notIn: ["admin", "applicant"]
          }
        }
      });

      if (!role) {
        // Create a default role if none exists
        role = await prisma.role.create({
          data: {
            name: "employee",
            description: "Default employee role",
            permissions: {}
          }
        });
      }

      // Create user
      const user = await prisma.user.create({
        data: {
          firstName: userData.firstName,
          lastName: userData.lastName,
          email: userData.email.toLowerCase().trim(),
          password: hashedPassword,
          userDepartment: userData.department,
          departmentRole: userData.departmentRole,
          roleCode: userData.roleCode,
          roleId: role.id  // Required field
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          userDepartment: true,
          departmentRole: true,
          roleCode: true,
          createdAt: true
        }
      });

      console.log(`✅ Created user: ${user.firstName} ${user.lastName}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Role Code: ${user.roleCode}`);
      console.log(`   Department Role: ${user.departmentRole}`);
      console.log(`   User ID: ${user.id}`);
      console.log('');

      createdUsers.push({
        ...user,
        password: password // Include plain password for documentation
      });

    } catch (error) {
      console.error(`❌ Error creating user ${userData.email}:`, error.message);
      console.log('');
    }
  }

  console.log('════════════════════════════════════════════════════════════════');
  console.log(`✅ Created ${createdUsers.length} procurement test users`);
  console.log('════════════════════════════════════════════════════════════════\n');

  // Display summary
  console.log('📋 SUMMARY:');
  console.log('');
  console.log('All users use the same password: TestPass123!');
  console.log('');
  console.log('Created Users:');
  createdUsers.forEach(user => {
    console.log(`  - ${user.firstName} ${user.lastName} (${user.roleCode})`);
    console.log(`    Email: ${user.email}`);
    console.log(`    Password: TestPass123!`);
    console.log('');
  });

  console.log('📝 NOTE: User credentials have been saved to PROCUREMENT_TEST_USERS.md');
  console.log('   Use this file for testing the procurement module.\n');

  return createdUsers;
}

async function main() {
  try {
    await createProcurementUsers();
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

