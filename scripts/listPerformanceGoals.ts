import { prisma } from '../src/utils/database';

interface Filters {
  kpiId?: string;
  title?: string;
}

function parseFilters(): Filters {
  const filters: Filters = {};

  process.argv.slice(2).forEach((arg) => {
    const [key, value] = arg.split('=');
    if (key === '--kpiId' && value) {
      filters.kpiId = value;
    }
    if (key === '--title' && value) {
      filters.title = value;
    }
  });

  return filters;
}

async function listGoals() {
  const filters = parseFilters();

  const whereClause: any = {};
  if (filters.kpiId) {
    whereClause.kpiId = filters.kpiId;
  }
  if (filters.title) {
    whereClause.title = filters.title;
  }

  const goals = await prisma.performanceGoal.findMany({
    where: whereClause,
    select: {
      id: true,
      title: true,
      type: true,
      category: true,
      departmentName: true,
      targetValue: true,
      currentValue: true,
      stage: true,
      kpiId: true,
      dataSourceModule: true,
      dataSourceField: true,
      trackingFrequency: true,
      lastCheckDate: true,
      nextCheckDate: true
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  console.log(JSON.stringify(goals, null, 2));
}

listGoals()
  .catch((error) => {
    console.error('Failed to list goals', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

