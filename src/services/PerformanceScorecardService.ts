// @ts-nocheck
import { DatabaseConnection } from "../utils/database";

const dbConnection = DatabaseConnection.getInstance();
const prisma = dbConnection.getPrismaClient();

export interface UserScorecardData {
  userId: string;
  userName: string;
  department: string;
  role: string;
  overallScore: number;
  performanceCategory: string;
  taskMetrics: {
    totalTasks: number;
    completedTasks: number;
    overdueTasks: number;
    completionRate: number;
    averageCompletionTime: number;
    overdueRate: number;
    qualityScore: number;
  };
  goalMetrics: {
    totalGoals: number;
    achievedGoals: number;
    overdueGoals: number;
    completionRate: number;
    progressSpeed: number;
    overdueRate: number;
    averageProgress: number;
  };
  activityMetrics: {
    totalActivities: number;
    logFrequency: number;
    engagementScore: number;
    responseTime: number;
    proactiveActions: number;
  };
  reviewMetrics: {
    totalReviews: number;
    averageScore: number;
    latestScore: number;
    improvementTrend: string;
    lastReviewDate: string | null;
  };
}

export interface DepartmentScorecardData {
  departmentId: string;
  departmentName: string;
  totalUsers: number;
  averageScore: number;
  performanceCategory: string;
  taskMetrics: {
    totalTasks: number;
    completedTasks: number;
    overdueTasks: number;
    completionRate: number;
    averageCompletionTime: number;
    overdueRate: number;
    qualityScore: number;
  };
  goalMetrics: {
    totalGoals: number;
    achievedGoals: number;
    overdueGoals: number;
    completionRate: number;
    progressSpeed: number;
    overdueRate: number;
    averageProgress: number;
  };
  activityMetrics: {
    totalActivities: number;
    averageLogFrequency: number;
    engagementScore: number;
    averageResponseTime: number;
    proactiveActions: number;
  };
  reviewMetrics: {
    totalReviews: number;
    averageScore: number;
    completionRate: number;
    improvementTrend: string;
    lastReviewDate: string | null;
  };
  performanceDistribution: {
    highPerformers: number;
    averagePerformers: number;
    needsImprovement: number;
    highPerformerPercentage: number;
    averagePerformerPercentage: number;
    needsImprovementPercentage: number;
  };
  comparison: {
    rankInCompany: number;
    vsCompanyAverage: string;
    vsBestDepartment: string;
    vsWorstDepartment: string;
  };
}

export class PerformanceScorecardService {
  /**
   * Get performance scorecards for all users
   */
  static async getAllUsersScorecards(): Promise<UserScorecardData[]> {
    try {
      const users = await prisma.user.findMany({
        include: {
          department: {
            select: { id: true, name: true }
          },
          role: {
            select: { name: true }
          },
          createdTasks: true,
          performanceGoals: true,
          activityLogs: true,
          performanceReviewsAsReviewee: {
            include: {
              reviewFeedback: true
            }
          }
        }
      });

      const userScorecards: UserScorecardData[] = [];

      for (const user of users) {
        const scorecard = await this.calculateUserScorecard(user);
        userScorecards.push(scorecard);
      }

      return userScorecards;
    } catch (error: any) {
      throw new Error(`Failed to get users scorecards: ${error.message}`);
    }
  }

  /**
   * Get performance scorecards for all departments
   */
  static async getAllDepartmentsScorecards(): Promise<DepartmentScorecardData[]> {
    try {
      const departments = await prisma.department.findMany({
        where: { isActive: true },
        include: {
          users: {
            include: {
              createdTasks: true,
              performanceGoals: true,
              activityLogs: true,
              performanceReviewsAsReviewee: {
                include: {
                  reviewFeedback: true
                }
              }
            }
          }
        }
      });

      const departmentScorecards: DepartmentScorecardData[] = [];

      for (const department of departments) {
        const scorecard = await this.calculateDepartmentScorecard(department);
        departmentScorecards.push(scorecard);
      }

      // Calculate rankings and comparisons
      const sortedDepartments = departmentScorecards.sort((a, b) => b.averageScore - a.averageScore);
      const companyAverage = departmentScorecards.reduce((sum, dept) => sum + dept.averageScore, 0) / departmentScorecards.length;

      return sortedDepartments.map((dept, index) => ({
        ...dept,
        comparison: {
          rankInCompany: index + 1,
          vsCompanyAverage: `${dept.averageScore > companyAverage ? '+' : ''}${(dept.averageScore - companyAverage).toFixed(1)}%`,
          vsBestDepartment: index === 0 ? '0.0%' : `-${(sortedDepartments[0].averageScore - dept.averageScore).toFixed(1)}%`,
          vsWorstDepartment: index === sortedDepartments.length - 1 ? '0.0%' : `+${(dept.averageScore - sortedDepartments[sortedDepartments.length - 1].averageScore).toFixed(1)}%`
        }
      }));
    } catch (error: any) {
      throw new Error(`Failed to get departments scorecards: ${error.message}`);
    }
  }

  /**
   * Calculate individual user scorecard
   */
  private static async calculateUserScorecard(user: any): Promise<UserScorecardData> {
    // Task Metrics
    const totalTasks = user.createdTasks.length;
    const completedTasks = user.createdTasks.filter((task: any) => task.stage === 'completed').length;
    const overdueTasks = user.createdTasks.filter((task: any) => 
      task.stage !== 'completed' && task.isOverdue === true
    ).length;
    const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
    const overdueRate = totalTasks > 0 ? (overdueTasks / totalTasks) * 100 : 0;

    // Calculate average completion time
    const completedTaskTimes = user.createdTasks
      .filter((task: any) => task.stage === 'completed')
      .map((task: any) => {
        const start = new Date(task.createdAt);
        const end = new Date(task.updatedAt);
        return (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24); // days
      });
    const averageCompletionTime = completedTaskTimes.length > 0 
      ? completedTaskTimes.reduce((sum: number, time: number) => sum + time, 0) / completedTaskTimes.length 
      : 0;

    // Goal Metrics
    const totalGoals = user.performanceGoals.length;
    const achievedGoals = user.performanceGoals.filter((goal: any) => goal.status === 'completed').length;
    const overdueGoals = user.performanceGoals.filter((goal: any) => 
      goal.status !== 'completed' && new Date(goal.endDate) < new Date()
    ).length;
    const goalCompletionRate = totalGoals > 0 ? (achievedGoals / totalGoals) * 100 : 0;
    const goalOverdueRate = totalGoals > 0 ? (overdueGoals / totalGoals) * 100 : 0;

    // Calculate average progress from achieved values
    const averageProgress = user.performanceGoals.length > 0 
      ? user.performanceGoals.reduce((sum: number, goal: any) => {
          if (goal.percentValue && goal.percentValueAchieved) {
            return sum + (Number(goal.percentValueAchieved) / Number(goal.percentValue)) * 100;
          } else if (goal.monetaryValue && goal.monetaryValueAchieved) {
            return sum + (Number(goal.monetaryValueAchieved) / Number(goal.monetaryValue)) * 100;
          }
          return sum + (goal.status === 'completed' ? 100 : 0);
        }, 0) / user.performanceGoals.length 
      : 0;

    // Activity Metrics
    const totalActivities = user.activityLogs.length;
    // Calculate log frequency based on user's account age (more realistic)
    const accountAgeInWeeks = Math.max(1, (new Date().getTime() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24 * 7));
    const logFrequency = totalActivities > 0 ? totalActivities / accountAgeInWeeks : 0; // activities per week
    const proactiveActions = user.createdTasks.length; // All created tasks are proactive

    // Review Metrics
    const totalReviews = user.performanceReviewsAsReviewee.length;
    const averageScore = user.performanceReviewsAsReviewee.length > 0 
      ? user.performanceReviewsAsReviewee.reduce((sum: number, review: any) => sum + (review.overallScore || 0), 0) / user.performanceReviewsAsReviewee.length 
      : 0;
    const latestScore = user.performanceReviewsAsReviewee.length > 0 
      ? user.performanceReviewsAsReviewee.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0].overallScore || 0 
      : 0;
    const lastReviewDate = user.performanceReviewsAsReviewee.length > 0 
      ? user.performanceReviewsAsReviewee.sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0].createdAt 
      : null;

    // Calculate overall score
    const overallScore = Math.round(
      (completionRate * 0.3) +
      (goalCompletionRate * 0.25) +
      (averageScore * 0.25) +
      (logFrequency * 2 * 0.2) // Scale log frequency
    );

    // Determine performance category
    let performanceCategory = 'Needs Improvement';
    if (overallScore >= 85) performanceCategory = 'High Performer';
    else if (overallScore >= 70) performanceCategory = 'Average Performer';

    return {
      userId: user.id,
      userName: `${user.firstName} ${user.lastName}`,
      department: user.department?.name || 'No Department',
      role: user.role?.name || 'No Role',
      overallScore,
      performanceCategory,
      taskMetrics: {
        totalTasks,
        completedTasks,
        overdueTasks,
        completionRate: Math.round(completionRate * 100) / 100,
        averageCompletionTime: Math.round(averageCompletionTime * 100) / 100,
        overdueRate: Math.round(overdueRate * 100) / 100,
        qualityScore: Math.round(averageScore) // Using review score as quality proxy
      },
      goalMetrics: {
        totalGoals,
        achievedGoals,
        overdueGoals,
        completionRate: Math.round(goalCompletionRate * 100) / 100,
        progressSpeed: Math.round(averageProgress * 100) / 100,
        overdueRate: Math.round(goalOverdueRate * 100) / 100,
        averageProgress: Math.round(averageProgress * 100) / 100
      },
      activityMetrics: {
        totalActivities,
        logFrequency: Math.round(logFrequency * 100) / 100,
        engagementScore: Math.round(averageScore), // Using review score as engagement proxy
        responseTime: Math.round(averageCompletionTime * 100) / 100,
        proactiveActions
      },
      reviewMetrics: {
        totalReviews,
        averageScore: Math.round(averageScore * 100) / 100,
        latestScore: Math.round(latestScore * 100) / 100,
        improvementTrend: 'Stable', // Could be calculated from historical data
        lastReviewDate: lastReviewDate ? new Date(lastReviewDate).toISOString().split('T')[0] : null
      }
    };
  }

  /**
   * Calculate department scorecard
   */
  private static async calculateDepartmentScorecard(department: any): Promise<DepartmentScorecardData> {
    const users = department.users;
    const totalUsers = users.length;

    if (totalUsers === 0) {
      return {
        departmentId: department.id,
        departmentName: department.name,
        totalUsers: 0,
        averageScore: 0,
        performanceCategory: 'No Users',
        taskMetrics: {
          totalTasks: 0,
          completedTasks: 0,
          overdueTasks: 0,
          completionRate: 0,
          averageCompletionTime: 0,
          overdueRate: 0,
          qualityScore: 0
        },
        goalMetrics: {
          totalGoals: 0,
          achievedGoals: 0,
          overdueGoals: 0,
          completionRate: 0,
          progressSpeed: 0,
          overdueRate: 0,
          averageProgress: 0
        },
        activityMetrics: {
          totalActivities: 0,
          averageLogFrequency: 0,
          engagementScore: 0,
          averageResponseTime: 0,
          proactiveActions: 0
        },
        reviewMetrics: {
          totalReviews: 0,
          averageScore: 0,
          completionRate: 0,
          improvementTrend: 'No Data',
          lastReviewDate: null
        },
        performanceDistribution: {
          highPerformers: 0,
          averagePerformers: 0,
          needsImprovement: 0,
          highPerformerPercentage: 0,
          averagePerformerPercentage: 0,
          needsImprovementPercentage: 0
        },
        comparison: {
          rankInCompany: 0,
          vsCompanyAverage: '0.0%',
          vsBestDepartment: '0.0%',
          vsWorstDepartment: '0.0%'
        }
      };
    }

    // Calculate department metrics
    let totalTasks = 0;
    let completedTasks = 0;
    let overdueTasks = 0;
    let totalGoals = 0;
    let achievedGoals = 0;
    let overdueGoals = 0;
    let totalActivities = 0;
    let totalReviews = 0;
    let totalReviewScore = 0;
    let highPerformers = 0;
    let averagePerformers = 0;
    let needsImprovement = 0;

    for (const user of users) {
      // Task metrics
      const userTasks = user.createdTasks.length;
      const userCompletedTasks = user.createdTasks.filter((task: any) => task.stage === 'completed').length;
      const userOverdueTasks = user.createdTasks.filter((task: any) => 
        task.stage !== 'completed' && task.isOverdue === true
      ).length;

      totalTasks += userTasks;
      completedTasks += userCompletedTasks;
      overdueTasks += userOverdueTasks;

      // Goal metrics
      const userGoals = user.performanceGoals.length;
      const userAchievedGoals = user.performanceGoals.filter((goal: any) => goal.status === 'completed').length;
      const userOverdueGoals = user.performanceGoals.filter((goal: any) => 
        goal.status !== 'completed' && new Date(goal.endDate) < new Date()
      ).length;

      totalGoals += userGoals;
      achievedGoals += userAchievedGoals;
      overdueGoals += userOverdueGoals;

      // Activity metrics
      totalActivities += user.activityLogs.length;

      // Review metrics
      const userReviews = user.performanceReviewsAsReviewee.length;
      const userReviewScore = user.performanceReviewsAsReviewee.reduce((sum: number, review: any) => sum + (review.overallScore || 0), 0);
      
      totalReviews += userReviews;
      totalReviewScore += userReviewScore;

      // Calculate user score for distribution
      const userCompletionRate = userTasks > 0 ? (userCompletedTasks / userTasks) * 100 : 0;
      const userGoalCompletionRate = userGoals > 0 ? (userAchievedGoals / userGoals) * 100 : 0;
      const userAverageScore = userReviews > 0 ? userReviewScore / userReviews : 0;
      const userAccountAgeInWeeks = Math.max(1, (new Date().getTime() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24 * 7));
      const userLogFrequency = user.activityLogs.length / userAccountAgeInWeeks;

      const userOverallScore = Math.round(
        (userCompletionRate * 0.3) +
        (userGoalCompletionRate * 0.25) +
        (userAverageScore * 0.25) +
        (userLogFrequency * 2 * 0.2)
      );

      if (userOverallScore >= 85) highPerformers++;
      else if (userOverallScore >= 70) averagePerformers++;
      else needsImprovement++;
    }

    const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
    const overdueRate = totalTasks > 0 ? (overdueTasks / totalTasks) * 100 : 0;
    const goalCompletionRate = totalGoals > 0 ? (achievedGoals / totalGoals) * 100 : 0;
    const goalOverdueRate = totalGoals > 0 ? (overdueGoals / totalGoals) * 100 : 0;
    const averageReviewScore = totalReviews > 0 ? totalReviewScore / totalReviews : 0;
    const averageLogFrequency = totalUsers > 0 ? totalActivities / totalUsers : 0; // Average activities per user

    const averageScore = Math.round(
      (completionRate * 0.3) +
      (goalCompletionRate * 0.25) +
      (averageReviewScore * 0.25) +
      (averageLogFrequency * 2 * 0.2)
    );

    let performanceCategory = 'Needs Improvement';
    if (averageScore >= 85) performanceCategory = 'High Performing Department';
    else if (averageScore >= 70) performanceCategory = 'Average Performing Department';

    return {
      departmentId: department.id,
      departmentName: department.name,
      totalUsers,
      averageScore,
      performanceCategory,
      taskMetrics: {
        totalTasks,
        completedTasks,
        overdueTasks,
        completionRate: Math.round(completionRate * 100) / 100,
        averageCompletionTime: Math.round(averageLogFrequency * 100) / 100, // Using activity frequency as proxy
        overdueRate: Math.round(overdueRate * 100) / 100,
        qualityScore: Math.round(averageReviewScore * 100) / 100
      },
      goalMetrics: {
        totalGoals,
        achievedGoals,
        overdueGoals,
        completionRate: Math.round(goalCompletionRate * 100) / 100,
        progressSpeed: Math.round(goalCompletionRate * 100) / 100, // Using completion rate as progress speed
        overdueRate: Math.round(goalOverdueRate * 100) / 100,
        averageProgress: Math.round(goalCompletionRate * 100) / 100 // Using completion rate as average progress
      },
      activityMetrics: {
        totalActivities,
        averageLogFrequency: Math.round(averageLogFrequency * 100) / 100,
        engagementScore: Math.round(averageReviewScore * 100) / 100,
        averageResponseTime: Math.round(averageLogFrequency * 100) / 100, // Using activity frequency as proxy
        proactiveActions: Math.round(totalTasks * 0.3) // Estimate 30% of tasks are proactive
      },
      reviewMetrics: {
        totalReviews,
        averageScore: Math.round(averageReviewScore * 100) / 100,
        completionRate: 100, // Assuming all reviews are completed
        improvementTrend: 'Stable',
        lastReviewDate: null // Would need to find latest review date
      },
      performanceDistribution: {
        highPerformers,
        averagePerformers,
        needsImprovement,
        highPerformerPercentage: Math.round((highPerformers / totalUsers) * 100 * 100) / 100,
        averagePerformerPercentage: Math.round((averagePerformers / totalUsers) * 100 * 100) / 100,
        needsImprovementPercentage: Math.round((needsImprovement / totalUsers) * 100 * 100) / 100
      },
      comparison: {
        rankInCompany: 0, // Will be set later
        vsCompanyAverage: '0.0%', // Will be set later
        vsBestDepartment: '0.0%', // Will be set later
        vsWorstDepartment: '0.0%' // Will be set later
      }
    };
  }
}
