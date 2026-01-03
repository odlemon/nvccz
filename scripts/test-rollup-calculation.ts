import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function testRollupCalculation() {
  try {
    console.log("🧪 Testing Roll-up Calculation");
    console.log("═══════════════════════════════════════════════════════════\n");

    // Find the Payroll control goal
    const goal = await prisma.performanceGoal.findFirst({
      where: {
        title: { contains: "Payroll control" }
      },
      include: {
        kpi: {
          select: {
            id: true,
            name: true,
            type: true,
            unitSymbol: true,
            unitPosition: true
          }
        },
        subGoals: {
          include: {
            subGoals: true
          }
        }
      }
    });

    if (!goal) {
      console.log("❌ Goal not found");
      return;
    }

    console.log(`✅ Found goal: "${goal.title}" (${goal.id})`);
    console.log(`\n📊 Goal Details:`);
    console.log(`   - Type: ${goal.type}`);
    console.log(`   - Category: ${goal.category}`);
    console.log(`   - Target Value: ${goal.targetValue || 0}`);
    console.log(`   - Current Value: ${goal.currentValue || 0}`);
    console.log(`   - Progress Percentage: ${goal.progressPercentage || 0}%`);
    console.log(`   - Status: ${goal.status}`);
    console.log(`   - Stage: ${goal.stage}`);
    console.log(`   - Monetary Value: ${goal.monetaryValue || 'not set'}`);
    console.log(`   - Monetary Value Achieved: ${goal.monetaryValueAchieved || 0}`);
    console.log(`   - Sub-goals: ${goal.subGoals?.length || 0}`);

    if (goal.kpi) {
      console.log(`\n📈 KPI Details:`);
      console.log(`   - Name: ${goal.kpi.name}`);
      console.log(`   - Type: ${goal.kpi.type}`);
      console.log(`   - Unit: ${goal.kpi.unitSymbol || ''} (${goal.kpi.unitPosition || 'prefix'})`);
    }

    // Test roll-up calculation
    console.log(`\n\n🔄 Testing Roll-up Calculation...`);
    const { RollupCalculationService } = await import("../src/services/RollupCalculationService");
    const rollupData = await RollupCalculationService.calculateGoalRollup(goal.id);

    console.log(`\n📊 Roll-up Results:`);
    console.log(`   Goal:`);
    console.log(`   - Target Value: ${rollupData.goal.targetValue}`);
    console.log(`   - Current Value: ${rollupData.goal.currentValue}`);
    console.log(`   - Progress Percentage: ${rollupData.goal.progressPercentage}%`);
    console.log(`   - Stage: ${rollupData.goal.stage}`);
    
    console.log(`\n   Roll-up:`);
    console.log(`   - Total Sub-goals: ${rollupData.rollup.totalSubGoals}`);
    console.log(`   - Completed: ${rollupData.rollup.completedSubGoals}`);
    console.log(`   - In Progress: ${rollupData.rollup.inProgressSubGoals}`);
    console.log(`   - Not Started: ${rollupData.rollup.notStartedSubGoals}`);
    console.log(`   - Total Target Value: ${rollupData.rollup.totalTargetValue}`);
    console.log(`   - Total Current Value: ${rollupData.rollup.totalCurrentValue}`);
    console.log(`   - Overall Progress: ${rollupData.rollup.overallProgressPercentage}%`);

    console.log("\n✅ Roll-up calculation test completed");

  } catch (error) {
    console.error("❌ Error testing roll-up calculation:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

testRollupCalculation()
  .then(() => {
    console.log("\n✅ Test completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  });




