// Quick verification script
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, 'src/config/hardcodedRoles.ts');
const configContent = fs.readFileSync(configPath, 'utf8');

// Check if Investments is in DEPARTMENTS
const departmentsMatch = configContent.match(/export const DEPARTMENTS = \[([\s\S]*?)\]/);
if (departmentsMatch) {
  const departmentsList = departmentsMatch[1];
  const hasInvestments = departmentsList.includes('"Investments"');
  console.log('✅ Investments in DEPARTMENTS:', hasInvestments);
}

// Count Investments roles
const investmentsRoles = configContent.match(/department: "Investments"/g);
const investmentsCount = investmentsRoles ? investmentsRoles.length : 0;
console.log('✅ Investments roles count:', investmentsCount);

// Count total roles
const totalRoles = configContent.match(/code: "/g);
const totalCount = totalRoles ? totalRoles.length : 0;
console.log('✅ Total roles:', totalCount);

// Count total departments
const departments = configContent.match(/"Finance"|"Sales"|"Operations"|"Procurement"|"Human Resources"|"Marketing"|"Legal"|"IT"|"Investments"/g);
const deptCount = departments ? departments.length : 0;
console.log('✅ Total departments:', deptCount);

console.log('\n📋 Summary:');
console.log(`   - Expected departments: 9 (including Investments)`);
console.log(`   - Expected total roles: 49 (40 existing + 9 Investments)`);
console.log(`   - Investments roles: ${investmentsCount} (should be 9)`);

