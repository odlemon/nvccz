// @ts-nocheck
/**
 * Step 2: Seed Roles
 * 
 * This script creates the 40 hardcoded roles (5 per department).
 * Run this after departments are created.
 */

import { PrismaClient } from '@prisma/client';
import { HARDCODED_ROLES } from '../src/config/hardcodedRoles';

const prisma = new PrismaClient();

async function seedRoles() {
  console.log('👔 Step 2: Seeding Roles...');
  console.log('=' .repeat(50));

  try {
    // Check if roles already exist
    const existingRoles = await prisma.role.findMany({
      where: {
        name: {
          in: HARDCODED_ROLES.map(role => role.name)
        }
      }
    });

    if (existingRoles.length > 0) {
      console.log('✅ Roles already exist, skipping...');
      console.log(`Found ${existingRoles.length} existing roles`);
      return;
    }

    console.log(`📊 Creating ${HARDCODED_ROLES.length} hardcoded roles...`);
    
    // Create hardcoded roles
    for (const hardcodedRole of HARDCODED_ROLES) {
      const role = await prisma.role.create({
        data: {
          name: hardcodedRole.name,
          description: hardcodedRole.description,
          permissions: getDefaultPermissionsForLevel(hardcodedRole.level, hardcodedRole.department)
        }
      });

      const levelText = getLevelText(hardcodedRole.level);
      console.log(`✅ Created role: ${role.name} (${hardcodedRole.department} - ${levelText})`);
    }

    console.log('\n🎉 Roles seeded successfully!');
    console.log('\n📊 Summary:');
    console.log(`- Created ${HARDCODED_ROLES.length} roles`);
    console.log('- 5 roles per department (Manager, Officer, Specialist, Assistant, Member)');
    console.log('- Each role has appropriate permissions based on level');

    // Display roles by department
    const rolesByDept = HARDCODED_ROLES.reduce((acc, role) => {
      if (!acc[role.department]) acc[role.department] = [];
      acc[role.department].push(role);
      return acc;
    }, {} as Record<string, any[]>);

    console.log('\n👔 Roles by Department:');
    Object.entries(rolesByDept).forEach(([dept, roles]) => {
      console.log(`\n🏢 ${dept} (${roles.length} roles):`);
      roles.forEach(role => {
        const levelText = getLevelText(role.level);
        console.log(`   • ${role.name} (${levelText})`);
      });
    });

  } catch (error) {
    console.error('❌ Error seeding roles:', error);
    throw error;
  }
}

function getDefaultPermissionsForLevel(level: number, department: string): any[] {
  const basePermissions = [
    { name: "view_dashboard", value: true },
    { name: "view_reports", value: true }
  ];

  // Level-based permissions
  if (level >= 5) { // Manager level
    basePermissions.push(
      { name: "manage_users", value: true },
      { name: "manage_roles", value: true },
      { name: "view_financial_reports", value: true },
      { name: "manage_financial_reports", value: true },
      { name: "view_accounting", value: true },
      { name: "manage_accounting", value: true },
      { name: "view_ledger", value: true },
      { name: "manage_ledger", value: true },
      { name: "manage_firm_settings", value: true }
    );
  }

  if (level >= 4) { // Officer level
    basePermissions.push(
      { name: "view_accounting", value: true },
      { name: "view_ledger", value: true },
      { name: "view_financial_reports", value: true }
    );
  }

  if (level >= 3) { // Specialist level
    basePermissions.push(
      { name: "view_accounting", value: true },
      { name: "view_ledger", value: true }
    );
  }

  // Department-specific permissions
  if (department === 'Finance') {
    basePermissions.push(
      { name: "view_accounting", value: true },
      { name: "manage_accounting", value: level >= 4 },
      { name: "view_ledger", value: true },
      { name: "manage_ledger", value: level >= 4 },
      { name: "view_financial_reports", value: true },
      { name: "manage_financial_reports", value: level >= 5 },
      { name: "bank_reconciliation", value: level >= 4 }
    );
  }

  if (department === 'Sales' || department === 'Operations' || department === 'Procurement') {
    basePermissions.push(
      { name: "view_business_operations", value: true },
      { name: "manage_business_operations", value: level >= 4 }
    );
  }

  if (department === 'Human Resources') {
    basePermissions.push(
      { name: "manage_users", value: level >= 4 },
      { name: "manage_roles", value: level >= 5 }
    );
  }

  // Worklog permissions for all levels
  basePermissions.push(
    { name: "create_worklog", value: true },
    { name: "edit_worklog", value: true },
    { name: "view_worklog", value: true }
  );

  if (level >= 4) {
    basePermissions.push({ name: "delete_worklog", value: true });
  }

  return basePermissions;
}

function getLevelText(level: number): string {
  switch (level) {
    case 5: return 'Manager';
    case 4: return 'Officer';
    case 3: return 'Specialist';
    case 2: return 'Assistant';
    case 1: return 'Member';
    default: return 'Unknown';
  }
}

async function main() {
  try {
    await seedRoles();
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
