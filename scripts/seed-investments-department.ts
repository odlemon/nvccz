// @ts-nocheck
/**
 * Seed Investments Department and Roles
 * 
 * This script adds the Investments department and its roles to the system.
 * Run this script to add the new Investments department with all its roles.
 */

import { PrismaClient } from '@prisma/client';
import { DEPARTMENTS, HARDCODED_ROLES } from '../src/config/hardcodedRoles';

const prisma = new PrismaClient();

async function seedInvestmentsDepartment() {
  console.log('💼 Seeding Investments Department and Roles...');
  console.log('='.repeat(60));

  try {
    // Step 1: Create Investments Department
    console.log('\n📊 Step 1: Creating Investments Department...');
    
    const existingDept = await prisma.department.findFirst({
      where: { name: 'Investments' }
    });

    let investmentsDept;
    if (existingDept) {
      console.log('✅ Investments department already exists');
      investmentsDept = existingDept;
    } else {
      investmentsDept = await prisma.department.create({
        data: {
          name: 'Investments',
          description: 'Investments Department - Manages investment portfolios, funds, and compliance',
          isActive: true
        }
      });
      console.log(`✅ Created department: ${investmentsDept.name}`);
    }

    // Step 2: Get Investments roles from hardcoded config
    console.log('\n👔 Step 2: Creating Investments Department Roles...');
    
    const investmentsRoles = HARDCODED_ROLES.filter(role => role.department === 'Investments');
    console.log(`📋 Found ${investmentsRoles.length} roles to create for Investments department`);

    // Check existing roles
    const existingRoleNames = investmentsRoles.map(r => r.name);
    const existingRoles = await prisma.role.findMany({
      where: {
        name: {
          in: existingRoleNames
        }
      }
    });

    const existingRoleNamesSet = new Set(existingRoles.map(r => r.name));
    const rolesToCreate = investmentsRoles.filter(r => !existingRoleNamesSet.has(r.name));

    if (rolesToCreate.length === 0) {
      console.log('✅ All Investments roles already exist, skipping...');
    } else {
      console.log(`📝 Creating ${rolesToCreate.length} new roles...`);

      // Create all Investments roles
      for (const hardcodedRole of rolesToCreate) {
        // Generate permissions based on role level
        const permissions = generatePermissionsForRole(hardcodedRole.level, hardcodedRole.department);

        const role = await prisma.role.create({
          data: {
            name: hardcodedRole.name,
            description: hardcodedRole.description,
            permissions: permissions
          }
        });

        const levelText = getLevelText(hardcodedRole.level);
        console.log(`✅ Created role: ${role.name} (${levelText}) - Code: ${hardcodedRole.code}`);
      }
    }

    // Step 3: Display summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Department: Investments`);
    console.log(`✅ Total Roles: ${investmentsRoles.length}`);
    console.log(`✅ Created: ${rolesToCreate.length}`);
    console.log(`✅ Existing: ${existingRoles.length}`);
    
    console.log('\n👔 Investments Department Roles:');
    investmentsRoles.forEach(role => {
      const levelText = getLevelText(role.level);
      const status = existingRoleNamesSet.has(role.name) ? '(exists)' : '(created)';
      console.log(`   • ${role.name} (${levelText}, Code: ${role.code}) ${status}`);
    });

    console.log('\n🎉 Investments department and roles seeded successfully!');
    console.log('\n💡 Next Steps:');
    console.log('   - Users can now be assigned to the Investments department');
    console.log('   - Users can be assigned one of the Investments roles');
    console.log('   - Use roleCode field in user profile for role assignment');

  } catch (error) {
    console.error('❌ Error seeding Investments department:', error);
    throw error;
  }
}

/**
 * Generate permissions based on role level and department
 * Avoids duplicate permissions by using a Set
 */
function generatePermissionsForRole(level: number, department: string): any[] {
  const permissionsMap = new Map<string, any>();

  // Base permissions (always included)
  permissionsMap.set("view_dashboard", { name: "view_dashboard", value: true });
  permissionsMap.set("view_reports", { name: "view_reports", value: true });

  // Department permissions
  const deptKey = department.toLowerCase().replace(/\s+/g, '_');
  permissionsMap.set(`view_${deptKey}`, { name: `view_${deptKey}`, value: true });
  if (level >= 3) {
    permissionsMap.set(`manage_${deptKey}`, { name: `manage_${deptKey}`, value: true });
  }

  // Level 5 (Manager/Executive) - Full access
  if (level >= 5) {
    permissionsMap.set("manage_users", { name: "manage_users", value: true });
    permissionsMap.set("manage_roles", { name: "manage_roles", value: true });
    permissionsMap.set("view_financial_reports", { name: "view_financial_reports", value: true });
    permissionsMap.set("manage_financial_reports", { name: "manage_financial_reports", value: true });
    permissionsMap.set("view_accounting", { name: "view_accounting", value: true });
    permissionsMap.set("manage_accounting", { name: "manage_accounting", value: true });
    permissionsMap.set("view_ledger", { name: "view_ledger", value: true });
    permissionsMap.set("manage_ledger", { name: "manage_ledger", value: true });
    permissionsMap.set("view_business_operations", { name: "view_business_operations", value: true });
    permissionsMap.set("manage_business_operations", { name: "manage_business_operations", value: true });
    permissionsMap.set("view_company_data", { name: "view_company_data", value: true });
    permissionsMap.set("manage_company_data", { name: "manage_company_data", value: true });
    permissionsMap.set("view_erp_reports", { name: "view_erp_reports", value: true });
    permissionsMap.set("manage_erp_reports", { name: "manage_erp_reports", value: true });
    permissionsMap.set("view_subscription", { name: "view_subscription", value: true });
    permissionsMap.set("manage_subscription", { name: "manage_subscription", value: true });
    permissionsMap.set("manage_firm_settings", { name: "manage_firm_settings", value: true });
    permissionsMap.set("bank_reconciliation", { name: "bank_reconciliation", value: true });
    permissionsMap.set("view_portfolio", { name: "view_portfolio", value: true });
    permissionsMap.set("manage_portfolio", { name: "manage_portfolio", value: true });
    permissionsMap.set("view_investments", { name: "view_investments", value: true });
    permissionsMap.set("manage_investments", { name: "manage_investments", value: true });
  }

  // Level 4 (Officer/Senior) - High access (but not level 5)
  if (level >= 4 && level < 5) {
    permissionsMap.set("view_accounting", { name: "view_accounting", value: true });
    permissionsMap.set("view_ledger", { name: "view_ledger", value: true });
    permissionsMap.set("view_business_operations", { name: "view_business_operations", value: true });
    permissionsMap.set("view_company_data", { name: "view_company_data", value: true });
    permissionsMap.set("view_erp_reports", { name: "view_erp_reports", value: true });
    permissionsMap.set("view_portfolio", { name: "view_portfolio", value: true });
    permissionsMap.set("view_investments", { name: "view_investments", value: true });
    permissionsMap.set("manage_investments", { name: "manage_investments", value: true });
  }

  // Level 3 (Specialist/Analyst) - Medium access (but not level 4+)
  if (level >= 3 && level < 4) {
    permissionsMap.set("view_structure", { name: "view_structure", value: true });
    permissionsMap.set("view_accounting", { name: "view_accounting", value: true });
    permissionsMap.set("view_financial_reports", { name: "view_financial_reports", value: true });
    permissionsMap.set("view_portfolio", { name: "view_portfolio", value: true });
    permissionsMap.set("view_investments", { name: "view_investments", value: true });
  }

  // Level 2 (Assistant/Limited) - Basic access (but not level 3+)
  if (level >= 2 && level < 3) {
    permissionsMap.set("create_worklog", { name: "create_worklog", value: true });
    permissionsMap.set("edit_worklog", { name: "edit_worklog", value: true });
    permissionsMap.set("view_worklog", { name: "view_worklog", value: true });
    permissionsMap.set("view_portfolio", { name: "view_portfolio", value: true });
  }

  // Level 1 (Member) - View only (but not level 2+)
  if (level === 1) {
    permissionsMap.set("view_worklog", { name: "view_worklog", value: true });
  }

  return Array.from(permissionsMap.values());
}

/**
 * Get level text description
 */
function getLevelText(level: number): string {
  const levelMap: Record<number, string> = {
    5: 'Executive/Manager',
    4: 'Officer/Senior',
    3: 'Specialist/Analyst',
    2: 'Assistant/Limited',
    1: 'Member'
  };
  return levelMap[level] || `Level ${level}`;
}

async function main() {
  try {
    await seedInvestmentsDepartment();
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

