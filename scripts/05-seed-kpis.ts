// @ts-nocheck
/**
 * Step 5: Seed KPIs
 * 
 * This script creates the 27 hardcoded KPIs for performance tracking.
 * Run this after departments are created.
 */

import { PrismaClient } from '@prisma/client';
import { HARDCODED_KPIS } from '../src/config/hardcodedKPIs';

const prisma = new PrismaClient();

async function seedKPIs() {
  console.log('📈 Step 5: Seeding KPIs...');
  console.log('=' .repeat(50));

  try {
    // Check if KPIs already exist
    const existingKPIs = await prisma.kPI.findMany({
      where: {
        name: {
          in: HARDCODED_KPIS.map(kpi => kpi.name)
        }
      }
    });

    if (existingKPIs.length > 0) {
      console.log('✅ KPIs already exist, skipping...');
      console.log(`Found ${existingKPIs.length} existing KPIs`);
      return;
    }

    // Get departments for KPI assignment
    const departments = await prisma.department.findMany();
    const departmentMap = new Map(departments.map(dept => [dept.name, dept.id]));

    console.log(`📊 Found ${departments.length} departments`);
    console.log(`👔 Creating ${HARDCODED_KPIS.length} hardcoded KPIs...`);

    // Create hardcoded KPIs
    for (const hardcodedKPI of HARDCODED_KPIS) {
      const departmentId = departmentMap.get(hardcodedKPI.department);
      
      if (!departmentId) {
        console.warn(`⚠️ Department not found for KPI: ${hardcodedKPI.name} (${hardcodedKPI.department})`);
        continue;
      }

      // Determine KPI type and unit information based on account type
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

      console.log(`✅ Created KPI: ${kpi.name} (${hardcodedKPI.department})`);
    }

    console.log('\n🎉 KPIs seeded successfully!');
    console.log('\n📊 Summary:');
    console.log(`- Created ${HARDCODED_KPIS.length} KPIs`);
    console.log('- Financial KPIs generate journal entries when goals are completed');
    console.log('- Each KPI is linked to a department for performance tracking');
    console.log('- KPIs support both metric and percentage types');

    // Display KPIs by department
    const kpisByDept = HARDCODED_KPIS.reduce((acc, kpi) => {
      if (!acc[kpi.department]) acc[kpi.department] = [];
      acc[kpi.department].push(kpi);
      return acc;
    }, {} as Record<string, any[]>);

    console.log('\n📈 KPIs by Department:');
    Object.entries(kpisByDept).forEach(([dept, kpis]) => {
      console.log(`\n🏢 ${dept} (${kpis.length} KPIs):`);
      kpis.forEach(kpi => {
        const financialIcon = kpi.isFinancial ? '💰' : '📊';
        console.log(`   ${financialIcon} ${kpi.name}`);
        if (kpi.accountNumber) {
          console.log(`      → Account: ${kpi.accountNumber} (${kpi.accountType})`);
        }
      });
    });

  } catch (error) {
    console.error('❌ Error seeding KPIs:', error);
    throw error;
  }
}

function getUnitInfo(accountType: string, kpiName: string): {
  hasUnit: boolean;
  unitCategory?: string;
  unit?: string;
  unitSymbol?: string;
  unitPosition: string;
} {
  // Financial KPIs with currency units
  if (accountType === 'Revenue' || accountType === 'Expense' || accountType === 'Asset' || accountType === 'Liability') {
    return {
      hasUnit: true,
      unitCategory: 'currency',
      unit: 'USD',
      unitSymbol: '$',
      unitPosition: 'prefix'
    };
  }

  // Percentage-based KPIs
  if (kpiName.toLowerCase().includes('utilization') || kpiName.toLowerCase().includes('rate') || kpiName.toLowerCase().includes('percentage')) {
    return {
      hasUnit: true,
      unitCategory: 'percentage',
      unit: 'Percentage',
      unitSymbol: '%',
      unitPosition: 'suffix'
    };
  }

  // Count-based KPIs
  if (kpiName.toLowerCase().includes('count') || kpiName.toLowerCase().includes('number') || kpiName.toLowerCase().includes('clients')) {
    return {
      hasUnit: true,
      unitCategory: 'count',
      unit: 'Count',
      unitSymbol: '',
      unitPosition: 'suffix'
    };
  }

  // Default: no unit
  return {
    hasUnit: false,
    unitPosition: 'suffix'
  };
}

function getWeightValue(department: string, kpiName: string): number {
  // Base weights by department
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

  // Adjust weight based on KPI importance
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
    await seedKPIs();
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
