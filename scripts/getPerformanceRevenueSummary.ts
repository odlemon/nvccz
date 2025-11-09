import { prisma } from '../src/utils/database';

async function getPerformanceRevenue() {
  const revenueKpiIds = [
    'cmh3bzkv50000unlcqycnzgi4', // Total Revenue
    'cmh3bzxoh000aunlc0ldm29to'  // Sales Revenue
  ];

  const goals = await prisma.performanceGoal.findMany({
    where: {
      kpiId: {
        in: revenueKpiIds
      }
    },
    select: {
      id: true,
      title: true,
      type: true,
      currentValue: true,
      targetValue: true,
      stage: true,
      kpi: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  const summary = goals.reduce((acc, goal) => {
    const kpiName = goal.kpi?.name || 'Unknown KPI';
    if (!acc[kpiName]) {
      acc[kpiName] = {
        goalCount: 0,
        totalCurrentValue: 0,
        totalTargetValue: 0
      };
    }

    acc[kpiName].goalCount += 1;
    acc[kpiName].totalCurrentValue += parseFloat(goal.currentValue?.toString() || '0');
    acc[kpiName].totalTargetValue += parseFloat(goal.targetValue?.toString() || '0');

    return acc;
  }, {} as Record<string, { goalCount: number; totalCurrentValue: number; totalTargetValue: number }>);

  console.log(JSON.stringify({ goals, summary }, null, 2));
}

getPerformanceRevenue()
  .catch((error) => {
    console.error('Failed to get performance revenue summary', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

