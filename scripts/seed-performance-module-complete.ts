// @ts-nocheck
/**
 * Complete Performance Module Seeder
 * 
 * This script seeds the complete performance module with:
 * 1. Hardcoded departments (if missing)
 * 2. KPIs based on hardcoded configuration
 * 3. Performance goals structure
 * 4. Accounting integration setup
 */

import { PrismaClient } from '@prisma/client';
import { DEPARTMENTS } from '../src/config/hardcodedRoles';
import { HARDCODED_KPIS, getAllDepartmentsWithKPIs } from '../src/config/hardcodedKPIs';

const prisma = new PrismaClient();

async function seedPerformanceModuleComplete() {
  console.log('🎯 Seeding Complete Performance Module...');
  console.log('=' .repeat(60));

  try {
    // Step 1: Ensure all departments exist
    console.log('\n🏢 Step 1: Checking/Creating Departments...');
    await ensureDepartmentsExist();

    // Step 2: Seed KPIs
    console.log('\n📈 Step 2: Seeding KPIs...');
    await seedKPIs();

    // Step 3: Display summary
    console.log('\n📊 Step 3: Performance Module Summary...');
    await displayPerformanceModuleSummary();

    console.log('\n🎉 Performance Module seeded successfully!');
    console.log('\n💡 Next Steps:');
    console.log('1. Create performance goals using the hardcoded departments');
    console.log('2. Assign KPIs to goals for accounting integration');
    console.log('3. Use the performance breakdown API to create department goals');
    console.log('4. Convert individual goals to tasks for user assignment');

  } catch (error) {
    console.error('❌ Error seeding performance module:', error);
    throw error;
  }
}

async function ensureDepartmentsExist() {
  const existingDepartments = await prisma.department.findMany({
    select: { id: true, name: true }
  });

  const existingNames = existingDepartments.map(dept => dept.name);
  const missingDepartments = DEPARTMENTS.filter(dept => !existingNames.includes(dept));

  if (missingDepartments.length === 0) {
    console.log('✅ All departments already exist');
    return;
  }

  console.log(`📝 Creating ${missingDepartments.length} missing departments...`);
  for (const departmentName of missingDepartments) {
    const department = await prisma.department.create({
      data: {
        name: departmentName,
        description: `${departmentName} Department`,
        isActive: true
      }
    });
    console.log(`✅ Created: ${department.name}`);
  }
}

async function seedKPIs() {
  const existingKPIs = await prisma.kPI.findMany({
    where: {
      name: {
        in: HARDCODED_KPIS.map(kpi => kpi.name)
      }
    }
  });

  if (existingKPIs.length > 0) {
    console.log('✅ KPIs already exist');
    return;
  }

  const departments = await prisma.department.findMany();
  const departmentMap = new Map(departments.map(dept => [dept.name, dept.id]));

  console.log(`📊 Creating ${HARDCODED_KPIS.length} KPIs...`);
  
  for (const hardcodedKPI of HARDCODED_KPIS) {
    const departmentId = departmentMap.get(hardcodedKPI.department);
    
    if (!departmentId) {
      console.warn(`⚠️ Department not found: ${hardcodedKPI.department}`);
      continue;
    }

    const kpiType = hardcodedKPI.accountType === 'Revenue' || hardcodedKPI.accountType === 'Expense' ? 'Metric' : 'Percentage';
    const unitInfo = getUnitInfo(hardcodedKPI.accountType, hardcodedKPI.name);

    const kpi = await prisma.kPI.create({
      data: {
        name: hardcodedKPI.name,
        type: kpiType,
        departmentId: departmentId,
        weightValue: getWeightValue(hardcodedKPI.department, hardcodedKPI.name),
        hasUnit: unitInfo.hasUnit,
        unitCategory: unitInfo.unitCategory,
        unit: unitInfo.unit,
        unitSymbol: unitInfo.unitSymbol,
        unitPosition: unitInfo.unitPosition,
        isActive: true
      }
    });

    console.log(`✅ Created: ${kpi.name} (${hardcodedKPI.department})`);
  }
}

async function displayPerformanceModuleSummary() {
  // Get all departments
  const departments = await prisma.department.findMany({
    include: {
      _count: {
        select: {
          users: true
        }
      }
    }
  });

  // Get all KPIs
  const kpis = await prisma.kPI.findMany();

  console.log(`\n📊 Performance Module Statistics:`);
  console.log(`- Departments: ${departments.length}`);
  console.log(`- KPIs: ${kpis.length}`);
  console.log(`- Users: ${departments.reduce((sum, dept) => sum + dept._count.users, 0)}`);

  console.log(`\n🏢 Departments:`);
  departments.forEach(dept => {
    console.log(`   • ${dept.name} (${dept._count.users} users)`);
  });

  console.log(`\n📈 KPIs by Department:`);
  const kpisByDept = kpis.reduce((acc, kpi) => {
    const deptName = departments.find(d => d.id === kpi.departmentId)?.name || 'Unknown';
    if (!acc[deptName]) acc[deptName] = [];
    acc[deptName].push(kpi);
    return acc;
  }, {} as Record<string, any[]>);

  Object.entries(kpisByDept).forEach(([dept, deptKPIs]) => {
    console.log(`   ${dept}: ${deptKPIs.length} KPIs`);
  });

  // Display hardcoded KPI configuration
  console.log(`\n🎯 Hardcoded KPI Configuration:`);
  const departmentsWithKPIs = getAllDepartmentsWithKPIs();
  departmentsWithKPIs.forEach(dept => {
    if (dept.kpis.length > 0) {
      console.log(`\n   ${dept.department} (${dept.kpis.length} KPIs):`);
      dept.kpis.forEach(kpi => {
        const financialIcon = kpi.isFinancial ? '💰' : '📊';
        console.log(`     ${financialIcon} ${kpi.name}`);
        if (kpi.accountNumber) {
          console.log(`       → Account: ${kpi.accountNumber} (${kpi.accountType})`);
        }
      });
    }
  });
}

function getUnitInfo(accountType: string, kpiName: string): {
  hasUnit: boolean;
  unitCategory?: string;
  unit?: string;
  unitSymbol?: string;
  unitPosition: string;
} {
  if (accountType === 'Revenue' || accountType === 'Expense' || accountType === 'Asset' || accountType === 'Liability') {
    return {
      hasUnit: true,
      unitCategory: 'currency',
      unit: 'USD',
      unitSymbol: '$',
      unitPosition: 'prefix'
    };
  }

  if (kpiName.toLowerCase().includes('utilization') || kpiName.toLowerCase().includes('rate') || kpiName.toLowerCase().includes('percentage')) {
    return {
      hasUnit: true,
      unitCategory: 'percentage',
      unit: 'Percentage',
      unitSymbol: '%',
      unitPosition: 'suffix'
    };
  }

  if (kpiName.toLowerCase().includes('count') || kpiName.toLowerCase().includes('number') || kpiName.toLowerCase().includes('clients')) {
    return {
      hasUnit: true,
      unitCategory: 'count',
      unit: 'Count',
      unitSymbol: '',
      unitPosition: 'suffix'
    };
  }

  return {
    hasUnit: false,
    unitPosition: 'suffix'
  };
}

function getWeightValue(department: string, kpiName: string): number {
  const departmentWeights: Record<string, number> = {
    'Finance': 0.25,
    'Sales': 0.20,
    'Operations': 0.15,
    'Procurement': 0.15,
    'Human Resources': 0.10,
    'Marketing': 0.10,
    'Legal': 0.05,
    'IT': 0.05
  };

  const baseWeight = departmentWeights[department] || 0.10;

  if (kpiName.toLowerCase().includes('revenue') || kpiName.toLowerCase().includes('profit')) {
    return Math.min(baseWeight * 1.5, 1.0);
  }
  
  if (kpiName.toLowerCase().includes('expense') || kpiName.toLowerCase().includes('cost')) {
    return Math.min(baseWeight * 1.2, 1.0);
  }

  return baseWeight;
}

async function main() {
  try {
    await seedPerformanceModuleComplete();
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
