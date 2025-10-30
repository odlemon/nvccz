// @ts-nocheck
import { prisma } from "../utils/database";
import { Decimal } from "@prisma/client/runtime/library";

export class PerformanceScorecardService {
  /**
   * Get user performance scorecard with comprehensive scoring
   */
  static async getUserScorecard(userId: string) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          userDepartment: true,
          departmentRole: true,
          roleCode: true
        }
      });

      if (!user) {
        throw new Error("User not found");
      }

      // Get user's individual goals
      const individualGoals = await prisma.performanceGoal.findMany({
        where: {
          type: 'individual',
          assignedToId: userId
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
          parentGoal: {
            select: {
              id: true,
              title: true,
              type: true,
              parentGoal: {
                select: {
                  id: true,
                  title: true,
                  type: true
                }
              }
            }
          }
        }
      });

      // Get user's tasks
      const tasks = await prisma.task.findMany({
        where: {
          team: {
            array_contains: userId
          },
          isPerformanceTask: true
        },
        include: {
          goal: {
            select: {
              id: true,
              title: true,
              type: true
            }
          }
        }
      });

      // Calculate comprehensive performance scorecard
      const scorecard = this.calculateUserScorecard(individualGoals, tasks, user);

      return {
        user: {
          id: user.id,
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          department: user.userDepartment,
          role: user.departmentRole,
          roleCode: user.roleCode
        },
        goals: individualGoals.map(goal => ({
          id: goal.id,
          title: goal.title,
          type: goal.type,
          category: goal.category,
          targetValue: goal.targetValue,
          currentValue: goal.currentValue,
          progressPercentage: goal.targetValue ? 
            ((goal.currentValue || 0) / parseFloat(goal.targetValue.toString()) * 100).toFixed(2) : "0",
          stage: goal.stage,
          kpi: goal.kpi,
          parentGoal: goal.parentGoal
        })),
        tasks: tasks.map(task => ({
          id: task.id,
          title: task.title,
          stage: task.stage,
          priority: task.priority,
          isOverdue: task.isOverdue,
          goal: task.goal
        })),
        scorecard
      };
    } catch (error) {
      console.error("Error getting user scorecard:", error);
      throw error;
    }
  }

  /**
   * Get department performance scorecard with comprehensive scoring
   */
  static async getDepartmentScorecard(departmentName: string) {
    try {
      // Get department goals
      const departmentGoals = await prisma.performanceGoal.findMany({
        where: {
          type: 'department',
          departmentName: departmentName
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
          parentGoal: {
            select: {
              id: true,
              title: true,
              type: true
            }
          }
        }
      });

      // Get department users
      const departmentUsers = await prisma.user.findMany({
        where: {
          userDepartment: departmentName,
          role: {
            name: {
              notIn: ["admin", "applicant"]
            }
          }
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          departmentRole: true,
          roleCode: true
        }
      });

      // Calculate comprehensive department scorecard
      const scorecard = this.calculateDepartmentScorecard(departmentGoals, departmentUsers, departmentName);

      return {
        department: departmentName,
        goals: departmentGoals.map(goal => ({
          id: goal.id,
          title: goal.title,
          type: goal.type,
          category: goal.category,
          targetValue: goal.targetValue,
          currentValue: goal.currentValue,
          progressPercentage: goal.targetValue ? 
            ((goal.currentValue || 0) / parseFloat(goal.targetValue.toString()) * 100).toFixed(2) : "0",
          stage: goal.stage,
          kpi: goal.kpi,
          parentGoal: goal.parentGoal,
          individualGoals: goal.subGoals.map(indGoal => ({
            id: indGoal.id,
            title: indGoal.title,
            assignedTo: indGoal.assignedTo,
            targetValue: indGoal.targetValue,
            currentValue: indGoal.currentValue,
            progressPercentage: indGoal.targetValue ? 
              ((indGoal.currentValue || 0) / parseFloat(indGoal.targetValue.toString()) * 100).toFixed(2) : "0",
            stage: indGoal.stage
          }))
        })),
        users: departmentUsers.map(user => ({
          id: user.id,
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          role: user.departmentRole,
          roleCode: user.roleCode
        })),
        scorecard
      };
    } catch (error) {
      console.error("Error getting department scorecard:", error);
      throw error;
    }
  }

  /**
   * Calculate comprehensive user scorecard based on NVCCZ performance formulas
   */
  private static calculateUserScorecard(goals: any[], tasks: any[], user: any) {
    // A. Results Delivery (90% maximum)
    const resultsDelivery = this.calculateResultsDelivery(goals);
    
    // B. Budget Performance (10% maximum) - Simplified for now
    const budgetPerformance = this.calculateBudgetPerformance(goals);
    
    // Calculate final score
    const totalScore = parseFloat(resultsDelivery.totalScore) + parseFloat(budgetPerformance.totalScore);
    const performanceBand = this.getPerformanceBand(totalScore);
    
    return {
      sections: {
        resultsDelivery,
        budgetPerformance
      },
      finalScore: {
        total: totalScore.toFixed(2),
        performanceBand,
        rating: this.getRatingDescription(totalScore)
      },
      summary: {
        totalGoals: goals.length,
        completedGoals: goals.filter(g => g.stage === 'completed').length,
        totalTasks: tasks.length,
        completedTasks: tasks.filter(t => t.stage === 'completed').length,
        overdueTasks: tasks.filter(t => t.isOverdue).length
      }
    };
  }

  /**
   * Calculate comprehensive department scorecard based on NVCCZ performance formulas
   */
  private static calculateDepartmentScorecard(goals: any[], users: any[], departmentName: string) {
    // A1. Outcomes (30% maximum)
    const outcomes = this.calculateOutcomes(goals);
    
    // A2. Outputs (20% maximum)
    const outputs = this.calculateOutputs(goals);
    
    // B. Service Delivery Standards (20% maximum)
    const serviceDelivery = this.calculateServiceDelivery(goals, users);
    
    // C. Management of Resources (25% maximum)
    const management = this.calculateManagement(goals, users);
    
    // D. Cross-cutting Government Priorities (5% maximum)
    const crossCutting = this.calculateCrossCutting(goals, users);
    
    // Calculate final score
    const totalScore = parseFloat(outcomes.totalScore) + parseFloat(outputs.totalScore) + parseFloat(serviceDelivery.totalScore) + 
                      parseFloat(management.totalScore) + parseFloat(crossCutting.totalScore);
    const performanceBand = this.getPerformanceBand(totalScore);
    
    return {
      sections: {
        outcomes,
        outputs,
        serviceDelivery,
        management,
        crossCutting
      },
      finalScore: {
        total: totalScore.toFixed(2),
        performanceBand,
        rating: this.getRatingDescription(totalScore)
      },
      summary: {
        totalGoals: goals.length,
        completedGoals: goals.filter(g => g.stage === 'completed').length,
        totalUsers: users.length,
        managers: users.filter(u => u.roleCode?.includes('_MGR')).length,
        officers: users.filter(u => u.roleCode?.includes('_OFF')).length
      }
    };
  }

  /**
   * Calculate Results Delivery section (90% max)
   */
  private static calculateResultsDelivery(goals: any[]) {
    const outputs = goals.map(goal => {
      const targetValue = parseFloat(goal.targetValue?.toString() || '0');
      const actualValue = parseFloat(goal.currentValue?.toString() || '0');
      const allowableVariance = 10; // Default 10% variance
      
      // Calculate performance rating (1-4)
      const rating = this.calculatePerformanceRating(actualValue, targetValue, allowableVariance);
      
      // Weight based on goal importance (simplified - equal weight for now)
      const weight = goals.length > 0 ? 90 / goals.length : 0;
      
      return {
        id: goal.id,
        title: goal.title,
        target: targetValue,
        actual: actualValue,
        variance: actualValue - targetValue,
        variancePercentage: targetValue > 0 ? ((actualValue - targetValue) / targetValue * 100).toFixed(2) : "0",
        rating,
        weight: weight.toFixed(2),
        weightedScore: (weight * rating).toFixed(2),
        kpi: goal.kpi
      };
    });
    
    const totalScore = outputs.reduce((sum, output) => sum + parseFloat(output.weightedScore), 0);
    
    return {
      maxScore: 90,
      totalScore: Math.min(totalScore, 90).toFixed(2),
      outputs,
      completionRate: goals.length > 0 ? (outputs.filter(o => o.rating >= 3).length / goals.length * 100).toFixed(2) : "0"
    };
  }

  /**
   * Calculate Budget Performance section (10% max)
   */
  private static calculateBudgetPerformance(goals: any[]) {
    // Simplified budget calculation based on goal achievement
    const totalTargetValue = goals.reduce((sum, goal) => 
      sum + parseFloat(goal.targetValue?.toString() || '0'), 0);
    const totalActualValue = goals.reduce((sum, goal) => 
      sum + parseFloat(goal.currentValue?.toString() || '0'), 0);
    
    const budgetUtilization = totalTargetValue > 0 ? (totalActualValue / totalTargetValue) * 100 : 0;
    const allowableVariance = 10; // 10% variance allowed
    const rating = this.calculatePerformanceRating(budgetUtilization, 100, allowableVariance);
    
    return {
      maxScore: 10,
      totalScore: (10 * rating).toFixed(2),
      budgetUtilization: budgetUtilization.toFixed(2),
      targetUtilization: 100,
      variance: (budgetUtilization - 100).toFixed(2),
      rating
    };
  }

  /**
   * Calculate Outcomes section (30% max)
   */
  private static calculateOutcomes(goals: any[]) {
    // Simplified outcomes calculation
    const outcomeGoals = goals.filter(g => g.category === 'strategic' || g.category === 'financial');
    const totalScore = outcomeGoals.length > 0 ? 
      Math.min(outcomeGoals.length * 7.5, 30) : 0; // 7.5 points per outcome goal
    
    return {
      maxScore: 30,
      totalScore: totalScore.toFixed(2),
      outcomeGoals: outcomeGoals.length,
      completionRate: outcomeGoals.length > 0 ? 
        (outcomeGoals.filter(g => g.stage === 'completed').length / outcomeGoals.length * 100).toFixed(2) : "0"
    };
  }

  /**
   * Calculate Outputs section (20% max)
   */
  private static calculateOutputs(goals: any[]) {
    const outputGoals = goals.filter(g => g.category === 'operational');
    const totalScore = outputGoals.length > 0 ? 
      Math.min(outputGoals.length * 5, 20) : 0; // 5 points per output goal
    
    return {
      maxScore: 20,
      totalScore: totalScore.toFixed(2),
      outputGoals: outputGoals.length,
      completionRate: outputGoals.length > 0 ? 
        (outputGoals.filter(g => g.stage === 'completed').length / outputGoals.length * 100).toFixed(2) : "0"
    };
  }

  /**
   * Calculate Service Delivery Standards (20% max)
   */
  private static calculateServiceDelivery(goals: any[], users: any[]) {
    // Simplified service delivery calculation
    const serviceGoals = goals.filter(g => g.category === 'operational');
    const totalScore = serviceGoals.length > 0 ? 
      Math.min(serviceGoals.length * 4, 20) : 0;
    
    return {
      maxScore: 20,
      totalScore: totalScore.toFixed(2),
      serviceGoals: serviceGoals.length,
      userSatisfaction: users.length > 0 ? "85.0" : "0.0" // Placeholder
    };
  }

  /**
   * Calculate Management of Resources (25% max)
   */
  private static calculateManagement(goals: any[], users: any[]) {
    // Financial Management (10%)
    const financialScore = this.calculateFinancialManagement(goals);
    
    // Organizational Capacity (15%)
    const organizationalScore = this.calculateOrganizationalCapacity(goals, users);
    
    const totalScore = financialScore + organizationalScore;
    
    return {
      maxScore: 25,
      totalScore: totalScore.toFixed(2),
      financialManagement: {
        maxScore: 10,
        score: financialScore.toFixed(2)
      },
      organizationalCapacity: {
        maxScore: 15,
        score: organizationalScore.toFixed(2)
      }
    };
  }

  /**
   * Calculate Cross-cutting Government Priorities (5% max)
   */
  private static calculateCrossCutting(goals: any[], users: any[]) {
    // Simplified cross-cutting calculation
    const totalScore = Math.min(goals.length * 0.5, 5);
    
    return {
      maxScore: 5,
      totalScore: totalScore.toFixed(2),
      priorities: ["Integrity", "Health", "Environment", "Performance"]
    };
  }

  /**
   * Calculate Financial Management score
   */
  private static calculateFinancialManagement(goals: any[]) {
    const financialGoals = goals.filter(g => g.category === 'financial');
    return Math.min(financialGoals.length * 2.5, 10);
  }

  /**
   * Calculate Organizational Capacity score
   */
  private static calculateOrganizationalCapacity(goals: any[], users: any[]) {
    const capacityScore = goals.length * 1.5; // Based on goal completion
    const userScore = users.length * 0.5; // Based on team size
    return Math.min(capacityScore + userScore, 15);
  }

  /**
   * Calculate performance rating (1-4) based on actual vs target
   */
  private static calculatePerformanceRating(actual: number, target: number, allowableVariance: number): number {
    if (target === 0) return 1;
    
    const variancePercentage = Math.abs((actual - target) / target * 100);
    const achievementPercentage = (actual / target) * 100;
    
    // Rating decision tree
    if (actual >= target) {
      return 4; // Exceeded target
    } else if (variancePercentage <= allowableVariance) {
      return 3; // Within allowable variance
    } else if (achievementPercentage >= 50) {
      return 2; // Below variance but >= 50% of target
    } else {
      return 1; // Unsatisfactory - < 50% of target
    }
  }

  /**
   * Get performance band based on total score
   */
  private static getPerformanceBand(score: number): string {
    if (score >= 90) return "Exceptional";
    if (score >= 75) return "Very Good";
    if (score >= 60) return "Satisfactory";
    if (score >= 50) return "Needs Improvement";
    return "Unsatisfactory";
  }

  /**
   * Get rating description
   */
  private static getRatingDescription(score: number): string {
    const band = this.getPerformanceBand(score);
    const descriptions = {
      "Exceptional": "Exceeded targets consistently",
      "Very Good": "Met most targets, some exceeded",
      "Satisfactory": "Met minimum requirements",
      "Needs Improvement": "Below expectations",
      "Unsatisfactory": "Significant performance gaps"
    };
    return descriptions[band] || "Performance not assessed";
  }
}