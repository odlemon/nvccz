// @ts-nocheck
/**
 * Check and Create Departments
 * 
 * This script checks what departments exist in the database and creates the missing ones
 * needed for the KPI seeder.
 */

import { PrismaClient } from '@prisma/client';
import { DEPARTMENTS } from '../src/config/hardcodedRoles';

const prisma = new PrismaClient();

async function checkAndCreateDepartments() {
  console.log('🏢 Checking and creating departments...');

  try {
    // Get existing departments
    const existingDepartments = await prisma.department.findMany({
      select: { id: true, name: true }
    });

    console.log(`\n📊 Found ${existingDepartments.length} existing departments:`);
    existingDepartments.forEach(dept => {
      console.log(`   • ${dept.name} (${dept.id})`);
    });

    // Check which hardcoded departments are missing
    const existingNames = existingDepartments.map(dept => dept.name);
    const missingDepartments = DEPARTMENTS.filter(dept => !existingNames.includes(dept));

    if (missingDepartments.length === 0) {
      console.log('\n✅ All hardcoded departments already exist!');
      return;
    }

    console.log(`\n📝 Missing departments (${missingDepartments.length}):`);
    missingDepartments.forEach(dept => {
      console.log(`   • ${dept}`);
    });

    // Create missing departments
    console.log('\n🏗️ Creating missing departments...');
    for (const departmentName of missingDepartments) {
      const department = await prisma.department.create({
        data: {
          name: departmentName,
          description: `${departmentName} Department`,
          isActive: true
        }
      });
      console.log(`✅ Created department: ${department.name} (${department.id})`);
    }

    console.log('\n🎉 All departments are now available!');

  } catch (error) {
    console.error('❌ Error checking/creating departments:', error);
    throw error;
  }
}

async function main() {
  try {
    await checkAndCreateDepartments();
  } catch (error) {
    console.error('❌ Operation failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
