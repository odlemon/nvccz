// @ts-nocheck

import axios from "axios";
import * as XLSX from "xlsx";
import { prisma } from "../utils/database";
import AuditService from "./AuditService";
import {
  asNumber,
  buildExponentialBackoffSchedule,
  extractValueFromPayload,
  isHighPrecisionPerformanceSync,
  isPayrollTurnoverCompatibleGoal,
  isPortfolioAumCompatibleGoal,
  isPortfolioIrrCompatibleGoal,
  isPortfolioTotalRevenueCompatibleGoal,
  normaliseSyncedDecimal,
  syncDecimalPlacesForIntegrationBatch,
  pillarSlugForScorecardPillar,
  shouldRaiseDataQualityAlert
} from "./performanceBackendSupport";
import {
  isCEO,
  isDepartmentManager,
  isHRLeader,
  resolveGoalEscalationStatus,
  resolveStoredGoalActual
} from "./performanceScorecardSupport";
import { DataIntegrationService } from "./DataIntegrationService";
import { PortfolioDashboardService } from "./PortfolioDashboardService";
import {
  legacyProgressFieldsForGoal,
  PerformanceGoalService
} from "./PerformanceGoalService";
import { computeAchievementPercent, isTargetMet } from "./performanceGoalRollupUtils";

type AuditMeta = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

function metaToAudit(meta?: AuditMeta) {
  return {
    ipAddress: meta?.ipAddress || undefined,
    userAgent: meta?.userAgent || undefined
  };
}

function buildEndpointUrl(endpointPath: string) {
  const baseUrl = process.env.PERFORMANCE_INTERNAL_BASE_URL || process.env.INTERNAL_API_BASE_URL || "";
  if (/^https?:\/\//i.test(endpointPath)) {
    return endpointPath;
  }

  return `${baseUrl.replace(/\/$/, "")}/${String(endpointPath || "").replace(/^\//, "")}`;
}

async function defaultSleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export class PerformanceIntegrationService {
  /** All goals to update: one when `goalId` is set; every goal linked to `kpiId` when syncing by KPI (C.08). */
  private static async loadGoalsForSync(goalId?: string, kpiId?: string) {
    const goalInclude = {
      assignedTo: {
        include: {
          role: true
        }
      },
      kpi: {
        select: {
          id: true,
          name: true
        }
      }
    };

    if (goalId) {
      const goal = await prisma.performanceGoal.findUnique({
        where: { id: goalId },
        include: goalInclude
      });
      if (!goal) {
        throw new Error("No performance goal was found for the requested sync.");
      }
      return [goal];
    }

    if (!kpiId) {
      throw new Error("A goalId or kpiId is required.");
    }

    const goals = await prisma.performanceGoal.findMany({
      where: { kpiId },
      include: goalInclude,
      orderBy: { id: "asc" }
    });
    if (!goals.length) {
      throw new Error("No performance goals were found for the requested KPI.");
    }
    return goals;
  }

  /**
   * Shared path after a numeric value is known (HTTP fetch or in-process PE IRR).
   */
  private static async finalizeManualSyncFromExtracted(options: {
    goals: any[];
    primaryGoal: any;
    syncJob: { id: string };
    /** Value after any divideBy; will be normalised for storage. */
    extracted: any;
    effectiveFieldPath: string | undefined;
    requestFieldPath?: string | null;
    rawPayload: any;
    attempt: number;
    actor: any;
    meta?: AuditMeta;
    kpiId?: string | null;
  }): Promise<{ syncJob: any; goal: any; goals: any[] }> {
    const {
      goals,
      primaryGoal,
      syncJob,
      extracted,
      effectiveFieldPath,
      requestFieldPath,
      rawPayload,
      attempt,
      actor,
      meta,
      kpiId
    } = options;

    const anyHighPrecision = goals.some((g) =>
      isHighPrecisionPerformanceSync(g, effectiveFieldPath)
    );
    const syncDecimalPlaces = syncDecimalPlacesForIntegrationBatch(goals, effectiveFieldPath);
    const normalizedValue = normaliseSyncedDecimal(extracted, syncDecimalPlaces);
    const numericValue = Number(normalizedValue);

    const updatedGoals: any[] = [];
    let anyApprovalRequired = false;

    for (const goal of goals) {
      const goalHighPrecision = isHighPrecisionPerformanceSync(goal, effectiveFieldPath);
      const approvalRequired = Boolean(goal.requiresManagerApproval) || goalHighPrecision;
      if (approvalRequired) {
        anyApprovalRequired = true;
      }

      const priorCanonical = resolveStoredGoalActual(goal).value;
      const allowZeroOverwrite =
        isHighPrecisionPerformanceSync(goal, effectiveFieldPath) || isPortfolioIrrCompatibleGoal(goal);
      if (numericValue === 0 && priorCanonical !== 0 && !allowZeroOverwrite) {
        updatedGoals.push(goal);
        await AuditService.log({
          userId: actor.id,
          action: "SYNC",
          entityType: "PerformanceGoalSync",
          entityId: goal.id,
          oldValues: {
            currentValue: goal.currentValue,
            preciseCurrentValue: goal.preciseCurrentValue
          },
          newValues: {
            skippedZeroOverwrite: true,
            priorCanonical,
            syncJobId: syncJob.id,
            effectiveFieldPath
          },
          ...metaToAudit(meta)
        });
        continue;
      }

      const goalUpdateData: any = {
        preciseCurrentValue: normalizedValue,
        lastSyncedValue: normalizedValue,
        lastSyncedAt: new Date(),
        lastSyncJobId: syncJob.id,
        syncConfig: {
          ...(goal.syncConfig || {}),
          fieldPath: requestFieldPath || (goal.syncConfig as any)?.fieldPath || null,
          lastRawPayloadSummary: {
            receivedAt: new Date().toISOString()
          }
        }
      };

      if (approvalRequired) {
        goalUpdateData.isPendingApproval = true;
        goalUpdateData.pendingActualValue = normalizedValue;
      } else {
        goalUpdateData.currentValue = numericValue;
        goalUpdateData.isPendingApproval = false;
        goalUpdateData.pendingActualValue = null;
        goalUpdateData.lastApprovedValue = normalizedValue;
      }

      const updatedGoal = await prisma.performanceGoal.update({
        where: { id: goal.id },
        data: goalUpdateData
      });
      updatedGoals.push(updatedGoal);

      await PerformanceGoalService.refreshPerformanceRiskZoneOnGoal(goal.id).catch(() => undefined);

      const parentId = goal.parentGoalId;
      if (parentId) {
        try {
          await PerformanceGoalService.updateParentGoalProgress(parentId);
        } catch (parentErr: any) {
          console.error(
            `[PerformanceSync] parent roll-up failed after KPI sync for goal ${goal.id}:`,
            parentErr
          );
        }
      }

      await AuditService.log({
        userId: actor.id,
        action: "SYNC",
        entityType: "PerformanceGoalSync",
        entityId: goal.id,
        oldValues: {
          currentValue: goal.currentValue,
          preciseCurrentValue: goal.preciseCurrentValue,
          isPendingApproval: goal.isPendingApproval
        },
        newValues: {
          currentValue: updatedGoal.currentValue,
          preciseCurrentValue: updatedGoal.preciseCurrentValue,
          pendingActualValue: updatedGoal.pendingActualValue,
          isPendingApproval: updatedGoal.isPendingApproval,
          syncJobId: syncJob.id,
          multiGoalKpiSync: goals.length > 1
        },
        ...metaToAudit(meta)
      });
    }

    const nextApprovalStatus = anyApprovalRequired ? "PENDING_APPROVAL" : "NOT_REQUIRED";

    const completedJob = await prisma.performanceSyncJob.update({
      where: { id: syncJob.id },
      data: {
        status: anyApprovalRequired ? "PENDING_APPROVAL" : "COMPLETED",
        approvalStatus: nextApprovalStatus,
        attempts: attempt,
        responsePayload: rawPayload,
        finishedAt: new Date(),
        payloadSummary: {
          goalIds: goals.map((g) => g.id),
          multiGoalCount: goals.length,
          extractedValue: normalizedValue,
          alert: shouldRaiseDataQualityAlert({
            currentValue: normalizedValue,
            lastApprovedValue: primaryGoal.lastApprovedValue,
            formulaType: anyHighPrecision ? primaryGoal.formulaType || "IRR" : primaryGoal.formulaType
          })
        }
      }
    });

    const kpiIdForRecalc = primaryGoal.kpiId || kpiId;
    if (kpiIdForRecalc) {
      await PerformanceGoalService.recalculateKPIProgress(kpiIdForRecalc).catch((kpiErr: Error) =>
        console.error(`[PerformanceSync] KPI recalc failed for ${kpiIdForRecalc}:`, kpiErr)
      );
    }

    return {
      syncJob: completedJob,
      goal: updatedGoals[0],
      goals: updatedGoals
    };
  }

  /**
   * POST-friendly sync: reads portfolio IRR from the PE/accounting data path in-process (no HTTP, no base URL).
   * Updates the same goal fields and sync jobs as manual sync.
   */
  static async runPePortfolioIrrSync(params: {
    goalId?: string;
    kpiId?: string;
    fundId?: string;
    actor: any;
    meta?: AuditMeta;
  }) {
    const goals = await this.loadGoalsForSync(params.goalId, params.kpiId);
    const primaryGoal = goals[0];

    for (const g of goals) {
      if (!isPortfolioIrrCompatibleGoal(g)) {
        const kpiName = g.kpi?.name || "(no KPI)";
        throw new Error(
          `Portfolio IRR sync is only allowed when the goal’s KPI or formulaType indicates IRR. ` +
            `Goal "${g.title}" (${g.id}) is linked to KPI "${kpiName}".`
        );
      }
    }

    const syncJob = await prisma.performanceSyncJob.create({
      data: {
        goalId: primaryGoal.id,
        kpiId: primaryGoal.kpiId || params.kpiId || null,
        jobType: "MANUAL_SYNC",
        status: "RUNNING",
        targetEndpoint: "in-process://pe-portfolio-irr",
        payloadSummary: {
          goalId: primaryGoal.id,
          goalIds: goals.map((g) => g.id),
          multiGoalCount: goals.length,
          kpiId: primaryGoal.kpiId || params.kpiId || null,
          fieldPath: "data.metrics.irr",
          syncMode: "PE_PORTFOLIO_IRR",
          fundId: params.fundId ?? null
        },
        createdById: params.actor.id,
        startedAt: new Date()
      }
    });

    try {
      const { irr, fundCount, precisionDigits } =
        await PortfolioDashboardService.getWeightedFundGrossIrrForPeSync({
          fundId: params.fundId
        });

      const rawPayload = {
        success: true,
        source: "in_process_pe_portfolio_irr",
        data: {
          metrics: {
            irr,
            fundGrossIRR: irr,
            fundCount,
            precisionDigits
          }
        },
        generatedAt: new Date().toISOString()
      };

      const effectiveFieldPath = "data.metrics.irr";
      const extracted = extractValueFromPayload(rawPayload, effectiveFieldPath);

      return await this.finalizeManualSyncFromExtracted({
        goals,
        primaryGoal,
        syncJob,
        extracted,
        effectiveFieldPath,
        requestFieldPath: effectiveFieldPath,
        rawPayload,
        attempt: 1,
        actor: params.actor,
        meta: params.meta,
        kpiId: params.kpiId ?? null
      });
    } catch (error: any) {
      await prisma.performanceSyncJob.update({
        where: { id: syncJob.id },
        data: {
          status: "FAILED",
          errorCode: "PE_IRR_SYNC",
          errorMessage: error?.message || "Portfolio IRR sync failed",
          attempts: 1,
          finishedAt: new Date()
        }
      });
      throw error;
    }
  }

  /**
   * In-process AUM: sums `Fund.totalAmount` for OPEN/CLOSED funds (same as CEO dashboard / accounting portfolio)
   * and updates performance goals — no internal HTTP hop.
   */
  static async runPePortfolioAumSync(params: {
    goalId?: string;
    kpiId?: string;
    /** When set, sync value is that fund's `totalAmount` only (fund-scoped AUM KPI). */
    fundId?: string;
    actor: any;
    meta?: AuditMeta;
  }) {
    const goals = await this.loadGoalsForSync(params.goalId, params.kpiId);
    const primaryGoal = goals[0];

    for (const g of goals) {
      if (!isPortfolioAumCompatibleGoal(g)) {
        const kpiName = g.kpi?.name || "(no KPI)";
        throw new Error(
          `Portfolio AUM sync is only allowed when the goal's KPI or formulaType indicates AUM. ` +
            `Goal "${g.title}" (${g.id}) is linked to KPI "${kpiName}".`
        );
      }
    }

    const syncJob = await prisma.performanceSyncJob.create({
      data: {
        goalId: primaryGoal.id,
        kpiId: primaryGoal.kpiId || params.kpiId || null,
        jobType: "MANUAL_SYNC",
        status: "RUNNING",
        targetEndpoint: "in-process://pe-portfolio-aum",
        payloadSummary: {
          goalId: primaryGoal.id,
          goalIds: goals.map((g) => g.id),
          multiGoalCount: goals.length,
          kpiId: primaryGoal.kpiId || params.kpiId || null,
          fieldPath: "data.metrics.totalAum",
          syncMode: "PE_PORTFOLIO_AUM",
          fundId: params.fundId ?? null
        },
        createdById: params.actor.id,
        startedAt: new Date()
      }
    });

    try {
      let totalAumNumber: number;
      let fundCount: number;
      let mode: "aggregate" | "single_fund";

      if (params.fundId) {
        const fund = await prisma.fund.findUnique({
          where: { id: params.fundId }
        });
        if (!fund) {
          throw new Error(`Fund not found: ${params.fundId}`);
        }
        totalAumNumber = asNumber(fund.totalAmount, 0);
        fundCount = 1;
        mode = "single_fund";
      } else {
        const aum = await DataIntegrationService.calculateAUM();
        totalAumNumber = aum.totalAUM.toNumber();
        fundCount = aum.totalFunds;
        mode = "aggregate";
      }

      const rawPayload = {
        success: true,
        source: "in_process_pe_portfolio_aum",
        data: {
          metrics: {
            totalAum: totalAumNumber,
            fundCount,
            mode
          }
        },
        generatedAt: new Date().toISOString()
      };

      const effectiveFieldPath = "data.metrics.totalAum";
      const extracted = extractValueFromPayload(rawPayload, effectiveFieldPath);

      return await this.finalizeManualSyncFromExtracted({
        goals,
        primaryGoal,
        syncJob,
        extracted,
        effectiveFieldPath,
        requestFieldPath: effectiveFieldPath,
        rawPayload,
        attempt: 1,
        actor: params.actor,
        meta: params.meta,
        kpiId: params.kpiId ?? null
      });
    } catch (error: any) {
      await prisma.performanceSyncJob.update({
        where: { id: syncJob.id },
        data: {
          status: "FAILED",
          errorCode: "PE_AUM_SYNC",
          errorMessage: error?.message || "Portfolio AUM sync failed",
          attempts: 1,
          finishedAt: new Date()
        }
      });
      throw error;
    }
  }

  /**
   * In-process sum of portfolio companies' `financialKpis.latestKpiValues.TOTAL_REVENUE` (PE reporting feed).
   */
  static async runPePortfolioTotalRevenueSync(params: {
    goalId?: string;
    kpiId?: string;
    fundId?: string;
    actor: any;
    meta?: AuditMeta;
  }) {
    const goals = await this.loadGoalsForSync(params.goalId, params.kpiId);
    const primaryGoal = goals[0];

    for (const g of goals) {
      if (!isPortfolioTotalRevenueCompatibleGoal(g)) {
        const kpiName = g.kpi?.name || "(no KPI)";
        throw new Error(
          `Portfolio total revenue sync is only allowed when the goal's KPI or formulaType indicates revenue (not IRR/AUM/turnover). ` +
            `Goal "${g.title}" (${g.id}) is linked to KPI "${kpiName}".`
        );
      }
    }

    const syncJob = await prisma.performanceSyncJob.create({
      data: {
        goalId: primaryGoal.id,
        kpiId: primaryGoal.kpiId || params.kpiId || null,
        jobType: "MANUAL_SYNC",
        status: "RUNNING",
        targetEndpoint: "in-process://pe-portfolio-total-revenue",
        payloadSummary: {
          goalId: primaryGoal.id,
          goalIds: goals.map((g) => g.id),
          multiGoalCount: goals.length,
          kpiId: primaryGoal.kpiId || params.kpiId || null,
          fieldPath: "data.metrics.totalRevenue",
          syncMode: "PE_PORTFOLIO_TOTAL_REVENUE",
          fundId: params.fundId ?? null
        },
        createdById: params.actor.id,
        startedAt: new Date()
      }
    });

    try {
      const agg = await PortfolioDashboardService.getAggregatedPortfolioTotalRevenue({
        fundId: params.fundId
      });
      const rawPayload = {
        success: true,
        source: "in_process_pe_portfolio_total_revenue",
        data: {
          metrics: {
            totalRevenue: agg.totalRevenue,
            companyCount: agg.companyCount,
            companiesWithRevenue: agg.companiesWithRevenue
          }
        },
        generatedAt: new Date().toISOString()
      };

      const effectiveFieldPath = "data.metrics.totalRevenue";
      const extracted = extractValueFromPayload(rawPayload, effectiveFieldPath);

      return await this.finalizeManualSyncFromExtracted({
        goals,
        primaryGoal,
        syncJob,
        extracted,
        effectiveFieldPath,
        requestFieldPath: effectiveFieldPath,
        rawPayload,
        attempt: 1,
        actor: params.actor,
        meta: params.meta,
        kpiId: params.kpiId ?? null
      });
    } catch (error: any) {
      await prisma.performanceSyncJob.update({
        where: { id: syncJob.id },
        data: {
          status: "FAILED",
          errorCode: "PE_TOTAL_REVENUE_SYNC",
          errorMessage: error?.message || "Portfolio total revenue sync failed",
          attempts: 1,
          finishedAt: new Date()
        }
      });
      throw error;
    }
  }

  /**
   * In-process employee turnover rate from Payroll `Employee` table (`isActive` vs not).
   * Synced value is `turnoverRatePct` (0–100). Inactive rows count as terminations for this metric.
   */
  static async runPayrollTurnoverRateSync(params: {
    goalId?: string;
    kpiId?: string;
    actor: any;
    meta?: AuditMeta;
  }) {
    const goals = await this.loadGoalsForSync(params.goalId, params.kpiId);
    const primaryGoal = goals[0];

    for (const g of goals) {
      if (!isPayrollTurnoverCompatibleGoal(g)) {
        const kpiName = g.kpi?.name || "(no KPI)";
        throw new Error(
          `Payroll turnover sync is only allowed when the goal's KPI or formulaType indicates employee turnover. ` +
            `Goal "${g.title}" (${g.id}) is linked to KPI "${kpiName}".`
        );
      }
    }

    const syncJob = await prisma.performanceSyncJob.create({
      data: {
        goalId: primaryGoal.id,
        kpiId: primaryGoal.kpiId || params.kpiId || null,
        jobType: "MANUAL_SYNC",
        status: "RUNNING",
        targetEndpoint: "in-process://payroll-turnover-rate",
        payloadSummary: {
          goalId: primaryGoal.id,
          goalIds: goals.map((g) => g.id),
          multiGoalCount: goals.length,
          kpiId: primaryGoal.kpiId || params.kpiId || null,
          fieldPath: "data.metrics.turnoverRatePct",
          syncMode: "PAYROLL_TURNOVER_RATE"
        },
        createdById: params.actor.id,
        startedAt: new Date()
      }
    });

    try {
      const m = await DataIntegrationService.calculatePayrollEmployeeTurnoverMetrics();
      const rawPayload = {
        success: true,
        source: "in_process_payroll_employee_headcount",
        data: {
          metrics: {
            turnoverRatePct: m.turnoverRatePct,
            activeHeadcount: m.activeHeadcount,
            inactiveHeadcount: m.inactiveHeadcount,
            terminatedCount: m.terminatedCount,
            totalHeadcount: m.totalHeadcount
          }
        },
        generatedAt: new Date().toISOString()
      };

      const effectiveFieldPath = "data.metrics.turnoverRatePct";
      const extracted = extractValueFromPayload(rawPayload, effectiveFieldPath);

      return await this.finalizeManualSyncFromExtracted({
        goals,
        primaryGoal,
        syncJob,
        extracted,
        effectiveFieldPath,
        requestFieldPath: effectiveFieldPath,
        rawPayload,
        attempt: 1,
        actor: params.actor,
        meta: params.meta,
        kpiId: params.kpiId ?? null
      });
    } catch (error: any) {
      await prisma.performanceSyncJob.update({
        where: { id: syncJob.id },
        data: {
          status: "FAILED",
          errorCode: "PAYROLL_TURNOVER_SYNC",
          errorMessage: error?.message || "Payroll turnover rate sync failed",
          attempts: 1,
          finishedAt: new Date()
        }
      });
      throw error;
    }
  }

  static async runManualSync(params: {
    goalId?: string;
    kpiId?: string;
    endpointPath?: string;
    fieldPath?: string;
    bearerToken?: string;
    /** Divide extracted numeric by this (e.g. 100 when the API returns USD cents as an integer). */
    divideBy?: number;
    actor: any;
    meta?: AuditMeta;
    transport?: (request: { url: string; token?: string }) => Promise<any>;
    sleep?: (ms: number) => Promise<void>;
  }) {
    const goals = await this.loadGoalsForSync(params.goalId, params.kpiId);
    const primaryGoal = goals[0];

    const endpointPath =
      params.endpointPath ||
      goals.map((g) => g.syncEndpointPath).find((p) => p && String(p).trim() !== "");
    if (!endpointPath) {
      throw new Error(
        'This goal has no sync endpoint on file. Pass "endpointPath" in the JSON body (must include /v1/), and usually "fieldPath" (JSON dot-path to the number). Optional: "bearerToken", "divideBy" (e.g. 100 for integer cents → dollars).'
      );
    }

    if (!String(endpointPath).includes("/v1/")) {
      throw new Error("Performance sync endpoints must point to a /v1/ path.");
    }

    const url = buildEndpointUrl(endpointPath);
    const schedule = buildExponentialBackoffSchedule(5);
    const transport =
      params.transport ||
      (async ({ url, token }) => {
        const response = await axios.get(url, {
          headers: token
            ? {
                Authorization: `Bearer ${token}`
              }
            : undefined
        });
        return response.data;
      });
    const sleep = params.sleep || defaultSleep;

    const syncJob = await prisma.performanceSyncJob.create({
      data: {
        goalId: primaryGoal.id,
        kpiId: primaryGoal.kpiId || params.kpiId || null,
        jobType: "MANUAL_SYNC",
        status: "RUNNING",
        targetEndpoint: url,
        payloadSummary: {
          goalId: primaryGoal.id,
          goalIds: goals.map((g) => g.id),
          multiGoalCount: goals.length,
          kpiId: primaryGoal.kpiId || params.kpiId || null,
          fieldPath: params.fieldPath || null
        },
        createdById: params.actor.id,
        startedAt: new Date()
      }
    });

    let lastError: any = null;
    let rawPayload: any = null;

    for (let attemptIndex = 0; attemptIndex < schedule.length; attemptIndex += 1) {
      const attempt = attemptIndex + 1;

      try {
        rawPayload = await transport({
          url,
          token: params.bearerToken
        });

        const effectiveFieldPath =
          params.fieldPath ||
          primaryGoal.syncConfig?.fieldPath ||
          goals.find((g) => g.syncConfig && (g.syncConfig as any).fieldPath)?.syncConfig?.fieldPath;
        let extracted = extractValueFromPayload(rawPayload, effectiveFieldPath);
        const divisor =
          params.divideBy != null && Number(params.divideBy) > 0 ? Number(params.divideBy) : 1;
        if (divisor !== 1) {
          extracted = asNumber(extracted, 0) / divisor;
        }

        return await this.finalizeManualSyncFromExtracted({
          goals,
          primaryGoal,
          syncJob,
          extracted,
          effectiveFieldPath,
          requestFieldPath: params.fieldPath ?? null,
          rawPayload,
          attempt,
          actor: params.actor,
          meta: params.meta,
          kpiId: params.kpiId ?? null
        });
      } catch (error: any) {
        lastError = error;
        const statusCode = String(error?.response?.status || error?.status || error?.code || "SYNC_ERROR");
        const failedAt = new Date().toISOString();

        console.error("[PerformanceSync] attempt failed", {
          goalId: primaryGoal.id,
          goalIds: goals.map((g) => g.id),
          kpiId: primaryGoal.kpiId || params.kpiId || null,
          errorCode: statusCode,
          attempt,
          failedAt,
          message: error?.message
        });

        await prisma.performanceSyncJob.update({
          where: { id: syncJob.id },
          data: {
            status: attempt === schedule.length ? "FAILED" : "RETRYING",
            errorCode: statusCode,
            errorMessage: error?.message || "Unknown sync error",
            attempts: attempt,
            nextRetryAt: attempt === schedule.length ? null : new Date(Date.now() + schedule[attemptIndex]),
            payloadSummary: {
              goalId: primaryGoal.id,
              goalIds: goals.map((g) => g.id),
              kpiId: primaryGoal.kpiId || params.kpiId || null,
              failedAttempt: attempt,
              failedAt,
              scheduleMs: schedule,
              targetEndpoint: url
            }
          }
        });

        if (attempt < schedule.length) {
          await sleep(schedule[attemptIndex]);
        }
      }
    }

    const finalCode = String(
      lastError?.response?.status || lastError?.code || lastError?.message || "SYNC_ERROR"
    );
    console.error("[PerformanceSync] FAILED after retries", {
      goalId: primaryGoal.id,
      goalIds: goals.map((g) => g.id),
      kpiId: primaryGoal.kpiId || params.kpiId || null,
      errorCode: finalCode,
      at: new Date().toISOString()
    });

    await AuditService.log({
      userId: params.actor.id,
      action: "SYNC_FAILED",
      entityType: "PerformanceGoalSync",
      entityId: primaryGoal.id,
      newValues: {
        endpointPath,
        goalIds: goals.map((g) => g.id),
        kpiId: primaryGoal.kpiId || params.kpiId || null,
        errorCode: finalCode,
        failedAt: new Date().toISOString()
      },
      ...metaToAudit(params.meta)
    });

    throw new Error(lastError?.message || "Performance sync failed.");
  }

  static async listSyncJobs(filters: { goalId?: string; status?: string } = {}) {
    return prisma.performanceSyncJob.findMany({
      where: {
        ...(filters.goalId ? { goalId: filters.goalId } : {}),
        ...(filters.status ? { status: filters.status } : {})
      },
      orderBy: {
        createdAt: "desc"
      }
    });
  }

  static async approvePendingSync(params: {
    goalId: string;
    approvedValue?: number;
    comment: string;
    actor: any;
    meta?: AuditMeta;
  }) {
    const goal = await prisma.performanceGoal.findUnique({
      where: { id: params.goalId },
      include: { kpi: { select: { name: true } } }
    });

    if (!goal) {
      throw new Error("Performance goal not found.");
    }

    const approvedRaw = params.approvedValue ?? goal.pendingActualValue ?? goal.lastSyncedValue;
    if (approvedRaw === null || approvedRaw === undefined || approvedRaw === "") {
      throw new Error("There is no pending value to approve.");
    }

    const approvedNum = asNumber(approvedRaw, NaN);
    if (!Number.isFinite(approvedNum)) {
      throw new Error("There is no valid pending value to approve.");
    }

    const targetNum = goal.targetValue ? parseFloat(String(goal.targetValue)) : 0;
    const progressPercentage = computeAchievementPercent({
      currentValue: approvedNum,
      targetValue: goal.targetValue,
      targetOperator: goal.targetOperator,
      isReverseKpi: goal.isReverseKpi,
      progressPercentage: goal.progressPercentage
    });
    const completed = isTargetMet(approvedNum, targetNum, goal.targetOperator, goal.isReverseKpi);
    const partialProgress = !completed && targetNum > 0 && approvedNum > 0;
    const nextStage = completed ? "completed" : partialProgress ? "in_progress" : goal.stage;

    const legacyData = legacyProgressFieldsForGoal(goal, approvedNum);
    const performanceRiskZone = resolveGoalEscalationStatus({
      preciseCurrentValue: String(approvedNum),
      currentValue: approvedNum,
      preciseTargetValue: goal.preciseTargetValue,
      targetValue: goal.targetValue,
      allowableVariance: goal.allowableVariance,
      isReverseKpi: goal.isReverseKpi,
      endDate: goal.endDate
    });

    const updatedGoal = await prisma.performanceGoal.update({
      where: { id: goal.id },
      data: {
        isPendingApproval: false,
        pendingActualValue: null,
        preciseCurrentValue: String(approvedNum),
        currentValue: approvedNum,
        lastApprovedValue: approvedNum,
        lastSyncedAt: new Date(),
        progressPercentage,
        status: completed ? "completed" : "active",
        stage: nextStage,
        performanceRiskZone,
        performanceRiskZoneAt: new Date(),
        ...legacyData
      }
    });

    if (goal.kpiId) {
      await PerformanceGoalService.recalculateKPIProgress(goal.kpiId).catch((e) =>
        console.error(`[PerformanceSync] KPI recalc after approve failed for ${goal.kpiId}:`, e)
      );
    }
    if (goal.parentGoalId) {
      await PerformanceGoalService.updateParentGoalProgress(goal.parentGoalId).catch((e) =>
        console.error(`[PerformanceSync] Parent roll-up after approve failed for ${goal.parentGoalId}:`, e)
      );
    }

    if (goal.lastSyncJobId) {
      await prisma.performanceSyncJob.update({
        where: { id: goal.lastSyncJobId },
        data: {
          approvalStatus: "APPROVED",
          approvedById: params.actor.id,
          overrideComment: params.comment,
          status: "COMPLETED",
          finishedAt: new Date()
        }
      });
    }

    await AuditService.log({
      userId: params.actor.id,
      action: "APPROVE",
      entityType: "PerformanceGoalSyncApproval",
      entityId: goal.id,
      oldValues: {
        isPendingApproval: goal.isPendingApproval,
        pendingActualValue: goal.pendingActualValue
      },
      newValues: {
        approvedValue: approvedNum,
        comment: params.comment
      },
      ...metaToAudit(params.meta)
    });

    return updatedGoal;
  }

  static async overrideAutomatedGoal(params: {
    goalId: string;
    value: number;
    comment: string;
    actor: any;
    meta?: AuditMeta;
  }) {
    const goal = await prisma.performanceGoal.findUnique({
      where: { id: params.goalId },
      include: {
        assignedTo: {
          include: {
            role: true
          }
        },
        kpi: { select: { id: true, name: true } }
      }
    });

    if (!goal) {
      throw new Error("Performance goal not found.");
    }

    const canOverride =
      isDepartmentManager(params.actor, goal.departmentName) ||
      isHRLeader(params.actor) ||
      isCEO(params.actor);

    if (!canOverride) {
      throw new Error("Only a manager, HR leader, or CEO can override an automated KPI value.");
    }

    if (!String(params.comment || "").trim()) {
      throw new Error("A manager override comment is required.");
    }

    const overrideDigits = syncDecimalPlacesForIntegrationBatch([goal], (goal as any).syncConfig?.fieldPath);
    const normalizedValue = normaliseSyncedDecimal(params.value, overrideDigits);
    const updatedGoal = await prisma.performanceGoal.update({
      where: { id: goal.id },
      data: {
        currentValue: Number(normalizedValue),
        preciseCurrentValue: normalizedValue,
        lastApprovedValue: normalizedValue,
        isPendingApproval: false,
        pendingActualValue: null,
        manualOverrideComment: params.comment,
        manualOverrideById: params.actor.id,
        manualOverrideAt: new Date()
      }
    });

    await PerformanceGoalService.refreshPerformanceRiskZoneOnGoal(goal.id).catch(() => undefined);

    if (goal.lastSyncJobId) {
      await prisma.performanceSyncJob.update({
        where: { id: goal.lastSyncJobId },
        data: {
          approvalStatus: "OVERRIDDEN",
          approvedById: params.actor.id,
          overrideComment: params.comment,
          status: "COMPLETED",
          finishedAt: new Date()
        }
      });
    }

    await AuditService.log({
      userId: params.actor.id,
      action: "OVERRIDE",
      entityType: "PerformanceGoalManualOverride",
      entityId: goal.id,
      oldValues: {
        currentValue: goal.currentValue,
        preciseCurrentValue: goal.preciseCurrentValue,
        isPendingApproval: goal.isPendingApproval
      },
      newValues: {
        currentValue: updatedGoal.currentValue,
        preciseCurrentValue: updatedGoal.preciseCurrentValue,
        comment: params.comment
      },
      ...metaToAudit(params.meta)
    });

    return updatedGoal;
  }

  static async importGoalTargets(params: {
    fileBuffer: Buffer;
    filename: string;
    actor: any;
    meta?: AuditMeta;
  }) {
    const workbook = XLSX.read(params.fileBuffer, {
      type: "buffer"
    });

    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error("The import file does not contain any worksheets.");
    }

    const rows = XLSX.utils.sheet_to_json<any>(workbook.Sheets[firstSheetName], {
      defval: null
    });

    const results: any[] = [];
    for (const row of rows) {
      const goalId = row.goalId || row.goal_id || row.GoalID;
      if (!goalId) {
        continue;
      }

      const goal = await prisma.performanceGoal.findUnique({
        where: { id: String(goalId) }
      });

      if (!goal) {
        results.push({
          goalId,
          status: "SKIPPED",
          reason: "Goal not found"
        });
        continue;
      }

      const targetValue = row.targetValue ?? row.target_value ?? row.Target;
      const preciseTargetValue = row.preciseTargetValue ?? row.precise_target_value ?? targetValue;
      const pillar = row.scorecardPillar ?? row.pillar ?? goal.scorecardPillar;
      const reason =
        row.reason ||
        row.targetChangeReason ||
        row.weightChangeReason ||
        "Bulk KPI target import";

      const updatedGoal = await prisma.performanceGoal.update({
        where: { id: goal.id },
        data: {
          ...(targetValue !== null && targetValue !== undefined ? { targetValue: Number(targetValue) } : {}),
          ...(preciseTargetValue !== null && preciseTargetValue !== undefined
            ? { preciseTargetValue: normaliseSyncedDecimal(preciseTargetValue, 6) }
            : {}),
          ...(pillar
            ? { scorecardPillar: pillar, pillarId: pillarSlugForScorecardPillar(pillar) }
            : {}),
          targetChangeReason: reason
        }
      });

      await AuditService.log({
        userId: params.actor.id,
        action: "IMPORT",
        entityType: "PerformanceGoalTargetImport",
        entityId: goal.id,
        oldValues: goal,
        newValues: updatedGoal,
        ...metaToAudit(params.meta)
      });

      results.push({
        goalId: goal.id,
        status: "UPDATED"
      });
    }

    return {
      fileName: params.filename,
      updated: results.filter((item) => item.status === "UPDATED").length,
      skipped: results.filter((item) => item.status !== "UPDATED").length,
      results
    };
  }
}
