// @ts-nocheck
import { prisma } from "../utils/database";
import AuditService from "./AuditService";
import { RollupCalculationService } from "./RollupCalculationService";
import {
  BOARD_SECTION_WEIGHTS,
  CEO_SECTION_WEIGHTS,
  DEFAULT_ORG_PILLAR_WEIGHTS,
  buildPersonalAttributes,
  buildTrainingSection,
  computeGoalProgress,
  computeRawRating,
  parseStretchTargetValueFromActivities,
  deriveActualFromProgress,
  getContributionWeight,
  isBoardChair,
  isCEO,
  isComplianceLeader,
  isDepartmentManager,
  isExecutive,
  isFinalOrArchived,
  isHRLeader,
  isMonitoringAndEvaluationLeader,
  isSysAdmin,
  redistributeWeights,
  resolveGoalEscalationStatus,
  resolvePeriodLabel,
  resolveSectionWeights,
  resolveWeight,
  round,
  toNumber
} from "./performanceScorecardSupport";
import { shouldRaiseDataQualityAlert } from "./performanceBackendSupport";

type AccessContext = {
  action: string;
  entityId: string;
  viewer: any;
  ipAddress?: string | null;
  userAgent?: string | null;
};

function currentPeriodBounds() {
  const now = new Date();
  return {
    periodStart: new Date(now.getFullYear(), now.getMonth(), 1),
    periodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
  };
}

function decimalForStorage(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }

  return round(value, 2);
}

function getRequestMetadata(meta?: any) {
  return {
    ipAddress: meta?.ipAddress || null,
    userAgent: meta?.userAgent || null
  };
}

export class PerformanceScorecardService {
  private static async logAccessDenied(context: AccessContext, message: string) {
    const metadata = getRequestMetadata(context);
    await AuditService.log({
      userId: context.viewer?.id,
      action: context.action,
      entityType: "PerformanceScorecardAccess",
      entityId: context.entityId,
      newValues: {
        allowed: false,
        message
      },
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent
    });

    throw new Error(message);
  }

  private static async assertEmployeeAccess(viewer: any, employeeUser: any, employeeRecord: any, mode: "view" | "generate", meta?: any) {
    return;
  }

  private static async assertDepartmentAccess(viewer: any, departmentName: string, mode: "view" | "generate", meta?: any) {
    return;
  }

  private static async assertCEOAccess(viewer: any, mode: "view" | "generate", meta?: any) {
    return;
  }

  private static async assertBoardAccess(viewer: any, meta?: any) {
    return;
  }

  private static async assertOrgDashboardAccess(viewer: any, meta?: any) {
    return;
  }

  private static buildPeriod(input?: any) {
    if (input?.periodStart && input?.periodEnd) {
      return {
        periodStart: new Date(input.periodStart),
        periodEnd: new Date(input.periodEnd),
        periodLabel: input.periodLabel
      };
    }

    return currentPeriodBounds();
  }

  private static buildPeriodWhere(period: any) {
    return {
      startDate: {
        lte: period.periodEnd
      },
      endDate: {
        gte: period.periodStart
      }
    };
  }

  private static buildContractPeriodWhere(period: any) {
    return {
      periodStart: {
        lte: period.periodEnd
      },
      periodEnd: {
        gte: period.periodStart
      }
    };
  }

  private static async resolveContract(params: {
    contractType: string;
    subjectUserId?: string;
    departmentName?: string;
    period?: any;
  }) {
    const period = params.period || currentPeriodBounds();
    return prisma.performanceContract.findFirst({
      where: {
        contractType: params.contractType,
        ...(params.subjectUserId ? { subjectUserId: params.subjectUserId } : {}),
        ...(params.departmentName ? { departmentName: params.departmentName } : {}),
        ...this.buildContractPeriodWhere(period),
        status: {
          notIn: ["ARCHIVED", "CANCELLED"]
        }
      },
      include: {
        subjectUser: {
          include: {
            role: true,
            employee: true
          }
        },
        reviewer: {
          include: { role: true }
        },
        approver: {
          include: { role: true }
        }
      },
      orderBy: {
        updatedAt: "desc"
      }
    });
  }

  private static async resolveEmployeeContext(employeeUserId: string, periodInput?: any) {
    const employeeUser = await prisma.user.findUnique({
      where: { id: employeeUserId },
      include: {
        role: true,
        employee: true
      }
    });

    if (!employeeUser) {
      throw new Error("Employee not found");
    }

    const contract = await this.resolveContract({
      contractType: "EMPLOYEE",
      subjectUserId: employeeUserId,
      period: this.buildPeriod(periodInput)
    });

    if (!contract) {
      throw new Error("No performance contract found for this employee and period.");
    }

    const period = {
      periodStart: contract.periodStart,
      periodEnd: contract.periodEnd,
      periodLabel: contract.periodLabel
    };

    const goals = await prisma.performanceGoal.findMany({
      where: {
        assignedToId: employeeUserId,
        type: "individual",
        OR: [
          { performanceContractId: contract.id },
          this.buildPeriodWhere(period)
        ]
      },
      include: {
        kpi: true,
        parentGoal: {
          select: {
            id: true,
            title: true,
            departmentName: true,
            scorecardPillar: true,
            parentGoalId: true
          }
        }
      },
      orderBy: [
        { displayOrder: "asc" },
        { createdAt: "asc" }
      ]
    });

    return {
      employeeUser,
      employeeRecord: employeeUser.employee,
      contract,
      period,
      goals
    };
  }

  private static buildGoalRows(goals: any[], options: { stretchScoringEnabled?: boolean }) {
    const fallbackWeight = goals.length > 0 ? 100 / goals.length : 0;
    const baseRows = goals.map((goal) => {
      const targetValue = toNumber(goal.preciseTargetValue ?? goal.targetValue, 0);
      const actualValue = toNumber(goal.preciseCurrentValue ?? goal.currentValue, 0);
      const stretchTargetValue = parseStretchTargetValueFromActivities(goal.activities);
      const weight = resolveWeight(goal.scorecardWeight, fallbackWeight);
      const progress = computeGoalProgress({
        actualValue,
        targetValue,
        isReverseKpi: goal.isReverseKpi,
        stretchScoringEnabled: options.stretchScoringEnabled
      });
      const rawRating = goal.isPendingApproval
        ? null
        : computeRawRating({
            actualValue,
            targetValue,
            allowableVariance: goal.allowableVariance,
            isReverseKpi: goal.isReverseKpi
          });

      return {
        id: goal.id,
        goalName: goal.title,
        kpiOrMeasure: goal.measureName || goal.kpi?.name || goal.title,
        targetValue,
        stretchTargetValue,
        actualValue,
        allowableVariance: toNumber(goal.allowableVariance, 0.1),
        isReverseKpi: Boolean(goal.isReverseKpi),
        isPendingApproval: Boolean(goal.isPendingApproval),
        originalWeight: round(weight, 4),
        weight,
        progressPct: goal.isPendingApproval ? null : progress.progressPct,
        rawRating,
        missingValue: progress.isMissing,
        parentGoalId: goal.parentGoalId,
        parentGoal: goal.parentGoal,
        sourceGoal: goal
      };
    });

    return redistributeWeights(baseRows).map((row) => ({
      ...row,
      weightedScore: row.rawRating === null ? null : round((row.effectiveWeight * row.rawRating) / 100, 4)
    }));
  }

  private static buildBudgetComponent(contract: any) {
    if (contract?.allocatedBudget === null || contract?.allocatedBudget === undefined) {
      return {
        included: false,
        score: null,
        budgetUtilisationPct: null,
        allocatedBudget: null,
        actualSpend: null
      };
    }

    const allocatedBudget = toNumber(contract.allocatedBudget, 0);
    const actualSpend = toNumber(contract.actualSpend, 0);

    if (allocatedBudget <= 0) {
      return {
        included: false,
        score: null,
        budgetUtilisationPct: null,
        allocatedBudget,
        actualSpend
      };
    }

    const budgetUtilisationPct = round((actualSpend / allocatedBudget) * 100, 2);
    const rating = computeRawRating({
      actualValue: budgetUtilisationPct,
      targetValue: 100,
      allowableVariance: 0.1,
      isReverseKpi: false
    });

    return {
      included: true,
      score: rating,
      budgetUtilisationPct,
      allocatedBudget,
      actualSpend
    };
  }

  private static summariseEmployeeRows(rows: any[]) {
    const activeRows = rows.filter((row) => !row.isPendingApproval);
    const weightTotal = activeRows.reduce((sum, row) => sum + toNumber(row.effectiveWeight, 0), 0);
    const weightedTotal = activeRows.reduce((sum, row) => sum + toNumber(row.weightedScore, 0), 0);

    return {
      resultsDeliveryScore: weightTotal > 0 ? round((weightedTotal / weightTotal) * 100, 2) / 25 : 0,
      pendingApprovalCount: rows.filter((row) => row.isPendingApproval).length
    };
  }

  private static buildEmployeeDocument(params: {
    employeeUser: any;
    contract: any;
    period: any;
    rows: any[];
    resultsDeliveryScore: number;
    budgetComponent: any;
    finalScore: number;
    scorecardStatus?: string;
  }) {
    return {
      header: {
        organisationName: "NVCCZ",
        documentTitle: "Individual Performance Scorecard",
        employeeName: `${params.employeeUser.firstName} ${params.employeeUser.lastName}`,
        jobTitle: params.employeeUser.departmentRole || params.employeeUser.role?.name || null,
        department: params.employeeUser.userDepartment,
        appraiserName: params.contract.reviewer
          ? `${params.contract.reviewer.firstName} ${params.contract.reviewer.lastName}`
          : null,
        appraiserTitle: params.contract.reviewer?.departmentRole || params.contract.reviewer?.role?.name || null,
        reviewPeriod: resolvePeriodLabel({
          periodLabel: params.period.periodLabel,
          periodStart: params.period.periodStart,
          periodEnd: params.period.periodEnd
        })
      },
      performanceMatrix: params.rows.map((row, index) => ({
        index: index + 1,
        goal: row.goalName,
        kpiOrMeasure: row.kpiOrMeasure,
        target: row.targetValue,
        actual: row.isPendingApproval ? "Pending" : row.actualValue,
        variance: row.targetValue > 0 ? round(row.actualValue - row.targetValue, 2) : null,
        progressPct: row.isPendingApproval ? "Pending" : row.progressPct,
        rawRating: row.isPendingApproval ? "Pending" : row.rawRating,
        weight: row.originalWeight,
        effectiveWeight: row.effectiveWeight,
        weightedScore: row.isPendingApproval ? "Pending" : row.weightedScore
      })),
      subtotals: {
        resultsDeliveryScore: round(params.resultsDeliveryScore, 2),
        budgetPerformanceScore: params.budgetComponent.included ? params.budgetComponent.score : null,
        finalScore: round(params.finalScore, 2)
      },
      qualitativeSections: {
        personalAttributes: buildPersonalAttributes(params.contract.qualitativeTemplate),
        trainingAndDevelopment: buildTrainingSection(params.contract.qualitativeTemplate)
      },
      signatureBlock: {
        appraisee: {
          name: `${params.employeeUser.firstName} ${params.employeeUser.lastName}`,
          signature: null,
          date: null
        },
        appraiser: {
          name: params.contract.reviewer
            ? `${params.contract.reviewer.firstName} ${params.contract.reviewer.lastName}`
            : null,
          signature: null,
          date: null
        }
      },
      status: params.scorecardStatus || "DRAFT"
    };
  }

  private static buildDepartmentDocument(params: {
    departmentName: string;
    period: any;
    manager: any;
    rows: any[];
    rollupSummary: any[];
    departmentScore: number;
    status?: string;
  }) {
    return {
      header: {
        organisationName: "NVCCZ",
        documentTitle: "Departmental Performance Scorecard",
        departmentName: params.departmentName,
        departmentManagerName: params.manager
          ? `${params.manager.firstName} ${params.manager.lastName}`
          : null,
        departmentManagerTitle: params.manager?.departmentRole || params.manager?.role?.name || null,
        reviewPeriod: resolvePeriodLabel({
          periodLabel: params.period.periodLabel,
          periodStart: params.period.periodStart,
          periodEnd: params.period.periodEnd
        })
      },
      performanceMatrix: params.rows.map((row, index) => ({
        index: index + 1,
        goal: row.goalName,
        kpi: row.kpiOrMeasure,
        target: row.targetValue,
        actualDirect: row.directActualValue,
        rollupProgress: row.rollupProgressPct,
        selectedProgress: row.selectedProgressPct,
        variance: row.targetValue > 0 ? round(row.selectedActualValue - row.targetValue, 2) : null,
        rawRating: row.rawRating,
        weight: row.originalWeight,
        effectiveWeight: row.effectiveWeight,
        weightedScore: row.weightedScore
      })),
      employeeRollupSummary: params.rollupSummary,
      finalScore: round(params.departmentScore, 2),
      signatureBlock: {
        departmentManager: {
          name: params.manager ? `${params.manager.firstName} ${params.manager.lastName}` : null,
          signature: null,
          date: null
        },
        approver: {
          name: null,
          signature: null,
          date: null
        }
      },
      status: params.status || "DRAFT"
    };
  }

  private static extractFormulaActual(goal: any) {
    const inputs = goal.activities && typeof goal.activities === "object"
      ? goal.activities
      : {};
    const storedActual = toNumber(goal.preciseCurrentValue ?? goal.currentValue, 0);

    const formulaType = String(goal.formulaType || "").toUpperCase();

    switch (formulaType) {
      case "ROI":
        return inputs.initialCost > 0
          ? ((toNumber(inputs.finalValue, 0) - toNumber(inputs.initialCost, 0)) / toNumber(inputs.initialCost, 1)) * 100
          : storedActual;
      case "BUSINESS_SURVIVAL_RATE":
        return inputs.totalFundedCompanies > 0
          ? (toNumber(inputs.activePortfolioCompanies, 0) / toNumber(inputs.totalFundedCompanies, 1)) * 100
          : storedActual;
      case "CORPORATE_GOVERNANCE_INDEX":
        return inputs.totalGovernanceRequirements > 0
          ? (toNumber(inputs.complianceItemsMet, 0) / toNumber(inputs.totalGovernanceRequirements, 1)) * 100
          : storedActual;
      case "STAKEHOLDER_SATISFACTION_INDEX":
      case "EMPLOYEE_SATISFACTION_INDEX":
      case "CUSTOMER_SATISFACTION_INDEX":
        return toNumber(inputs.averageSurveyScore, storedActual) * 100;
      case "FUNDING_RATE":
        return inputs.projectsApproved > 0
          ? (toNumber(inputs.projectsFunded, 0) / toNumber(inputs.projectsApproved, 1)) * 100
          : storedActual;
      case "PROJECTS_FUNDED":
        return inputs.targetProjects > 0
          ? (toNumber(inputs.projectsFunded, 0) / toNumber(inputs.targetProjects, 1)) * 100
          : storedActual;
      case "CAPITAL_DISBURSED":
        return inputs.budgetedCapital > 0
          ? (toNumber(inputs.capitalDisbursed, 0) / toNumber(inputs.budgetedCapital, 1)) * 100
          : storedActual;
      case "RESOURCES_MOBILISED":
      case "ALTERNATIVE_RESOURCES_MOBILISED":
        return inputs.targetAmount > 0
          ? (toNumber(inputs.amountRaised, 0) / toNumber(inputs.targetAmount, 1)) * 100
          : storedActual;
      case "CHARTER_SCORE":
        return [
          ["charterReviewed", 20],
          ["charterDisplayed", 30],
          ["charterAvailableOnline", 35],
          ["charterLocalLanguages", 5],
          ["customerAwareness", 10]
        ].reduce((sum, [key, weight]) => sum + ((toNumber(inputs[key], 0) * weight) / 100), 0);
      case "EASE_OF_DOING_BUSINESS":
        return inputs.targetInnovations > 0
          ? (toNumber(inputs.innovationsCompleted, 0) / toNumber(inputs.targetInnovations, 1)) * 100
          : storedActual;
      case "STRATEGIC_ALLOCATION_COMPLIANCE":
        return inputs.totalBudget > 0
          ? (toNumber(inputs.budgetAlignedToPolicy, 0) / toNumber(inputs.totalBudget, 1)) * 100
          : storedActual;
      case "INTERNAL_PROCESS_EFFICIENCY":
      case "E_GOVERNMENT_FLAGSHIPS":
      case "PROJECTS_COMMISSIONED":
      case "STATUTORY_REPORTS":
      case "POLICIES_FORMULATED":
      case "MONITORING_REPORTS":
      case "PERFORMANCE_LEVELS_EVALUATED":
      case "PERFORMANCE_CONTRACTS_SIGNED":
      case "STRATEGIC_PLANNING_REVIEWS":
      case "POLICIES_SUBMITTED_TO_MINISTER":
      case "DISPOSAL_OF_IDLE_ASSETS":
      case "NDS2_PROGRAMME_ACHIEVEMENT":
        return inputs.targetCount > 0
          ? (toNumber(inputs.completedCount, 0) / toNumber(inputs.targetCount, 1)) * 100
          : storedActual;
      case "STAFF_RETENTION":
        return inputs.totalStaff > 0
          ? (toNumber(inputs.retainedStaff, 0) / toNumber(inputs.totalStaff, 1)) * 100
          : storedActual;
      case "CODE_OF_ETHICS_COMPLIANCE":
        return inputs.totalEmployees > 0
          ? (toNumber(inputs.compliantEmployees, 0) / toNumber(inputs.totalEmployees, 1)) * 100
          : storedActual;
      default:
        return storedActual;
    }
  }

  private static buildSectionRows(goals: any[], contract: any) {
    const fallbackWeight = goals.length > 0 ? 100 / goals.length : 0;

    return goals.map((goal) => {
      const actualValue = this.extractFormulaActual(goal);
      const targetValue = toNumber(goal.preciseTargetValue ?? goal.targetValue, 0);
      const stretchTargetValue = parseStretchTargetValueFromActivities(goal.activities);
      const weight = resolveWeight(goal.scorecardWeight, fallbackWeight);
      const progress = computeGoalProgress({
        actualValue,
        targetValue,
        isReverseKpi: goal.isReverseKpi,
        stretchScoringEnabled: contract?.stretchScoringEnabled
      });
      const rawRating = computeRawRating({
        actualValue,
        targetValue,
        allowableVariance: goal.allowableVariance,
        isReverseKpi: goal.isReverseKpi
      });

      return {
        id: goal.id,
        section: goal.scorecardSection || "UNASSIGNED",
        heading: goal.scorecardSection || "Unassigned",
        indicator: goal.title,
        formulaType: goal.formulaType || "DIRECT",
        weight,
        targetValue,
        stretchTargetValue,
        actualValue: round(actualValue, 4),
        allowableVariance: toNumber(goal.allowableVariance, 0.1),
        progressPct: progress.progressPct,
        rawRating,
        weightedScore: round((weight * rawRating) / 100, 4),
        goal
      };
    });
  }

  private static summariseSectionScores(rows: any[], sectionWeights: Record<string, number>) {
    const bySection = Object.keys(sectionWeights).map((sectionKey) => {
      const sectionRows = rows.filter((row) => row.section === sectionKey);
      const totalIndicatorWeight = sectionRows.reduce((sum, row) => sum + row.weight, 0);
      const sectionScore = totalIndicatorWeight > 0
        ? round(sectionRows.reduce((sum, row) => sum + row.weightedScore, 0) / totalIndicatorWeight, 4)
        : 0;

      return {
        key: sectionKey,
        score: sectionScore,
        weight: sectionWeights[sectionKey],
        indicators: sectionRows
      };
    });

    const finalScore = bySection.reduce(
      (sum, section) => sum + (section.weight * section.score) / 100,
      0
    );

    return {
      sections: bySection,
      finalScore: round(finalScore, 2)
    };
  }

  private static async upsertDraftScorecard(payload: any) {
    const existing = await prisma.performanceScorecard.findFirst({
      where: {
        scorecardType: payload.scorecardType,
        subjectUserId: payload.subjectUserId || null,
        departmentName: payload.departmentName || null,
        periodStart: payload.periodStart,
        periodEnd: payload.periodEnd,
        isLocked: false,
        status: "DRAFT"
      },
      orderBy: {
        updatedAt: "desc"
      }
    });

    if (existing) {
      return prisma.performanceScorecard.update({
        where: { id: existing.id },
        data: payload
      });
    }

    return prisma.performanceScorecard.create({
      data: payload
    });
  }

  private static async triggerUpwardRecalculation(goals: any[]) {
    const parentGoalIds = Array.from(
      new Set(
        goals
          .map((goal) => goal.parentGoalId)
          .filter(Boolean)
      )
    );

    for (const parentGoalId of parentGoalIds) {
      try {
        await RollupCalculationService.recalculateAllRollups(parentGoalId);
      } catch (error) {
        console.error(`Failed to recalculate rollups for ${parentGoalId}:`, error);
      }
    }
  }

  static async getEmployeeScorecard(params: {
    viewer: any;
    employeeUserId: string;
    periodStart?: string;
    periodEnd?: string;
    periodLabel?: string;
    persist?: boolean;
    meta?: any;
  }) {
    const { employeeUser, employeeRecord, contract, period, goals } = await this.resolveEmployeeContext(
      params.employeeUserId,
      params
    );

    await this.assertEmployeeAccess(params.viewer, employeeUser, employeeRecord, params.persist ? "generate" : "view", params.meta);

    const rows = this.buildGoalRows(goals, {
      stretchScoringEnabled: contract.stretchScoringEnabled
    });
    const resultsSummary = this.summariseEmployeeRows(rows);
    const budgetComponent = this.buildBudgetComponent(contract);
    const resultsDeliveryScore = resultsSummary.resultsDeliveryScore;
    const finalScore = budgetComponent.included
      ? round(resultsDeliveryScore * 0.9 + toNumber(budgetComponent.score, 0) * 0.1, 2)
      : round(resultsDeliveryScore, 2);

    const warnings = [];
    if (resultsSummary.pendingApprovalCount > 0) {
      warnings.push(`${resultsSummary.pendingApprovalCount} goal(s) are pending approval and were excluded from scoring.`);
    }

    const documentPayload = this.buildEmployeeDocument({
      employeeUser,
      contract,
      period,
      rows,
      resultsDeliveryScore,
      budgetComponent,
      finalScore,
      scorecardStatus: "DRAFT"
    });

    let scorecardRecord = null;
    if (params.persist) {
      scorecardRecord = await this.upsertDraftScorecard({
        contractId: contract.id,
        scorecardType: "EMPLOYEE",
        status: "DRAFT",
        subjectUserId: employeeUser.id,
        generatedById: params.viewer.id,
        periodLabel: resolvePeriodLabel({
          periodLabel: period.periodLabel,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd
        }),
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        resultsDeliveryScore: decimalForStorage(resultsDeliveryScore),
        budgetScore: decimalForStorage(budgetComponent.score),
        finalScore: decimalForStorage(finalScore),
        warnings,
        sections: {
          resultsDeliveryScore,
          budgetComponent
        },
        matrixRows: rows,
        qualitativeSections: documentPayload.qualitativeSections,
        signatureState: documentPayload.signatureBlock,
        documentPayload
      });

      await AuditService.log({
        userId: params.viewer.id,
        action: "GENERATE",
        entityType: "PerformanceScorecard",
        entityId: scorecardRecord.id,
        newValues: {
          type: "EMPLOYEE",
          subjectUserId: employeeUser.id,
          finalScore
        },
        ...getRequestMetadata(params.meta)
      });

      await this.triggerUpwardRecalculation(goals);
    }

    return {
      scorecardType: "EMPLOYEE",
      access: {
        canView: true,
        canGenerate: params.viewer.id === employeeRecord?.lineManagerUserId || isCEO(params.viewer) || isHRLeader(params.viewer)
      },
      employee: {
        id: employeeUser.id,
        name: `${employeeUser.firstName} ${employeeUser.lastName}`,
        email: employeeUser.email,
        department: employeeUser.userDepartment,
        role: employeeUser.departmentRole || employeeUser.role?.name || null
      },
      contract: {
        id: contract.id,
        title: contract.title,
        periodLabel: resolvePeriodLabel({
          periodLabel: period.periodLabel,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd
        }),
        stretchScoringEnabled: contract.stretchScoringEnabled,
        reviewer: contract.reviewer
          ? {
              id: contract.reviewer.id,
              name: `${contract.reviewer.firstName} ${contract.reviewer.lastName}`
            }
          : null
      },
      warnings,
      goals: rows,
      scores: {
        resultsDeliveryScore: round(resultsDeliveryScore, 2),
        budgetScore: budgetComponent.score,
        finalScore
      },
      document: documentPayload,
      savedRecord: scorecardRecord
    };
  }

  static async getDepartmentScorecard(params: {
    viewer: any;
    departmentName: string;
    periodStart?: string;
    periodEnd?: string;
    periodLabel?: string;
    persist?: boolean;
    meta?: any;
  }) {
    await this.assertDepartmentAccess(params.viewer, params.departmentName, params.persist ? "generate" : "view", params.meta);

    const period = this.buildPeriod(params);
    const departmentContract = await this.resolveContract({
      contractType: "DEPARTMENT",
      departmentName: params.departmentName,
      period
    });

    const departmentUsers = await prisma.user.findMany({
      where: {
        userDepartment: params.departmentName
      },
      include: {
        role: true,
        employee: true
      }
    });

    const departmentManager = departmentUsers.find((user) => isDepartmentManager(user, params.departmentName)) || null;

    const departmentGoals = await prisma.performanceGoal.findMany({
      where: {
        type: "department",
        departmentName: params.departmentName,
        OR: [
          departmentContract ? { performanceContractId: departmentContract.id } : undefined,
          this.buildPeriodWhere(period)
        ].filter(Boolean)
      },
      include: {
        kpi: true,
        subGoals: {
          include: {
            assignedTo: {
              include: {
                role: true
              }
            }
          }
        }
      },
      orderBy: [
        { displayOrder: "asc" },
        { createdAt: "asc" }
      ]
    });

    const subjectUserIds = departmentUsers.map((user) => user.id);
    const employeeScorecards = await prisma.performanceScorecard.findMany({
      where: {
        scorecardType: "EMPLOYEE",
        subjectUserId: {
          in: subjectUserIds
        },
        periodStart: period.periodStart,
        periodEnd: period.periodEnd
      },
      include: {
        subjectUser: {
          include: {
            role: true
          }
        }
      },
      orderBy: {
        updatedAt: "desc"
      }
    });

    const latestByEmployee = new Map<string, any>();
    for (const scorecard of employeeScorecards) {
      if (!scorecard.subjectUserId || latestByEmployee.has(scorecard.subjectUserId)) continue;
      latestByEmployee.set(scorecard.subjectUserId, scorecard);
    }

    const draftEmployees = Array.from(latestByEmployee.values()).filter((scorecard) => scorecard.status === "DRAFT");
    const fallbackWeight = departmentGoals.length > 0 ? 100 / departmentGoals.length : 0;
    const goalRows = redistributeWeights(
      departmentGoals.map((goal) => {
        const directActualValue = toNumber(goal.preciseCurrentValue ?? goal.currentValue, 0);
        const targetValue = toNumber(goal.preciseTargetValue ?? goal.targetValue, 0);
        const directProgress = computeGoalProgress({
          actualValue: directActualValue,
          targetValue,
          isReverseKpi: goal.isReverseKpi,
          stretchScoringEnabled: departmentContract?.stretchScoringEnabled
        });

        const childGoals = goal.subGoals || [];
        const childFallbackWeight = childGoals.length > 0 ? 100 / childGoals.length : 0;
        const childContributions = childGoals.map((childGoal) => {
          const childProgress = computeGoalProgress({
            actualValue: toNumber(childGoal.currentValue, 0),
            targetValue: toNumber(childGoal.targetValue, 0),
            isReverseKpi: childGoal.isReverseKpi,
            stretchScoringEnabled: departmentContract?.stretchScoringEnabled
          });
          const contributionWeight = getContributionWeight(childGoal, childFallbackWeight);
          return {
            employeeId: childGoal.assignedToId,
            employeeName: childGoal.assignedTo ? `${childGoal.assignedTo.firstName} ${childGoal.assignedTo.lastName}` : "Unknown",
            progressPct: childProgress.progressPct,
            contributionWeight
          };
        });

        const totalContributionWeight = childContributions.reduce((sum, item) => sum + item.contributionWeight, 0);
        const weightedContributionTotal = childContributions.reduce(
          (sum, item) => sum + item.progressPct * item.contributionWeight,
          0
        );
        const rollupProgressPct = totalContributionWeight > 0
          ? round(weightedContributionTotal / totalContributionWeight, 2)
          : 0;

        const selectedProgressPct = Math.max(directProgress.progressPct, rollupProgressPct);
        const selectedActualValue = directProgress.progressPct >= rollupProgressPct
          ? directActualValue
          : deriveActualFromProgress(targetValue, selectedProgressPct, goal.isReverseKpi);
        const rawRating = computeRawRating({
          actualValue: selectedActualValue,
          targetValue,
          allowableVariance: goal.allowableVariance,
          isReverseKpi: goal.isReverseKpi
        });

        return {
          id: goal.id,
          goalName: goal.title,
          kpiOrMeasure: goal.measureName || goal.kpi?.name || goal.title,
          targetValue,
          stretchTargetValue: parseStretchTargetValueFromActivities(goal.activities),
          directActualValue,
          directProgressPct: directProgress.progressPct,
          rollupProgressPct,
          selectedProgressPct,
          selectedActualValue,
          originalWeight: resolveWeight(goal.scorecardWeight, fallbackWeight),
          weight: resolveWeight(goal.scorecardWeight, fallbackWeight),
          rawRating,
          isPendingApproval: Boolean(goal.isPendingApproval),
          childContributions
        };
      })
    ).map((row) => ({
      ...row,
      weightedScore: round((row.effectiveWeight * row.rawRating) / 100, 4)
    }));

    const activeGoalWeight = goalRows.filter((row) => !row.isPendingApproval).reduce((sum, row) => sum + row.effectiveWeight, 0);
    const totalWeightedScore = goalRows.filter((row) => !row.isPendingApproval).reduce((sum, row) => sum + row.weightedScore, 0);
    const departmentScore = activeGoalWeight > 0
      ? round((totalWeightedScore / activeGoalWeight) * 100, 2) / 25
      : 0;

    const limitedEmployeeVisibility = (isMonitoringAndEvaluationLeader(params.viewer) || isComplianceLeader(params.viewer))
      && !isDepartmentManager(params.viewer, params.departmentName)
      && !isHRLeader(params.viewer)
      && !isCEO(params.viewer);

    const rollupSummary = departmentUsers.map((user, index) => {
      const childGoalWeights = goalRows.reduce((sum, row) => {
        const contribution = row.childContributions.find((item) => item.employeeId === user.id);
        return sum + (contribution?.contributionWeight || 0);
      }, 0);
      const finalScorecard = latestByEmployee.get(user.id);
      const finalScore = finalScorecard?.finalScore ? toNumber(finalScorecard.finalScore, 0) : null;
      const weightedContribution = finalScore !== null
        ? round((finalScore * childGoalWeights) / 100, 4)
        : null;

      return {
        employeeId: user.id,
        employeeName: limitedEmployeeVisibility ? `Employee ${index + 1}` : `${user.firstName} ${user.lastName}`,
        finalScore,
        contributionWeight: round(childGoalWeights, 4),
        weightedContribution
      };
    });

    const warnings = [];
    if (draftEmployees.length > 0) {
      warnings.push(`${draftEmployees.length} employee scorecard(s) are not yet finalised. Department score may be incomplete.`);
    }

    const documentPayload = this.buildDepartmentDocument({
      departmentName: params.departmentName,
      period: departmentContract || period,
      manager: departmentManager,
      rows: goalRows,
      rollupSummary,
      departmentScore,
      status: "DRAFT"
    });

    let scorecardRecord = null;
    if (params.persist) {
      scorecardRecord = await this.upsertDraftScorecard({
        contractId: departmentContract?.id || null,
        scorecardType: "DEPARTMENT",
        status: "DRAFT",
        departmentName: params.departmentName,
        generatedById: params.viewer.id,
        periodLabel: resolvePeriodLabel({
          periodLabel: departmentContract?.periodLabel || params.periodLabel,
          periodStart: period.periodStart,
          periodEnd: period.periodEnd
        }),
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        finalScore: decimalForStorage(departmentScore),
        warnings,
        sections: {
          departmentScore
        },
        matrixRows: goalRows,
        rollupSummary,
        signatureState: documentPayload.signatureBlock,
        documentPayload
      });

      await AuditService.log({
        userId: params.viewer.id,
        action: "GENERATE",
        entityType: "PerformanceScorecard",
        entityId: scorecardRecord.id,
        newValues: {
          type: "DEPARTMENT",
          departmentName: params.departmentName,
          finalScore: departmentScore
        },
        ...getRequestMetadata(params.meta)
      });

      await this.triggerUpwardRecalculation(departmentGoals);
    }

    return {
      scorecardType: "DEPARTMENT",
      department: params.departmentName,
      warnings,
      goals: goalRows,
      employeeRollupSummary: rollupSummary,
      scores: {
        departmentScore
      },
      document: documentPayload,
      savedRecord: scorecardRecord
    };
  }

  static async getCEOScorecard(params: {
    viewer: any;
    periodStart?: string;
    periodEnd?: string;
    periodLabel?: string;
    persist?: boolean;
    meta?: any;
  }) {
    await this.assertCEOAccess(params.viewer, params.persist ? "generate" : "view", params.meta);

    const contract = await this.resolveContract({
      contractType: "CEO",
      period: this.buildPeriod(params)
    });

    if (!contract) {
      throw new Error("No active CEO performance contract found for the selected period.");
    }

    const goals = await prisma.performanceGoal.findMany({
      where: {
        performanceContractId: contract.id
      },
      orderBy: [
        { scorecardSection: "asc" },
        { displayOrder: "asc" },
        { createdAt: "asc" }
      ]
    });

    const rows = this.buildSectionRows(goals, contract);
    const sectionWeights = resolveSectionWeights(contract.sectionWeights, CEO_SECTION_WEIGHTS);
    const sectionSummary = this.summariseSectionScores(rows, sectionWeights);
    const budgetComponent = this.buildBudgetComponent(contract);
    const finalScore = budgetComponent.included
      ? round(sectionSummary.finalScore * 0.9 + toNumber(budgetComponent.score, 0) * 0.1, 2)
      : sectionSummary.finalScore;

    const documentPayload = {
      header: {
        organisationName: "NVCCZ",
        documentTitle: `CEO Performance Contract Review — ${contract.periodStart.getFullYear()}`,
        contractParties: [
          "Board of Directors",
          contract.subjectUser ? `${contract.subjectUser.firstName} ${contract.subjectUser.lastName}` : "CEO"
        ],
        reviewPeriod: resolvePeriodLabel({
          periodLabel: contract.periodLabel,
          periodStart: contract.periodStart,
          periodEnd: contract.periodEnd
        })
      },
      sections: sectionSummary.sections,
      agreedRatingsSummary: sectionSummary.sections.map((section) => ({
        section: section.key,
        rating: section.score
      })),
      qualitativeSections: {
        personalAttributes: buildPersonalAttributes(contract.qualitativeTemplate),
        trainingAndDevelopment: buildTrainingSection(contract.qualitativeTemplate)
      },
      signatureBlock: {
        ceo: {
          name: contract.subjectUser ? `${contract.subjectUser.firstName} ${contract.subjectUser.lastName}` : "CEO",
          signature: null,
          date: null
        },
        boardChairperson: {
          name: contract.approver ? `${contract.approver.firstName} ${contract.approver.lastName}` : "Board Chairperson",
          signature: null,
          date: null
        }
      },
      status: "DRAFT"
    };

    let scorecardRecord = null;
    if (params.persist) {
      scorecardRecord = await this.upsertDraftScorecard({
        contractId: contract.id,
        scorecardType: "CEO",
        status: "DRAFT",
        subjectUserId: contract.subjectUserId,
        generatedById: params.viewer.id,
        periodLabel: resolvePeriodLabel({
          periodLabel: contract.periodLabel,
          periodStart: contract.periodStart,
          periodEnd: contract.periodEnd
        }),
        periodStart: contract.periodStart,
        periodEnd: contract.periodEnd,
        resultsDeliveryScore: decimalForStorage(sectionSummary.finalScore),
        budgetScore: decimalForStorage(budgetComponent.score),
        finalScore: decimalForStorage(finalScore),
        sections: sectionSummary.sections,
        matrixRows: rows,
        qualitativeSections: documentPayload.qualitativeSections,
        signatureState: documentPayload.signatureBlock,
        documentPayload
      });
    }

    return {
      scorecardType: "CEO",
      contract: {
        id: contract.id,
        title: contract.title
      },
      sections: sectionSummary.sections,
      scores: {
        sectionScore: sectionSummary.finalScore,
        budgetScore: budgetComponent.score,
        finalScore
      },
      document: documentPayload,
      savedRecord: scorecardRecord
    };
  }

  static async getBoardScorecard(params: {
    viewer: any;
    periodStart?: string;
    periodEnd?: string;
    periodLabel?: string;
    persist?: boolean;
    meta?: any;
  }) {
    await this.assertBoardAccess(params.viewer, params.meta);

    const contract = await this.resolveContract({
      contractType: "BOARD",
      period: this.buildPeriod(params)
    });

    if (!contract) {
      throw new Error("No active Board performance contract found for the selected period.");
    }

    const goals = await prisma.performanceGoal.findMany({
      where: {
        performanceContractId: contract.id
      },
      orderBy: [
        { scorecardSection: "asc" },
        { displayOrder: "asc" },
        { createdAt: "asc" }
      ]
    });

    const rows = this.buildSectionRows(goals, contract);
    const sectionWeights = resolveSectionWeights(contract.sectionWeights, BOARD_SECTION_WEIGHTS);
    const sectionSummary = this.summariseSectionScores(rows, sectionWeights);
    const documentPayload = {
      header: {
        organisationName: "NVCCZ",
        documentTitle: `Board of Directors Performance Contract Review — ${contract.periodStart.getFullYear()}`,
        contractParties: ["Line Ministry / Shareholder", "Board Chairperson"],
        reviewPeriod: resolvePeriodLabel({
          periodLabel: contract.periodLabel,
          periodStart: contract.periodStart,
          periodEnd: contract.periodEnd
        })
      },
      sections: sectionSummary.sections,
      governanceAssessmentNarrative: null,
      signatureBlock: {
        boardChairperson: {
          name: contract.approver ? `${contract.approver.firstName} ${contract.approver.lastName}` : "Board Chairperson",
          signature: null,
          date: null
        },
        lineMinistryRepresentative: {
          name: null,
          signature: null,
          date: null
        }
      },
      status: "DRAFT"
    };

    let scorecardRecord = null;
    if (params.persist) {
      scorecardRecord = await this.upsertDraftScorecard({
        contractId: contract.id,
        scorecardType: "BOARD",
        status: "DRAFT",
        generatedById: params.viewer.id,
        periodLabel: resolvePeriodLabel({
          periodLabel: contract.periodLabel,
          periodStart: contract.periodStart,
          periodEnd: contract.periodEnd
        }),
        periodStart: contract.periodStart,
        periodEnd: contract.periodEnd,
        finalScore: decimalForStorage(sectionSummary.finalScore),
        sections: sectionSummary.sections,
        matrixRows: rows,
        signatureState: documentPayload.signatureBlock,
        documentPayload
      });
    }

    return {
      scorecardType: "BOARD",
      contract: {
        id: contract.id,
        title: contract.title
      },
      sections: sectionSummary.sections,
      scores: {
        finalScore: sectionSummary.finalScore
      },
      document: documentPayload,
      savedRecord: scorecardRecord
    };
  }

  static async getOrgBSCDashboard(params: {
    viewer: any;
    periodStart?: string;
    periodEnd?: string;
    periodLabel?: string;
    meta?: any;
  }) {
    await this.assertOrgDashboardAccess(params.viewer, params.meta);

    const period = this.buildPeriod(params);
    const contract = await this.resolveContract({
      contractType: "ORG_BSC",
      period
    });
    const activeStrategy = await prisma.performanceStrategy.findFirst({
      where: {
        status: "ACTIVE",
        archivedAt: null
      },
      orderBy: {
        periodStart: "desc"
      }
    });

    const pillars = resolveSectionWeights(contract?.sectionWeights || activeStrategy?.pillarWeights, DEFAULT_ORG_PILLAR_WEIGHTS);

    const companyGoals = await prisma.performanceGoal.findMany({
      where: {
        type: "company",
        OR: [
          contract ? { performanceContractId: contract.id } : undefined,
          this.buildPeriodWhere(period)
        ].filter(Boolean)
      },
      include: {
        subGoals: {
          select: {
            id: true,
            title: true,
            departmentName: true,
            currentValue: true,
            preciseCurrentValue: true,
            targetValue: true,
            preciseTargetValue: true,
            progressPercentage: true,
            activities: true,
            scorecardWeight: true,
            isReverseKpi: true
          }
        }
      },
      orderBy: [
        { scorecardPillar: "asc" },
        { displayOrder: "asc" },
        { createdAt: "asc" }
      ]
    });

    const groupedByPillar = Object.keys(pillars).map((pillarName) => {
      const pillarGoals = companyGoals.filter((goal) => (goal.scorecardPillar || "Financial") === pillarName);
      const fallbackWeight = pillarGoals.length > 0 ? 100 / pillarGoals.length : 0;
      const rows = redistributeWeights(
        pillarGoals.map((goal) => {
          const targetValue = toNumber(goal.preciseTargetValue ?? goal.targetValue, 0);
          const actualValue = toNumber(goal.preciseCurrentValue ?? goal.currentValue, 0);
          const directProgress = computeGoalProgress({
            actualValue,
            targetValue,
            isReverseKpi: goal.isReverseKpi,
            stretchScoringEnabled: contract?.stretchScoringEnabled
          });

          const childGoals = Array.isArray(goal.subGoals) ? goal.subGoals : [];
          const childFallbackWeight = childGoals.length > 0 ? 100 / childGoals.length : 0;
          const childContributions = childGoals.map((childGoal) => {
            const childActual = toNumber(childGoal.preciseCurrentValue ?? childGoal.currentValue, 0);
            const childTarget = toNumber(childGoal.preciseTargetValue ?? childGoal.targetValue, 0);
            const childProgress = computeGoalProgress({
              actualValue: childActual,
              targetValue: childTarget,
              isReverseKpi: childGoal.isReverseKpi,
              stretchScoringEnabled: contract?.stretchScoringEnabled
            });
            return {
              progressPct: childProgress.progressPct,
              contributionWeight: getContributionWeight(childGoal, childFallbackWeight)
            };
          });
          const totalContributionWeight = childContributions.reduce(
            (sum, item) => sum + item.contributionWeight,
            0
          );
          const weightedContributionTotal = childContributions.reduce(
            (sum, item) => sum + item.progressPct * item.contributionWeight,
            0
          );
          const rollupProgressPct = totalContributionWeight > 0
            ? round(weightedContributionTotal / totalContributionWeight, 2)
            : 0;

          const selectedProgressPct = Math.max(directProgress.progressPct, rollupProgressPct);
          const selectedActualValue = directProgress.progressPct >= rollupProgressPct
            ? actualValue
            : deriveActualFromProgress(targetValue, selectedProgressPct, goal.isReverseKpi);

          const status = resolveGoalEscalationStatus({
            preciseCurrentValue: String(selectedActualValue),
            currentValue: selectedActualValue,
            preciseTargetValue: goal.preciseTargetValue,
            targetValue: goal.targetValue,
            allowableVariance: goal.allowableVariance,
            isReverseKpi: goal.isReverseKpi,
            endDate: goal.endDate,
            stretchScoringEnabled: contract?.stretchScoringEnabled
          });

          return {
            id: goal.id,
            goalName: goal.title,
            progressPct: selectedProgressPct,
            status,
            weight: resolveWeight(goal.scorecardWeight, fallbackWeight),
            actualValue: selectedActualValue,
            targetValue,
            stretchTargetValue: parseStretchTargetValueFromActivities(goal.activities),
            isPendingApproval: Boolean(goal.isPendingApproval),
            departments: goal.subGoals,
            dataQualityAlert: shouldRaiseDataQualityAlert({
              currentValue: goal.preciseCurrentValue ?? goal.currentValue,
              lastApprovedValue: goal.lastApprovedValue,
              formulaType: goal.formulaType
            }) && goal.isPendingApproval
          };
        })
      );

      const activeRows = rows.filter((row) => !row.isPendingApproval);
      const pillarScore = activeRows.reduce(
        (sum, row) => sum + (row.effectiveWeight * row.progressPct) / 100,
        0
      );
      const averageStatus = activeRows.some((row) => String(row.status).includes("RED"))
        ? "RED"
        : activeRows.some((row) => String(row.status).includes("AMBER"))
          ? "AMBER"
          : "GREEN";

      return {
        pillarName,
        weight: pillars[pillarName],
        pillarScore: round(pillarScore, 2),
        status: averageStatus,
        goals: rows,
        trendVsPreviousPeriod: null,
        dataQualityAlerts: rows.filter((row) => row.dataQualityAlert).map((row) => ({
          goalId: row.id,
          goalName: row.goalName
        }))
      };
    });

    const orgBscScore = groupedByPillar.reduce(
      (sum, pillar) => sum + (pillar.weight * pillar.pillarScore) / 100,
      0
    );

    const canDrillToDepartment = isCEO(params.viewer) || isSysAdmin(params.viewer) || isMonitoringAndEvaluationLeader(params.viewer);
    const canDrillToIndividual = isCEO(params.viewer) || isHRLeader(params.viewer) || isSysAdmin(params.viewer);

    return {
      reviewPeriod: resolvePeriodLabel({
        periodLabel: contract?.periodLabel || params.periodLabel,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd
      }),
      visionStatement: contract?.visionStatement || activeStrategy?.visionStatement || null,
      annualStrategyDocumentUrl: contract?.strategyDocumentUrl || activeStrategy?.strategyDocumentUrl || null,
      overallScore: round(orgBscScore, 2),
      pillars: groupedByPillar.map((pillar) => ({
        ...pillar,
        goals: pillar.goals.map((goal) => ({
          id: goal.id,
          goalName: goal.goalName,
          targetValue: goal.targetValue,
          stretchTargetValue: goal.stretchTargetValue ?? null,
          progressPct: goal.isPendingApproval ? "Pending" : goal.progressPct,
          status: goal.status,
          departments: canDrillToDepartment ? goal.departments : undefined
        }))
      })),
      access: {
        drillDownToDepartment: canDrillToDepartment,
        drillDownToIndividual: canDrillToIndividual
      }
    };
  }

  static async finalizeScorecard(params: {
    viewer: any;
    scorecardId: string;
    meta?: any;
  }) {
    const scorecard = await prisma.performanceScorecard.findUnique({
      where: { id: params.scorecardId },
      include: {
        contract: true,
        subjectUser: {
          include: {
            role: true,
            employee: true
          }
        }
      }
    });

    if (!scorecard) {
      throw new Error("Scorecard not found");
    }

    if (scorecard.isLocked || isFinalOrArchived(scorecard.status)) {
      return scorecard;
    }

    if (scorecard.scorecardType === "EMPLOYEE") {
      await this.assertEmployeeAccess(params.viewer, scorecard.subjectUser, scorecard.subjectUser?.employee, "generate", params.meta);
    } else if (scorecard.scorecardType === "DEPARTMENT") {
      await this.assertDepartmentAccess(params.viewer, scorecard.departmentName, "generate", params.meta);
    } else if (scorecard.scorecardType === "CEO") {
      await this.assertCEOAccess(params.viewer, "generate", params.meta);
    } else if (scorecard.scorecardType === "BOARD") {
      await this.assertBoardAccess(params.viewer, params.meta);
    }

    const updated = await prisma.performanceScorecard.update({
      where: { id: params.scorecardId },
      data: {
        status: "FINAL",
        isLocked: true,
        documentLockedAt: new Date(),
        finalisedById: params.viewer.id,
        signatureState: {
          ...(scorecard.signatureState || {}),
          finalisedBy: params.viewer.id,
          finalisedAt: new Date().toISOString()
        }
      }
    });

    await AuditService.log({
      userId: params.viewer.id,
      action: "FINALIZE",
      entityType: "PerformanceScorecard",
      entityId: updated.id,
      newValues: {
        status: "FINAL",
        isLocked: true
      },
      ...getRequestMetadata(params.meta)
    });

    return updated;
  }
}
