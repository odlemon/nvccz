import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function verifyPerformanceData() {
  try {
    console.log("🔍 Verifying Performance Module Data");
    console.log("═══════════════════════════════════════════════════════════\n");

    // Step 1: Find Payroll Expense KPI
    const payrollKPI = await prisma.kPI.findFirst({
      where: { name: "Payroll Expense" },
      include: {
        performanceGoals: {
          include: {
            parentGoal: {
              select: { id: true, title: true }
            },
            subGoals: {
              select: {
                id: true,
                title: true,
                currentValue: true,
                targetValue: true,
                progressPercentage: true,
                stage: true
              }
            }
          }
        }
      }
    });

    if (!payrollKPI) {
      console.log("❌ Payroll Expense KPI not found");
      return;
    }

    console.log(`✅ Found Payroll Expense KPI: ${payrollKPI.id}`);
    console.log(`   Goals linked: ${payrollKPI.performanceGoals.length}\n`);

    // Step 2: Verify each goal
    for (const goal of payrollKPI.performanceGoals) {
      console.log(`📊 Goal: "${goal.title}" (${goal.id})`);
      console.log(`   Type: ${goal.type}`);
      console.log(`   Status: ${goal.status}`);
      console.log(`   Stage: ${goal.stage}`);
      console.log(`   Target Value: $${goal.targetValue || 0}`);
      console.log(`   Current Value: $${goal.currentValue || 0}`);
      console.log(`   Progress Percentage: ${goal.progressPercentage || 0}%`);
      console.log(`   Monetary Value: $${goal.monetaryValue || 'not set'}`);
      console.log(`   Monetary Value Achieved: $${goal.monetaryValueAchieved || 0}`);
      console.log(`   Sub-goals: ${goal.subGoals?.length || 0}`);

      // Verify payroll runs
      const goalStartDate = new Date(goal.startDate);
      const goalEndDate = new Date(goal.endDate);
      
      const payrollRuns = await prisma.payrollRun.findMany({
        where: {
          status: "COMPLETED",
          endDate: {
            gte: goalStartDate,
            lte: goalEndDate
          }
        },
        select: {
          id: true,
          name: true,
          totalGrossPay: true,
          endDate: true
        }
      });

      let totalPayroll = 0;
      for (const run of payrollRuns) {
        if (run.totalGrossPay) {
          totalPayroll += parseFloat(run.totalGrossPay.toString());
        }
      }

      console.log(`   Payroll Runs: ${payrollRuns.length} (Total: $${totalPayroll.toFixed(2)})`);
      
      const expectedProgress = goal.targetValue && parseFloat(goal.targetValue.toString()) > 0
        ? Math.min((totalPayroll / parseFloat(goal.targetValue.toString())) * 100, 100)
        : 0;

      console.log(`   Expected Progress: ${expectedProgress.toFixed(2)}%`);
      
      const actualProgress = goal.progressPercentage ? parseFloat(goal.progressPercentage.toString()) : 0;
      const actualCurrent = goal.currentValue ? parseFloat(goal.currentValue.toString()) : 0;

      if (Math.abs(actualProgress - expectedProgress) < 0.01 && Math.abs(actualCurrent - totalPayroll) < 0.01) {
        console.log(`   ✅ Data is correct!\n`);
      } else {
        console.log(`   ⚠️ Data mismatch detected!`);
        console.log(`      Expected Current: $${totalPayroll.toFixed(2)}, Actual: $${actualCurrent.toFixed(2)}`);
        console.log(`      Expected Progress: ${expectedProgress.toFixed(2)}%, Actual: ${actualProgress.toFixed(2)}%\n`);
      }
    }

    // Step 3: Test Roll-up Calculation
    console.log("\n🔄 Testing Roll-up Calculation...");
    const { RollupCalculationService } = await import("../src/services/RollupCalculationService");
    
    for (const goal of payrollKPI.performanceGoals) {
      console.log(`\n   Testing roll-up for: "${goal.title}"`);
      const rollupData = await RollupCalculationService.calculateGoalRollup(goal.id);
      
      console.log(`   Goal Data:`);
      console.log(`   - Target: $${rollupData.goal.targetValue}`);
      console.log(`   - Current: $${rollupData.goal.currentValue}`);
      console.log(`   - Progress: ${rollupData.goal.progressPercentage}%`);
      console.log(`   - Stage: ${rollupData.goal.stage}`);
      
      console.log(`   Roll-up Data:`);
      console.log(`   - Total Sub-goals: ${rollupData.rollup.totalSubGoals}`);
      console.log(`   - Total Target: $${rollupData.rollup.totalTargetValue}`);
      console.log(`   - Total Current: $${rollupData.rollup.totalCurrentValue}`);
      console.log(`   - Overall Progress: ${rollupData.rollup.overallProgressPercentage}%`);
      
      // Verify roll-up matches goal data for goals without sub-goals
      if (rollupData.rollup.totalSubGoals === 0) {
        const goalTarget = parseFloat(rollupData.goal.targetValue);
        const goalCurrent = parseFloat(rollupData.goal.currentValue);
        const rollupTarget = rollupData.rollup.totalTargetValue;
        const rollupCurrent = rollupData.rollup.totalCurrentValue;
        
        if (Math.abs(goalTarget - rollupTarget) < 0.01 && Math.abs(goalCurrent - rollupCurrent) < 0.01) {
          console.log(`   ✅ Roll-up data matches goal data!\n`);
        } else {
          console.log(`   ⚠️ Roll-up mismatch!`);
          console.log(`      Goal: $${goalCurrent.toFixed(2)} / $${goalTarget.toFixed(2)}`);
          console.log(`      Roll-up: $${rollupCurrent.toFixed(2)} / $${rollupTarget.toFixed(2)}\n`);
        }
      }
    }

    // Step 4: Calculate KPI Progress
    console.log("\n📈 Calculating KPI Progress...");
    let totalMonetaryTarget = 0;
    let totalMonetaryAchieved = 0;
    
    for (const goal of payrollKPI.performanceGoals) {
      const monetaryTarget = goal.monetaryValue 
        ? parseFloat(goal.monetaryValue.toString()) 
        : (goal.targetValue ? parseFloat(goal.targetValue.toString()) : 0);
      
      const monetaryAchieved = goal.monetaryValueAchieved 
        ? parseFloat(goal.monetaryValueAchieved.toString()) 
        : (goal.currentValue ? parseFloat(goal.currentValue.toString()) : 0);

      totalMonetaryTarget += monetaryTarget;
      totalMonetaryAchieved += monetaryAchieved;
    }

    const kpiProgress = totalMonetaryTarget > 0 
      ? (totalMonetaryAchieved / totalMonetaryTarget) * 100 
      : 0;

    console.log(`   Total Monetary Target: $${totalMonetaryTarget.toFixed(2)}`);
    console.log(`   Total Monetary Achieved: $${totalMonetaryAchieved.toFixed(2)}`);
    console.log(`   KPI Progress: ${kpiProgress.toFixed(2)}%`);

    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("✅ Verification Complete");
    console.log("═══════════════════════════════════════════════════════════");

  } catch (error) {
    console.error("❌ Error verifying performance data:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

verifyPerformanceData()
  .then(() => {
    console.log("\n✅ Verification completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Verification failed:", error);
    process.exit(1);
  });




