// @ts-nocheck
/**
 * Step 1: Seed Departments
 * 
 * This script creates the 8 hardcoded departments.
 * Run this first before other seeders.
 */

import { PrismaClient } from '@prisma/client';
import { DEPARTMENTS } from '../src/config/hardcodedRoles';

const prisma = new PrismaClient();

async function seedDepartments() {
  console.log('🏢 Step 1: Seeding Departments...');
  console.log('=' .repeat(50));

  try {
    // Check if departments already exist
    const existingDepartments = await prisma.department.findMany({
      where: {
        name: {
          in: DEPARTMENTS
        }
      }
    });

    if (existingDepartments.length > 0) {
      console.log('✅ Departments already exist, skipping...');
      console.log(`Found ${existingDepartments.length} existing departments:`);
      existingDepartments.forEach(dept => {
        console.log(`   • ${dept.name}`);
      });
      return;
    }

    console.log(`📊 Creating ${DEPARTMENTS.length} hardcoded departments...`);
    
    // Create all hardcoded departments
    for (const departmentName of DEPARTMENTS) {
      const department = await prisma.department.create({
        data: {
          name: departmentName,
          description: `${departmentName} Department`,
          isActive: true
        }
      });
      console.log(`✅ Created department: ${department.name}`);
    }

    console.log('\n🎉 Departments seeded successfully!');
    console.log('\n📊 Summary:');
    console.log(`- Created ${DEPARTMENTS.length} departments`);
    console.log('- All departments are active and ready for use');
    console.log('- Departments: Finance, Sales, Operations, Procurement, HR, Marketing, Legal, IT');

  } catch (error) {
    console.error('❌ Error seeding departments:', error);
    throw error;
  }
}

async function main() {
  try {
    await seedDepartments();
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
