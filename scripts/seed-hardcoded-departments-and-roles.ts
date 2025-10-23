// @ts-nocheck
/**
 * Seed Hardcoded Departments and Roles Reference
 * 
 * This script demonstrates how hardcoded departments and roles are used in the system.
 * These are NOT stored in the database - they are hardcoded constants used throughout the application.
 */

import { DEPARTMENTS, HARDCODED_ROLES, getAllDepartmentsWithRoles } from '../src/config/hardcodedRoles';
import { HARDCODED_KPIS, getAllDepartmentsWithKPIs } from '../src/config/hardcodedKPIs';

async function displayHardcodedDepartmentsAndRoles() {
  console.log('🏢 HARDCODED DEPARTMENTS AND ROLES REFERENCE');
  console.log('=' .repeat(60));

  try {
    // Display hardcoded departments
    console.log('\n📊 HARDCODED DEPARTMENTS (8 Total):');
    console.log('-'.repeat(40));
    DEPARTMENTS.forEach((dept, index) => {
      console.log(`${index + 1}. ${dept}`);
    });

    // Display departments with roles
    console.log('\n👔 DEPARTMENTS WITH ROLES:');
    console.log('-'.repeat(40));
    const departmentsWithRoles = getAllDepartmentsWithRoles();
    
    departmentsWithRoles.forEach(dept => {
      console.log(`\n🏢 ${dept.department} (${dept.roles.length} roles):`);
      dept.roles.forEach(role => {
        const levelText = getLevelText(role.level);
        console.log(`   • ${role.code} - ${role.name} (${levelText})`);
      });
    });

    // Display departments with KPIs
    console.log('\n📈 DEPARTMENTS WITH KPIs:');
    console.log('-'.repeat(40));
    const departmentsWithKPIs = getAllDepartmentsWithKPIs();
    
    departmentsWithKPIs.forEach(dept => {
      if (dept.kpis.length > 0) {
        console.log(`\n🏢 ${dept.department} (${dept.kpis.length} KPIs):`);
        dept.kpis.forEach(kpi => {
          const financialIcon = kpi.isFinancial ? '💰' : '📊';
          console.log(`   ${financialIcon} ${kpi.code} - ${kpi.name}`);
          if (kpi.accountNumber) {
            console.log(`      → Account: ${kpi.accountNumber} (${kpi.accountType})`);
          }
        });
      }
    });

    // Display usage examples
    console.log('\n💡 USAGE EXAMPLES:');
    console.log('-'.repeat(40));
    console.log('\n1. Performance Goals:');
    console.log('   departmentName: "Finance"  // Use hardcoded department name');
    console.log('   departmentName: "Sales"    // Not database ID');
    
    console.log('\n2. Task Assignment:');
    console.log('   department: "Operations"   // Use hardcoded department name');
    console.log('   team: ["user1", "user2"]   // User IDs');
    
    console.log('\n3. User Department Assignment:');
    console.log('   userDepartment: "Marketing" // Use hardcoded department name');
    console.log('   departmentRole: "HEAD"      // HEAD, DEPUTY, MEMBER');
    
    console.log('\n4. KPI Assignment:');
    console.log('   kpi.department: "Finance"   // Use hardcoded department name');
    console.log('   kpi.code: "TOTAL_REVENUE"  // Use hardcoded KPI code');

    // Display validation functions
    console.log('\n🔍 VALIDATION FUNCTIONS:');
    console.log('-'.repeat(40));
    console.log('\n// Check if department is valid:');
    console.log('const isValidDept = DEPARTMENTS.includes("Finance"); // true');
    console.log('const isValidDept = DEPARTMENTS.includes("Invalid"); // false');
    
    console.log('\n// Check if role code is valid:');
    console.log('const isValidRole = isValidRoleCode("FIN_MGR"); // true');
    console.log('const isValidRole = isValidRoleCode("INVALID"); // false');
    
    console.log('\n// Check if role belongs to department:');
    console.log('const belongsToDept = rolebelongsToDepartment("FIN_MGR", "Finance"); // true');
    console.log('const belongsToDept = rolebelongsToDepartment("FIN_MGR", "Sales"); // false');

    // Display API endpoints
    console.log('\n🌐 API ENDPOINTS:');
    console.log('-'.repeat(40));
    console.log('\n// Get all hardcoded departments:');
    console.log('GET /api/hardcoded-roles/departments');
    
    console.log('\n// Get all hardcoded roles:');
    console.log('GET /api/hardcoded-roles');
    
    console.log('\n// Get departments with roles:');
    console.log('GET /api/hardcoded-roles/departments-with-roles');
    
    console.log('\n// Get all KPIs:');
    console.log('GET /api/hardcoded-kpis');
    
    console.log('\n// Get KPIs by department:');
    console.log('GET /api/hardcoded-kpis/department/Finance');

    // Display summary
    console.log('\n📊 SUMMARY:');
    console.log('-'.repeat(40));
    console.log(`✅ Departments: ${DEPARTMENTS.length} hardcoded departments`);
    console.log(`✅ Roles: ${HARDCODED_ROLES.length} hardcoded roles`);
    console.log(`✅ KPIs: ${HARDCODED_KPIS.length} hardcoded KPIs`);
    console.log('\n🎯 These are used as CONSTANTS throughout the system, not database records!');
    console.log('🎯 They provide consistent department names, role codes, and KPI mappings.');
    console.log('🎯 Perfect for performance module, task assignment, and user organization.');

  } catch (error) {
    console.error('❌ Error displaying hardcoded departments and roles:', error);
    throw error;
  }
}

/**
 * Get level text for role level
 */
function getLevelText(level: number): string {
  switch (level) {
    case 5: return 'Manager (Level 5)';
    case 4: return 'Officer (Level 4)';
    case 3: return 'Specialist (Level 3)';
    case 2: return 'Assistant (Level 2)';
    case 1: return 'Member (Level 1)';
    default: return `Level ${level}`;
  }
}

async function main() {
  try {
    await displayHardcodedDepartmentsAndRoles();
  } catch (error) {
    console.error('❌ Display failed:', error);
    process.exit(1);
  }
}

main();
