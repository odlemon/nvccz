// @ts-nocheck
/**
 * Seed Departments and Roles
 * 
 * This script seeds the database with hardcoded departments and roles
 * based on the hardcoded configuration files.
 */

import { PrismaClient } from '@prisma/client';
import { DEPARTMENTS, HARDCODED_ROLES } from '../src/config/hardcodedRoles';

const prisma = new PrismaClient();

async function seedDepartmentsAndRoles() {
  console.log('🏢 Seeding hardcoded departments and roles...');

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
      console.log('✅ Departments already exist, skipping department creation...');
    } else {
      console.log('📊 Creating departments...');
      
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
    }

    // Check if roles already exist
    const existingRoles = await prisma.role.findMany({
      where: {
        name: {
          in: HARDCODED_ROLES.map(role => role.name)
        }
      }
    });

    if (existingRoles.length > 0) {
      console.log('✅ Roles already exist, skipping role creation...');
    } else {
      console.log('👔 Creating roles...');
      
      // Get all departments for role assignment
      const departments = await prisma.department.findMany();
      const departmentMap = new Map(departments.map(dept => [dept.name, dept.id]));

      // Create all hardcoded roles
      for (const hardcodedRole of HARDCODED_ROLES) {
        const departmentId = departmentMap.get(hardcodedRole.department);
        
        if (!departmentId) {
          console.warn(`⚠️ Department not found for role: ${hardcodedRole.name} (${hardcodedRole.department})`);
          continue;
        }

        // Create permissions based on role level
        const permissions = generatePermissionsForRole(hardcodedRole.level, hardcodedRole.department);

        const role = await prisma.role.create({
          data: {
            name: hardcodedRole.name,
            description: hardcodedRole.description,
            permissions: permissions,
            departmentId: departmentId
          }
        });
        console.log(`✅ Created role: ${role.name} (${hardcodedRole.department})`);
      }
    }

    console.log('\n🎉 Departments and roles seeded successfully!');
    console.log('\n📊 Summary:');
    console.log(`- Departments: ${DEPARTMENTS.length} hardcoded departments`);
    console.log(`- Roles: ${HARDCODED_ROLES.length} hardcoded roles`);
    console.log('\n🏢 Departments created:');
    DEPARTMENTS.forEach(dept => console.log(`   • ${dept}`));
    
    console.log('\n👔 Roles by department:');
    const rolesByDept = HARDCODED_ROLES.reduce((acc, role) => {
      if (!acc[role.department]) acc[role.department] = [];
      acc[role.department].push(role.name);
      return acc;
    }, {} as Record<string, string[]>);

    Object.entries(rolesByDept).forEach(([dept, roles]) => {
      console.log(`   ${dept}:`);
      roles.forEach(role => console.log(`     • ${role}`));
    });

  } catch (error) {
    console.error('❌ Error seeding departments and roles:', error);
    throw error;
  }
}

/**
 * Generate permissions based on role level and department
 */
function generatePermissionsForRole(level: number, department: string): any[] {
  const basePermissions = [
    { name: "view_dashboard", value: true },
    { name: "view_reports", value: true }
  ];

  const departmentPermissions = [
    { name: `view_${department.toLowerCase().replace(/\s+/g, '_')}`, value: true },
    { name: `manage_${department.toLowerCase().replace(/\s+/g, '_')}`, value: level >= 3 }
  ];

  const levelPermissions = [];
  
  // Level 5 (Manager) - Full access
  if (level >= 5) {
    levelPermissions.push(
      { name: "manage_users", value: true },
      { name: "manage_roles", value: true },
      { name: "view_financial_reports", value: true },
      { name: "manage_financial_reports", value: true },
      { name: "view_accounting", value: true },
      { name: "manage_accounting", value: true },
      { name: "view_ledger", value: true },
      { name: "manage_ledger", value: true },
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
    );
  }

  // Level 4 (Officer) - High access
  if (level >= 4) {
    levelPermissions.push(
      { name: "view_accounting", value: true },
      { name: "view_ledger", value: true },
      { name: "view_business_operations", value: true },
      { name: "view_company_data", value: true },
      { name: "view_erp_reports", value: true }
    );
  }

  // Level 3 (Specialist) - Medium access
  if (level >= 3) {
    levelPermissions.push(
      { name: "view_structure", value: true },
      { name: "view_accounting", value: true },
      { name: "view_financial_reports", value: true }
    );
  }

  // Level 2 (Assistant) - Basic access
  if (level >= 2) {
    levelPermissions.push(
      { name: "create_worklog", value: true },
      { name: "edit_worklog", value: true },
      { name: "view_worklog", value: true }
    );
  }

  // Level 1 (Member) - View only
  if (level >= 1) {
    levelPermissions.push(
      { name: "view_worklog", value: true }
    );
  }

  return [...basePermissions, ...departmentPermissions, ...levelPermissions];
}

async function main() {
  try {
    await seedDepartmentsAndRoles();
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
