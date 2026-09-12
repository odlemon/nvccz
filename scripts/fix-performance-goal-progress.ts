import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

const prisma = new PrismaClient();

async function fixPerformanceGoalProgress() {
  try {
    console.log("🔧 Fixing Performance Goal Progress Data");
    console.log("═══════════════════════════════════════════════════════════\n");

    // Step 1: Find Payroll Expense KPI
    const payrollKPI = await prisma.kPI.findFirst({
      where: { name: "Payroll Expense" }
    });

    if (!payrollKPI) {
      console.log("❌ Payroll Expense KPI not found");
      return;
    }

    console.log(`✅ Found Payroll Expense KPI: ${payrollKPI.id}\n`);

    // Step 2: Find all goals linked to Payroll Expense KPI
    const goals = await prisma.performanceGoal.findMany({
      where: {
        kpiId: payrollKPI.id
      },
      include: {
        parentGoal: {
          select: { id: true, title: true }
        }
      }
    });

    console.log(`Found ${goals.length} goal(s) linked to Payroll Expense KPI\n`);

    let fixedCount = 0;
    let updatedGoals: string[] = [];

    // Step 3: Fix each goal
    for (const goal of goals) {
      console.log(`\n📊 Processing goal: "${goal.title}" (${goal.id})`);
      console.log(`   Current State:`);
      console.log(`   - currentValue: ${goal.currentValue || 0}`);
      console.log(`   - targetValue: ${goal.targetValue || 0}`);
      console.log(`   - progressPercentage: ${goal.progressPercentage || 0}%`);
      console.log(`   - monetaryValue: ${goal.monetaryValue || 'not set'}`);
      console.log(`   - monetaryValueAchieved: ${goal.monetaryValueAchieved || 0}`);
      console.log(`   - status: ${goal.status}`);
      console.log(`   - stage: ${goal.stage}`);

      // Calculate total payroll expense for this goal
      const goalStartDate = new Date(goal.startDate);
      const goalEndDate = new Date(goal.endDate);

      const relevantPayrollRuns = await prisma.payrollRun.findMany({
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

      console.log(`   Found ${relevantPayrollRuns.length} completed payroll run(s) in date range`);

      // Sum all payroll runs
      let totalPayrollExpense = new Decimal(0);
      for (const run of relevantPayrollRuns) {
        if (run.totalGrossPay) {
          totalPayrollExpense = totalPayrollExpense.add(run.totalGrossPay);
          console.log(`     - ${run.name}: $${run.totalGrossPay.toString()}`);
        }
      }

      const totalPayrollValue = parseFloat(totalPayrollExpense.toString());
      const targetValue = goal.targetValue ? parseFloat(goal.targetValue.toString()) : 0;
      const progressPercentage = targetValue > 0 
        ? Math.min((totalPayrollValue / targetValue) * 100, 100) 
        : 0;
      const isCompleted = totalPayrollValue >= targetValue;

      // Set monetaryValue to targetValue if not already set
      const monetaryValue = goal.monetaryValue 
        ? parseFloat(goal.monetaryValue.toString()) 
        : targetValue;

      console.log(`\n   Calculated Values:`);
      console.log(`   - totalPayrollValue: $${totalPayrollValue.toFixed(2)}`);
      console.log(`   - targetValue: $${targetValue.toFixed(2)}`);
      console.log(`   - progressPercentage: ${progressPercentage.toFixed(2)}%`);
      console.log(`   - isCompleted: ${isCompleted}`);

      // Update goal
      await prisma.performanceGoal.update({
        where: { id: goal.id },
        data: {
          currentValue: totalPayrollValue,
          monetaryValue: monetaryValue,
          monetaryValueAchieved: totalPayrollValue,
          progressPercentage: progressPercentage,
          status: isCompleted ? "completed" : "active",
          stage: isCompleted ? "completed" : "in_progress",
          completedAt: isCompleted && !goal.completedAt ? new Date() : undefined,
          updatedAt: new Date()
        }
      });

      console.log(`   ✅ Goal updated successfully`);
      fixedCount++;
      updatedGoals.push(goal.id);

      // Update parent goal if exists
      if (goal.parentGoalId) {
        console.log(`   🔄 Updating parent goal: ${goal.parentGoal?.title || goal.parentGoalId}`);
        try {
          await updateParentGoalProgress(goal.parentGoalId);
        } catch (error) {
          console.error(`   ⚠️ Failed to update parent goal:`, error);
        }
      }
    }

    // Step 4: Recalculate KPI progress
    console.log(`\n\n🔄 Recalculating KPI progress...`);
    try {
      await recalculateKPIProgress(payrollKPI.id);
      console.log(`✅ KPI progress recalculated`);
    } catch (error) {
      console.error(`⚠️ Failed to recalculate KPI progress:`, error);
    }

    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("📊 SUMMARY");
    console.log("═══════════════════════════════════════════════════════════");
    console.log(`✅ Fixed ${fixedCount} goal(s)`);
    console.log(`📝 Updated goal IDs: ${updatedGoals.join(", ")}`);
    console.log("✅ Script completed successfully");

  } catch (error) {
    console.error("❌ Error fixing performance goal progress:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

async function updateParentGoalProgress(parentGoalId: string): Promise<void> {
  const parentGoal = await prisma.performanceGoal.findUnique({
    where: { id: parentGoalId },
    include: {
      subGoals: {
        select: {
          id: true,
          currentValue: true,
          targetValue: true,
          stage: true,
          status: true
        }
      }
    }
  });

  if (!parentGoal || !parentGoal.subGoals || parentGoal.subGoals.length === 0) {
    return;
  }

  let totalTargetValue = 0;
  let totalCurrentValue = 0;
  let allCompleted = true;
  let anyInProgress = false;

  for (const subGoal of parentGoal.subGoals) {
    const subTarget = subGoal.targetValue ? parseFloat(subGoal.targetValue.toString()) : 0;
    const subCurrent = subGoal.currentValue ? parseFloat(subGoal.currentValue.toString()) : 0;
    
    totalTargetValue += subTarget;
    totalCurrentValue += subCurrent;

    if (subGoal.stage !== "completed") {
      allCompleted = false;
    }
    if (subGoal.stage === "in_progress" || subGoal.status === "active") {
      anyInProgress = true;
    }
  }

  const progressPercentage = totalTargetValue > 0 
    ? Math.min((totalCurrentValue / totalTargetValue) * 100, 100) 
    : 0;

  let newStage = parentGoal.stage;
  if (allCompleted && parentGoal.subGoals.length > 0) {
    newStage = "completed";
  } else if (anyInProgress || totalCurrentValue > 0) {
    newStage = "in_progress";
  }

  await prisma.performanceGoal.update({
    where: { id: parentGoalId },
    data: {
      currentValue: totalCurrentValue,
      progressPercentage: progressPercentage,
      stage: newStage,
      status: allCompleted ? "completed" : "active",
      updatedAt: new Date()
    }
  });

  // Recursively update grandparent if exists
  if (parentGoal.parentGoalId) {
    await updateParentGoalProgress(parentGoal.parentGoalId);
  }
}

async function recalculateKPIProgress(kpiId: string): Promise<void> {
  const kpi = await prisma.kPI.findUnique({
    where: { id: kpiId },
    include: {
      performanceGoals: {
        select: {
          id: true,
          monetaryValue: true,
          monetaryValueAchieved: true,
          percentValue: true,
          percentValueAchieved: true,
          currentValue: true,
          targetValue: true,
          status: true
        }
      }
    }
  });

  if (!kpi) {
    return;
  }

  let totalMonetaryTarget = 0;
  let totalMonetaryAchieved = 0;

  for (const goal of kpi.performanceGoals) {
    const monetaryTarget = goal.monetaryValue 
      ? parseFloat(goal.monetaryValue.toString()) 
      : (goal.targetValue ? parseFloat(goal.targetValue.toString()) : 0);
    
    const monetaryAchieved = goal.monetaryValueAchieved 
      ? parseFloat(goal.monetaryValueAchieved.toString()) 
      : (goal.currentValue ? parseFloat(goal.currentValue.toString()) : 0);

    totalMonetaryTarget += monetaryTarget;
    totalMonetaryAchieved += monetaryAchieved;
  }

  console.log(`   KPI Progress: $${totalMonetaryAchieved.toFixed(2)} / $${totalMonetaryTarget.toFixed(2)}`);
}

// Run the script
fixPerformanceGoalProgress()
  .then(() => {
    console.log("\n✅ Script execution completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script execution failed:", error);
    process.exit(1);
  });




