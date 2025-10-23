// @ts-nocheck
/**
 * Check Departments and Roles
 * 
 * This script checks what departments exist and what roles are assigned to users.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDepartmentsAndRoles() {
  console.log('🏢 Checking Departments and Roles...');
  console.log('=' .repeat(50));

  try {
    // Get all departments
    const departments = await prisma.department.findMany({
      include: {
        users: {
          include: {
            role: true
          }
        }
      }
    });

    console.log(`\n📊 Found ${departments.length} departments:`);
    
    departments.forEach(dept => {
      console.log(`\n🏢 ${dept.name}:`);
      console.log(`   Users: ${dept.users.length}`);
      
      if (dept.users.length > 0) {
        dept.users.forEach(user => {
          console.log(`   • ${user.firstName} ${user.lastName} (${user.email})`);
          console.log(`     Role: ${user.role?.name || 'No role assigned'}`);
          console.log(`     Department: ${dept.name}`);
        });
      } else {
        console.log(`   No users assigned to this department`);
      }
    });

    // Get all users with their roles and departments
    console.log('\n👤 All Users in System:');
    const allUsers = await prisma.user.findMany({
      include: {
        role: true,
        department: true
      }
    });

    console.log(`\n📊 Found ${allUsers.length} users:`);
    allUsers.forEach(user => {
      console.log(`\n👤 ${user.firstName} ${user.lastName} (${user.email}):`);
      console.log(`   Role: ${user.role?.name || 'No role'}`);
      console.log(`   Department: ${user.department?.name || 'No department'}`);
    });

    // Get all roles
    console.log('\n🔐 All Roles in System:');
    const allRoles = await prisma.role.findMany();
    console.log(`\n📊 Found ${allRoles.length} roles:`);
    allRoles.forEach(role => {
      console.log(`   • ${role.name}: ${role.description}`);
    });

  } catch (error) {
    console.error('❌ Error checking departments and roles:', error);
    throw error;
  }
}

async function main() {
  try {
    await checkDepartmentsAndRoles();
  } catch (error) {
    console.error('❌ Operation failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
