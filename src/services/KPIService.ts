// @ts-nocheck
import { prisma } from "../utils/database";
import { inferKpiScorecardPillar } from "../utils/inferKpiScorecardPillar";
import { normalizeOrgBscScorecardPillar } from "./performanceScorecardSupport";
import { ScorecardPillarService } from "./ScorecardPillarService";

const KPI_ACCOUNT_TYPES = ["Revenue", "Expense", "Asset", "Liability", "Equity"];
const KPI_JOURNAL_TYPES = ["Debit", "Credit"];

export interface CreateKPIRequest {
  name: string;
  isReverseKpi: boolean;
  hasUnit: boolean;
  unitCategory: string;
  unit?: string | null;
  unitSymbol?: string | null;
  unitPosition?: string | null;
  code: string;
  description: string;
  catalogDepartmentName?: string | null;
  accountType: string | null;
  accountNumber?: string | null;
  journalEntryType: string | null;
  isFinancial: boolean;
  /** Canonical pillar name resolved from `scorecard_pillars.id` on controller layer. */
  scorecardPillar: string;
}

export interface UpdateKPIRequest {
  name?: string;
  isReverseKpi?: boolean;
  hasUnit?: boolean;
  unitCategory?: string;
  unit?: string;
  unitSymbol?: string;
  unitPosition?: string;
  isActive?: boolean;
  code?: string;
  description?: string;
  catalogDepartmentName?: string;
  accountType?: string | null;
  accountNumber?: string | null;
  journalEntryType?: string | null;
  isFinancial?: boolean;
  scorecardPillar?: string | null;
}

export class KPIService {
  /**
   * Resolves `departments.id` from an exact `departments.name` match (must match catalog / HR label).
   */
  static async resolveDepartmentIdByCatalogDepartmentName(
    catalogDepartmentName: string
  ): Promise<string | null> {
    const n = String(catalogDepartmentName).trim();
    if (!n) return null;
    const dept = await prisma.department.findUnique({
      where: { name: n }
    });
    return dept?.id ?? null;
  }

  /**
   * KPIs default inactive until linked to a goal; keep `isActive` aligned with goal links.
   */
  static async syncKpiActiveFromLinkedGoals(kpiId: string | null | undefined): Promise<void> {
    if (!kpiId) return;
    const count = await prisma.performanceGoal.count({ where: { kpiId } });
    await prisma.kPI.update({
      where: { id: kpiId },
      data: { isActive: count > 0 }
    });
  }

  static assertFinancialFields(
    isFinancial: boolean,
    accountType: string | null | undefined,
    journalEntryType: string | null | undefined,
    accountNumber: string | null | undefined
  ) {
    if (!isFinancial) return;
    const at = String(accountType ?? "").trim();
    const jt = String(journalEntryType ?? "").trim();
    const an = String(accountNumber ?? "").trim();
    if (!at || !KPI_ACCOUNT_TYPES.includes(at)) {
      throw new Error(
        `When isFinancial is true, accountType is required and must be one of: ${KPI_ACCOUNT_TYPES.join(", ")}`
      );
    }
    if (!jt || !KPI_JOURNAL_TYPES.includes(jt)) {
      throw new Error(
        `When isFinancial is true, journalEntryType is required and must be one of: ${KPI_JOURNAL_TYPES.join(", ")}`
      );
    }
    if (!an) {
      throw new Error("When isFinancial is true, accountNumber is required (chart / GL identifier).");
    }
  }

  /**
   * Sum goal targets/achieved the same way as task-linked goal updates:
   * prefer monetary* fields, else fall back to targetValue / currentValue so KPI % moves when tasks update goals.
   */
  static aggregateGoalsForKpiProgress(goals: any[]) {
    let totalMonetaryTarget = 0;
    let totalMonetaryAchieved = 0;
    let totalPercentTarget = 0;
    let totalPercentAchieved = 0;

    for (const goal of goals) {
      const useMonetaryPair =
        goal.monetaryValue != null && String(goal.monetaryValue) !== "";

      const monetaryTarget = useMonetaryPair
        ? parseFloat(String(goal.monetaryValue))
        : goal.targetValue != null && String(goal.targetValue) !== ""
          ? parseFloat(String(goal.targetValue))
          : 0;

      const monetaryAchieved = useMonetaryPair
        ? parseFloat(String(goal.monetaryValueAchieved ?? 0))
        : goal.currentValue != null && String(goal.currentValue) !== ""
          ? parseFloat(String(goal.currentValue))
          : 0;

      totalMonetaryTarget += monetaryTarget;
      totalMonetaryAchieved += monetaryAchieved;

      if (goal.percentValue != null && String(goal.percentValue) !== "") {
        totalPercentTarget += parseFloat(String(goal.percentValue));
      }
      if (goal.percentValueAchieved != null && String(goal.percentValueAchieved) !== "") {
        totalPercentAchieved += parseFloat(String(goal.percentValueAchieved));
      }
    }

    return {
      totalMonetaryTarget,
      totalMonetaryAchieved,
      totalPercentTarget,
      totalPercentAchieved
    };
  }

  static async createKPI(request: CreateKPIRequest) {
    KPIService.assertFinancialFields(
      request.isFinancial,
      request.accountType,
      request.journalEntryType,
      request.accountNumber
    );

    const existingKPI = await prisma.kPI.findFirst({
      where: { name: request.name }
    });

    if (existingKPI) {
      throw new Error("KPI with this name already exists");
    }

    const codeTrim = String(request.code).trim();
    const codeTaken = await prisma.kPI.findFirst({
      where: { code: codeTrim }
    });
    if (codeTaken) {
      throw new Error("KPI code already exists");
    }

    const fromRequest =
      request.scorecardPillar && String(request.scorecardPillar).trim()
        ? normalizeOrgBscScorecardPillar(request.scorecardPillar)
        : null;
    if (!fromRequest) {
      throw new Error(
        "scorecardPillar is required and must be one of: Financial, Customer & Market, Internal Operations, Learning, Growth & HR (or FINANCIAL, CUSTOMER, INTERNAL_OPS, LEARNING_GROWTH)."
      );
    }
    const resolvedPillar = fromRequest;

    await ScorecardPillarService.assertCanonicalExists(resolvedPillar);

    const kpi = await prisma.kPI.create({
      data: {
        name: request.name,
        isReverseKpi: request.isReverseKpi,
        hasUnit: request.hasUnit,
        unitCategory: request.unitCategory,
        unit: request.hasUnit ? request.unit ?? null : null,
        unitSymbol: request.hasUnit ? request.unitSymbol ?? null : null,
        unitPosition:
          request.hasUnit && request.unitPosition != null && String(request.unitPosition).trim() !== ""
            ? String(request.unitPosition).trim()
            : request.hasUnit
              ? "suffix"
              : null,
        isActive: false,
        code: codeTrim,
        catalogDescription: request.description,
        catalogDepartmentName:
          request.catalogDepartmentName != null && String(request.catalogDepartmentName).trim() !== ""
            ? String(request.catalogDepartmentName).trim()
            : null,
        accountType: request.accountType,
        accountNumber: request.accountNumber ?? null,
        journalEntryType: request.journalEntryType,
        isFinancial: request.isFinancial,
        scorecardPillar: resolvedPillar
      }
    });

    return kpi;
  }

  static async getAllKPIs(filters: any = {}) {
    const where: any = {};

    if (filters.catalogDepartmentName) {
      const q = String(filters.catalogDepartmentName).trim();
      if (q) {
        where.catalogDepartmentName = { contains: q, mode: "insensitive" };
      }
    }

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (filters.hasUnit !== undefined) {
      where.hasUnit = filters.hasUnit;
    }

    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search, mode: "insensitive" } },
        { unitCategory: { contains: filters.search, mode: "insensitive" } },
        { unit: { contains: filters.search, mode: "insensitive" } },
        { code: { contains: filters.search } },
        { catalogDescription: { contains: filters.search } },
        { catalogDepartmentName: { contains: filters.search, mode: "insensitive" } }
      ];
    }

    if (filters.scorecardPillar) {
      const p = String(filters.scorecardPillar).trim();
      if (p) {
        where.scorecardPillar = p;
      }
    }

    const kpis = await prisma.kPI.findMany({
      where,
      include: {
        performanceGoals: {
          select: {
            id: true,
            title: true,
            status: true,
            stage: true
          }
        },
        _count: {
          select: {
            performanceGoals: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return kpis;
  }

  static async getKPIById(id: string) {
    const kpi = await prisma.kPI.findUnique({
      where: { id },
      include: {
        performanceGoals: {
          include: {
            department: {
              select: {
                id: true,
                name: true
              }
            },
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
        _count: {
          select: {
            performanceGoals: true
          }
        }
      }
    });

    if (!kpi) {
      throw new Error("KPI not found");
    }

    return kpi;
  }

  static async updateKPI(id: string, request: UpdateKPIRequest) {
    const existingKPI = await prisma.kPI.findUnique({
      where: { id }
    });

    if (!existingKPI) {
      throw new Error("KPI not found");
    }

    const nextIsFinancial =
      request.isFinancial !== undefined ? request.isFinancial : existingKPI.isFinancial;
    const nextAccountType =
      request.accountType !== undefined ? request.accountType : existingKPI.accountType;
    const nextJournal =
      request.journalEntryType !== undefined ? request.journalEntryType : existingKPI.journalEntryType;
    const nextAccountNumber =
      request.accountNumber !== undefined ? request.accountNumber : existingKPI.accountNumber;

    KPIService.assertFinancialFields(nextIsFinancial, nextAccountType, nextJournal, nextAccountNumber);

    const effectiveName = request.name !== undefined ? request.name : existingKPI.name;
    if (request.name && request.name !== existingKPI.name) {
      const nameConflict = await prisma.kPI.findFirst({
        where: {
          name: effectiveName,
          id: { not: id }
        }
      });

      if (nameConflict) {
        throw new Error("KPI with this name already exists");
      }
    }

    if (request.code !== undefined && request.code !== existingKPI.code) {
      const nextCode = String(request.code).trim();
      const codeTaken = await prisma.kPI.findFirst({
        where: { code: nextCode, id: { not: id } }
      });
      if (codeTaken) {
        throw new Error("KPI code already exists");
      }
    }

    if (request.scorecardPillar !== undefined && request.scorecardPillar != null) {
      const normalized =
        normalizeOrgBscScorecardPillar(String(request.scorecardPillar)) ||
        String(request.scorecardPillar).trim() ||
        null;
      if (normalized) {
        await ScorecardPillarService.assertCanonicalExists(normalized);
      }
    }

    const updatedKPI = await prisma.kPI.update({
      where: { id },
      data: {
        ...(request.name && { name: request.name }),
        ...(request.isReverseKpi !== undefined && { isReverseKpi: request.isReverseKpi }),
        ...(request.hasUnit !== undefined && { hasUnit: request.hasUnit }),
        ...(request.unitCategory !== undefined && { unitCategory: request.unitCategory }),
        ...(request.unit !== undefined && { unit: request.unit }),
        ...(request.unitSymbol !== undefined && { unitSymbol: request.unitSymbol }),
        ...(request.unitPosition !== undefined && { unitPosition: request.unitPosition }),
        ...(request.isActive !== undefined && { isActive: request.isActive }),
        ...(request.code !== undefined && { code: String(request.code).trim() || null }),
        ...(request.description !== undefined && { catalogDescription: request.description }),
        ...(request.catalogDepartmentName !== undefined && {
          catalogDepartmentName: request.catalogDepartmentName
        }),
        ...(request.accountType !== undefined && { accountType: request.accountType }),
        ...(request.accountNumber !== undefined && { accountNumber: request.accountNumber }),
        ...(request.journalEntryType !== undefined && { journalEntryType: request.journalEntryType }),
        ...(request.isFinancial !== undefined && { isFinancial: request.isFinancial }),
        ...(request.scorecardPillar !== undefined && {
          scorecardPillar:
            request.scorecardPillar == null
              ? null
              : normalizeOrgBscScorecardPillar(String(request.scorecardPillar)) ||
                String(request.scorecardPillar).trim() ||
                null
        })
      },
      include: {
        performanceGoals: {
          select: {
            id: true,
            title: true,
            status: true,
            stage: true
          }
        },
        _count: {
          select: {
            performanceGoals: true
          }
        }
      }
    });

    return updatedKPI;
  }

  static async deleteKPI(id: string) {
    const existingKPI = await prisma.kPI.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            performanceGoals: true
          }
        }
      }
    });

    if (!existingKPI) {
      throw new Error("KPI not found");
    }

    if (existingKPI._count.performanceGoals > 0) {
      throw new Error("Cannot delete KPI with associated performance goals");
    }

    await prisma.kPI.delete({
      where: { id }
    });

    return { message: "KPI deleted successfully" };
  }

  static async getKPIStatistics() {
    const [totalKPIs, activeKPIs, kpisWithUnits, kpisFinancial, unitCatRows] = await Promise.all([
      prisma.kPI.count(),
      prisma.kPI.count({ where: { isActive: true } }),
      prisma.kPI.count({ where: { hasUnit: true } }),
      prisma.kPI.count({ where: { isFinancial: true } }),
      prisma.kPI.findMany({ select: { unitCategory: true } })
    ]);

    let metricKPIs = 0;
    let percentageKPIs = 0;
    for (const row of unitCatRows) {
      const c = String(row.unitCategory ?? "").toLowerCase();
      if (c.includes("percent")) percentageKPIs += 1;
      else metricKPIs += 1;
    }

    const kpisByCatalogDepartment = await prisma.kPI.groupBy({
      by: ["catalogDepartmentName"],
      _count: {
        id: true
      },
      where: {
        catalogDepartmentName: { not: null }
      }
    });

    const kpisByUnitCategory = await prisma.kPI.groupBy({
      by: ["unitCategory"],
      _count: {
        id: true
      }
    });

    const kpisByScorecardPillar = await prisma.kPI.groupBy({
      by: ["scorecardPillar"],
      _count: {
        id: true
      }
    });

    return {
      totalKPIs,
      activeKPIs,
      kpisWithUnits,
      kpisFinancial,
      metricKPIs,
      percentageKPIs,
      kpisByCatalogDepartment,
      kpisByUnitCategory,
      kpisByScorecardPillar
    };
  }

  static async getKPITracking(filters: any = {}) {
    const where: any = {};

    if (filters.kpiId) {
      where.id = filters.kpiId;
    }
    if (filters.catalogDepartmentName) {
      const d = String(filters.catalogDepartmentName).trim();
      if (d) {
        where.catalogDepartmentName = { equals: d, mode: "insensitive" };
      }
    }
    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }
    if (filters.scorecardPillar) {
      const p = String(filters.scorecardPillar).trim();
      if (p) {
        where.scorecardPillar = p;
      }
    }

    const kpis = await prisma.kPI.findMany({
      where,
      include: {
        performanceGoals: {
          include: {
            department: {
              select: {
                id: true,
                name: true
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
            _count: {
              select: {
                tasks: true,
                activityLogs: true
              }
            }
          }
        },
        activityLogs: {
          select: {
            id: true,
            activityType: true,
            title: true,
            description: true,
            monetaryValueAchieved: true,
            percentValueAchieved: true,
            createdAt: true
          },
          orderBy: {
            createdAt: "desc"
          },
          take: 10
        },
        _count: {
          select: {
            performanceGoals: true,
            activityLogs: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    const kpisWithTracking = kpis.map((kpi) => {
      const totalGoals = kpi.performanceGoals.length;
      const activeGoals = kpi.performanceGoals.filter((goal) => goal.status === "active").length;
      const completedGoals = kpi.performanceGoals.filter((goal) => goal.status === "completed").length;

      const {
        totalMonetaryTarget,
        totalMonetaryAchieved,
        totalPercentTarget,
        totalPercentAchieved
      } = KPIService.aggregateGoalsForKpiProgress(kpi.performanceGoals);

      const monetaryProgress =
        totalMonetaryTarget > 0 ? (totalMonetaryAchieved / totalMonetaryTarget) * 100 : 0;
      const percentProgress =
        totalPercentTarget > 0 ? (totalPercentAchieved / totalPercentTarget) * 100 : 0;

      const recentActivities = kpi.activityLogs.slice(0, 5);
      const totalActivities = kpi._count.activityLogs;

      const goalCompletionRate = totalGoals > 0 ? (completedGoals / totalGoals) * 100 : 0;

      const { catalogDepartmentName: _catalogDepartmentName, catalogDescription, ...kpiForResponse } = kpi as any;

      return {
        ...kpiForResponse,
        description: catalogDescription ?? null,
        tracking: {
          totalGoals,
          activeGoals,
          completedGoals,
          goalCompletionRate: Math.round(goalCompletionRate * 100) / 100,
          totalMonetaryTarget,
          totalPercentTarget,
          totalMonetaryAchieved,
          totalPercentAchieved,
          monetaryProgress: Math.round(monetaryProgress * 100) / 100,
          percentProgress: Math.round(percentProgress * 100) / 100,
          totalActivities,
          recentActivities,
          isOnTrack: monetaryProgress >= 80 || percentProgress >= 80,
          needsAttention: monetaryProgress < 50 || percentProgress < 50
        }
      };
    });

    const totalKPIs = kpisWithTracking.length;
    const activeKPIsTracked = kpisWithTracking.filter((kpi) => kpi.isActive).length;
    const onTrackKPIs = kpisWithTracking.filter((kpi) => kpi.tracking.isOnTrack).length;
    const needsAttentionKPIs = kpisWithTracking.filter((kpi) => kpi.tracking.needsAttention).length;

    const totalGoals = kpisWithTracking.reduce((sum, kpi) => sum + kpi.tracking.totalGoals, 0);
    const totalActiveGoals = kpisWithTracking.reduce((sum, kpi) => sum + kpi.tracking.activeGoals, 0);
    const totalCompletedGoals = kpisWithTracking.reduce(
      (sum, kpi) => sum + kpi.tracking.completedGoals,
      0
    );

    const overallProgress =
      totalGoals > 0
        ? kpisWithTracking.reduce(
            (sum, kpi) => sum + kpi.tracking.monetaryProgress + kpi.tracking.percentProgress,
            0
          ) /
          (totalKPIs * 2)
        : 0;

    return {
      kpis: kpisWithTracking,
      summary: {
        totalKPIs,
        activeKPIs: activeKPIsTracked,
        onTrackKPIs,
        needsAttentionKPIs,
        totalGoals,
        totalActiveGoals,
        totalCompletedGoals,
        overallProgress: Math.round(overallProgress * 100) / 100,
        systemHealth:
          overallProgress >= 70 ? "healthy" : overallProgress >= 50 ? "warning" : "critical"
      },
      filters: {
        applied: filters,
        available: {
          unitCategories: [
            ...new Set(
              (
                await prisma.kPI.findMany({
                  select: { unitCategory: true },
                  where: { unitCategory: { not: null } },
                  distinct: ["unitCategory"]
                })
              )
                .map((r) => r.unitCategory)
                .filter(Boolean)
            )
          ]
        }
      }
    };
  }

  static async getKPIAnalyticsSummary(filters: any = {}, period: string = "month") {
    const where: any = {};

    if (filters.catalogDepartmentName) {
      const d = String(filters.catalogDepartmentName).trim();
      if (d) {
        where.catalogDepartmentName = { equals: d, mode: "insensitive" };
      }
    }
    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }
    if (filters.scorecardPillar) {
      const p = String(filters.scorecardPillar).trim();
      if (p) {
        where.scorecardPillar = p;
      }
    }

    const kpis = await prisma.kPI.findMany({
      where,
      include: {
        performanceGoals: {
          include: {
            activityLogs: true
          }
        },
        activityLogs: {
          orderBy: { createdAt: "desc" },
          take: 10
        },
        _count: {
          select: {
            performanceGoals: true,
            activityLogs: true
          }
        }
      }
    });

    const totalKPIs = kpis.length;
    const activeKPIs = kpis.filter((kpi) => kpi.isActive).length;

    const kpisWithProgress = kpis.map((kpi) => {
      const totalGoals = kpi.performanceGoals.length;
      const completedGoals = kpi.performanceGoals.filter((goal) => goal.status === "completed").length;

      const {
        totalMonetaryTarget,
        totalMonetaryAchieved,
        totalPercentTarget,
        totalPercentAchieved
      } = KPIService.aggregateGoalsForKpiProgress(kpi.performanceGoals);

      const monetaryProgress =
        totalMonetaryTarget > 0 ? (totalMonetaryAchieved / totalMonetaryTarget) * 100 : 0;
      const percentProgress =
        totalPercentTarget > 0 ? (totalPercentAchieved / totalPercentTarget) * 100 : 0;

      const overallProgress = Math.max(monetaryProgress, percentProgress);

      return {
        id: kpi.id,
        name: kpi.name,
        unitCategory: kpi.unitCategory,
        scorecardPillar: kpi.scorecardPillar,
        progress: overallProgress,
        isOnTrack: overallProgress >= 80,
        needsAttention: overallProgress < 50
      };
    });

    const completedKPIs = kpisWithProgress.filter((kpi) => kpi.progress >= 100).length;
    const onTrackKPIs = kpisWithProgress.filter((kpi) => kpi.isOnTrack).length;

    const averageProgress =
      kpisWithProgress.length > 0
        ? kpisWithProgress.reduce((sum, kpi) => sum + kpi.progress, 0) / kpisWithProgress.length
        : 0;

    const onTrackPercentage = totalKPIs > 0 ? (onTrackKPIs / totalKPIs) * 100 : 0;

    const topPerformingKPIs = kpisWithProgress
      .filter((kpi) => kpi.progress > 0)
      .sort((a, b) => b.progress - a.progress)
      .slice(0, 5)
      .map((kpi) => ({
        id: kpi.id,
        name: kpi.name,
        scorecardPillar: kpi.scorecardPillar,
        progress: kpi.progress
      }));

    const needsAttentionKPIsList = kpisWithProgress
      .filter((kpi) => kpi.needsAttention)
      .sort((a, b) => a.progress - b.progress)
      .slice(0, 5)
      .map((kpi) => ({
        id: kpi.id,
        name: kpi.name,
        scorecardPillar: kpi.scorecardPillar,
        progress: kpi.progress
      }));

    const trends = {
      period,
      improvementRate: 0,
      declineRate: 0,
      stableRate: 100
    };

    return {
      summary: {
        totalKPIs,
        activeKPIs,
        completedKPIs,
        averageProgress: Math.round(averageProgress * 100) / 100,
        onTrackPercentage: Math.round(onTrackPercentage * 100) / 100
      },
      performanceMetrics: {
        topPerformingKPIs,
        needsAttentionKPIs: needsAttentionKPIsList
      },
      trends
    };
  }
}
