const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testGoalEndpoint() {
  try {
    console.log('🧪 Testing PerformanceGoal endpoint...');
    
    // Test the getPerformanceGoalById method directly
    const goal = await prisma.performanceGoal.findUnique({
      where: { id: "cmhcqiww30009l804sj0rjt2k" },
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
        assignedTo: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        createdBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        parentGoal: {
          select: {
            id: true,
            title: true,
            type: true
          }
        },
        subGoals: {
          include: {
            assignedTo: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            }
          }
        },
        tasks: {
          include: {
            creator: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            }
          }
        }
      }
    });

    if (goal) {
      console.log('✅ Goal found successfully!');
      console.log(`Title: ${goal.title}`);
      console.log(`Type: ${goal.type}`);
      console.log(`Department: ${goal.departmentName}`);
      console.log(`KPI: ${goal.kpi?.name || 'None'}`);
      console.log(`Sub-goals: ${goal.subGoals?.length || 0}`);
      console.log(`Tasks: ${goal.tasks?.length || 0}`);
    } else {
      console.log('❌ Goal not found');
    }

  } catch (error) {
    console.error('❌ Error testing goal endpoint:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testGoalEndpoint();
