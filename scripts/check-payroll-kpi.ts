import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkPayrollKPI() {
  try {
    // First, check the hardcoded KPI
    console.log('📊 Checking for Payroll-related KPI...\n');
    
    // Check database KPIs
    const kpis = await prisma.kPI.findMany({
      where: {
        name: {
          contains: 'Payroll',
        },
      },
    });

    console.log(`Found ${kpis.length} KPI(s) with "Payroll" in name:\n`);
    
    kpis.forEach((kpi, index) => {
      console.log(`${index + 1}. KPI: "${kpi.name}"`);
      console.log(`   ID: ${kpi.id}`);
      console.log(`   Type: ${kpi.type}`);
      console.log(`   Unit: ${kpi.unit || 'N/A'}`);
      console.log(`   Unit Symbol: ${kpi.unitSymbol || 'N/A'}`);
      console.log(`   Department ID: ${kpi.departmentId || 'None'}`);
      console.log('');
    });

    // Check all KPIs if none found
    if (kpis.length === 0) {
      console.log('No Payroll KPI found in database. Checking all KPIs...\n');
      const allKPIs = await prisma.kPI.findMany({
        take: 20,
      });
      console.log(`Showing first ${allKPIs.length} KPIs in database:\n`);
      allKPIs.forEach((kpi, index) => {
        console.log(`${index + 1}. "${kpi.name}" (Type: ${kpi.type})`);
      });
    }

    // Now check if any goals use this KPI
    if (kpis.length > 0) {
      const kpiId = kpis[0].id;
      const goalsWithKPI = await prisma.performanceGoal.findMany({
        where: {
          kpiId: kpiId,
        },
        include: {
          kpi: true,
        },
      });

      console.log(`\n\n🎯 Goals using this KPI:\n`);
      if (goalsWithKPI.length === 0) {
        console.log('No goals are currently using this KPI.');
      } else {
        goalsWithKPI.forEach((goal, index) => {
          console.log(`${index + 1}. Goal: "${goal.title}"`);
          console.log(`   ID: ${goal.id}`);
          console.log(`   KPI: ${goal.kpi?.name || 'None'}`);
        });
      }
    }

    // Also check hardcoded KPIs
    console.log('\n\n📋 Hardcoded KPI Information:');
    console.log('According to src/config/hardcodedKPIs.ts:');
    console.log('  Code: PAYROLL_EXPENSE');
    console.log('  Name: Payroll Expense');
    console.log('  Department: Human Resources');
    console.log('  Account Type: Expense');
    console.log('  Account Number: 5030 (Salaries and Wages)');
    console.log('  Journal Entry Type: Debit');
    console.log('  Financial: Yes');

  } catch (error) {
    console.error('Error checking payroll KPI:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkPayrollKPI();

