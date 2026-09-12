import { Prisma } from "@prisma/client";
import { Response } from "express";
import { randomUUID } from "crypto";
import { AuthRequest } from "../middleware/authenticate";
import { prisma } from "../utils/database";
import AuditService from "../services/AuditService";
import { ShortTermInvestmentService } from "../services/ShortTermInvestmentService";
import { isModulePrivilegedUser } from "../config/cfoModulePermissions";
import { evaluateInvestmentThreshold } from "../services/PaymentInvestmentApprovalService";
import { Department } from "../services/ProcurementService";

/** Max accrual rows returned on GET instrument (newest first); avoids huge payloads after long catch-ups. */
const TAKE_INSTRUMENT_ACCRUALS = 500;

/** Max audit log rows merged into GET instrument (newest first). */
const TAKE_INSTRUMENT_AUDIT_LOGS = 500;

export class ShortTermInvestmentController {
  static async getSettings(req: AuthRequest, res: Response): Promise<void> {
    try {
      const row = await ShortTermInvestmentService.getSettings();
      res.json({ success: true, data: row });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e?.message ?? String(e) });
    }
  }

  static async patchSettings(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }
      const { postingMode, fiscalTimezone } = req.body || {};
      const row = await ShortTermInvestmentService.updateSettings({
        postingMode,
        fiscalTimezone,
        userId,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });
      res.json({ success: true, data: row });
    } catch (e: any) {
      res.status(400).json({ success: false, error: e?.message ?? String(e) });
    }
  }

  static async listInstruments(_req: AuthRequest, res: Response): Promise<void> {
    try {
      const rows = await prisma.shortTermInvestmentInstrument.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          currency: { select: { id: true, code: true } },
          settlementBank: { select: { id: true, name: true, accountNumber: true } },
          _count: { select: { accruals: true } },
          accruals: {
            orderBy: { accrualDate: "desc" },
            take: 1,
            select: {
              id: true,
              accrualDate: true,
              amountInstrumentCcy: true,
              runningAccruedBalance: true,
              status: true,
            },
          },
        },
      });
      const data = rows.map(({ accruals, ...rest }) => ({
        ...rest,
        latestAccrual: accruals[0] ?? null,
      }));
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e?.message ?? String(e) });
    }
  }

  static async getInstrument(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const row = await prisma.shortTermInvestmentInstrument.findUnique({
        where: { id },
        include: {
          apyRates: { orderBy: { effectiveFrom: "desc" } },
          accruals: {
            orderBy: { accrualDate: "desc" },
            take: TAKE_INSTRUMENT_ACCRUALS,
            select: {
              id: true,
              accrualDate: true,
              amountInstrumentCcy: true,
              runningAccruedBalance: true,
              reportingAmountFunctional: true,
              functionalCurrencyId: true,
              fxRateUsed: true,
              status: true,
              journalEntryId: true,
              apyRateId: true,
              apyRate: { select: { apy: true, effectiveFrom: true } },
            },
          },
          currency: true,
          functionalCurrency: true,
          settlementBank: true,
          _count: { select: { accruals: true } },
        },
      });
      if (!row) {
        res.status(404).json({ success: false, error: "Not found" });
        return;
      }

      const [accrualIdRows, apyRateIdRows] = await Promise.all([
        prisma.shortTermInvestmentAccrual.findMany({
          where: { instrumentId: id },
          select: { id: true },
        }),
        prisma.shortTermInvestmentApyRate.findMany({
          where: { instrumentId: id },
          select: { id: true },
        }),
      ]);
      const accrualIds = accrualIdRows.map((a) => a.id);
      const apyRateIds = apyRateIdRows.map((r) => r.id);

      const auditOr: Prisma.AuditLogWhereInput[] = [
        { entityType: "ShortTermInvestmentInstrument", entityId: id },
        { entityType: "ShortTermInvestmentAccrualCatchUp", entityId: id },
      ];
      if (accrualIds.length > 0) {
        auditOr.push({ entityType: "ShortTermInvestmentAccrual", entityId: { in: accrualIds } });
      }
      if (apyRateIds.length > 0) {
        auditOr.push({ entityType: "ShortTermInvestmentApyRate", entityId: { in: apyRateIds } });
      }

      const auditLogs = await prisma.auditLog.findMany({
        where: { OR: auditOr },
        orderBy: { createdAt: "desc" },
        take: TAKE_INSTRUMENT_AUDIT_LOGS,
        include: {
          user: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      });

      res.json({ success: true, data: { ...row, auditLogs } });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e?.message ?? String(e) });
    }
  }

  /**
   * POST /instruments — body should include multi-currency fields explicitly (use null when N/A):
   * functionalCurrencyId, unrealizedFxGlAccountId, realizedFxGlAccountId.
   */
  static async createInstrument(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }
      const b = req.body || {};
      const optId = (v: unknown): string | null =>
        v != null && String(v).trim() !== "" ? String(v).trim() : null;
      const payload = {
        name: String(b.name || ""),
        category: b.category ?? null,
        broker: b.broker ?? null,
        principal: b.principal,
        currencyId: String(b.currencyId || ""),
        functionalCurrencyId: optId(b.functionalCurrencyId),
        compoundingMethod: String(b.compoundingMethod || "SIMPLE"),
        dayCountConvention: b.dayCountConvention ?? "ACTUAL_365",
        settlementBankId: String(b.settlementBankId || ""),
        principalGlAccountId: String(b.principalGlAccountId || ""),
        accruedInterestGlAccountId: String(b.accruedInterestGlAccountId || ""),
        interestIncomeGlAccountId: String(b.interestIncomeGlAccountId || ""),
        negativeYieldExpenseGlAccountId: String(b.negativeYieldExpenseGlAccountId || ""),
        unrealizedFxGlAccountId: optId(b.unrealizedFxGlAccountId),
        realizedFxGlAccountId: optId(b.realizedFxGlAccountId),
        startDateIso: String(b.startDateIso || b.startDate || ""),
        maturityDateIso: b.maturityDateIso ?? b.maturityDate ?? null,
        initialApy: b.initialApy ?? b.apy,
        initialApyEffectiveFromIso: b.initialApyEffectiveFromIso ?? b.effectiveFromIso,
      };

      // Investment-approval gate (mirrors MASTER_DATA_COA / ChartOfAccountsController): privileged
      // (admin/CFO) users and below-threshold placements continue to book immediately, exactly as
      // before. A non-privileged user booking INVESTMENT_APPROVAL_THRESHOLD_USD (USD-equivalent
      // principal) or more gets the placement queued for CFO approval (ApprovalRequest, stageType
      // "INVESTMENT_BOOKING") instead of booked here — see PaymentInvestmentApprovalService and
      // ApprovalService.updateEntityStatusAfterApproval.
      const { requiresApproval, amountUsd, currencyCode } = await evaluateInvestmentThreshold(
        payload.principal,
        payload.currencyId
      );
      if (requiresApproval && !isModulePrivilegedUser(req.user)) {
        const { ApprovalService } = await import("../services/ApprovalService");
        // No ShortTermInvestmentInstrument row exists yet — synthesize a placeholder id for the
        // ApprovalRequest; the real instrument (and its real id) is only created on approval.
        const pendingEntityId = `PENDING-STI-${randomUUID()}`;
        const approvalResult = await ApprovalService.createApprovalRequest({
          stageType: "INVESTMENT_BOOKING",
          entityId: pendingEntityId,
          entityData: {
            ...payload,
            ipAddress: req.ip,
            userAgent: req.get("user-agent"),
            amountUsd,
            currencyCode,
          },
          requestedById: userId,
          department: Department.FINANCE,
        });

        if (!approvalResult) {
          // No active INVESTMENT_BOOKING approval configuration/stage found (see
          // scripts/run-payment-investment-approval-configs-seed.ts). Fail closed rather than
          // silently booking the investment for a non-privileged caller.
          res.status(503).json({
            success: false,
            error:
              "Investment booking requires CFO approval, but no approval workflow is configured. Contact an administrator.",
          });
          return;
        }

        res.status(202).json({
          success: true,
          message: "Investment submitted for CFO approval",
          data: {
            status: "pending_approval",
            approvalRequestId: approvalResult.approvalRequest.id,
            proposedInvestment: payload,
            amountUsd,
            currencyCode,
          },
        });
        return;
      }

      const row = await ShortTermInvestmentService.createInstrument(payload, {
        userId,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });
      res.status(201).json({ success: true, data: row });
    } catch (e: any) {
      res.status(400).json({ success: false, error: e?.message ?? String(e) });
    }
  }

  static async updateInstrument(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }
      const { id } = req.params;
      const before = await prisma.shortTermInvestmentInstrument.findUnique({ where: { id } });
      if (!before) {
        res.status(404).json({ success: false, error: "Not found" });
        return;
      }
      if (before.status !== "ACTIVE") {
        res.status(400).json({ success: false, error: "Only ACTIVE instruments can be edited" });
        return;
      }

      const b = req.body || {};
      const data: Record<string, unknown> = {};

      if (b.name != null) data.name = String(b.name);
      if (b.category !== undefined) data.category = b.category;
      if (b.broker !== undefined) data.broker = b.broker;
      if (b.maturityDateIso != null) {
        data.maturityDate = new Date(`${String(b.maturityDateIso).slice(0, 10)}T00:00:00.000Z`);
      }
      if (b.functionalCurrencyId !== undefined) data.functionalCurrencyId = b.functionalCurrencyId;
      if (b.unrealizedFxGlAccountId !== undefined) data.unrealizedFxGlAccountId = b.unrealizedFxGlAccountId;
      if (b.realizedFxGlAccountId !== undefined) data.realizedFxGlAccountId = b.realizedFxGlAccountId;

      if (b.dayCountConvention != null && b.dayCountConvention !== before.dayCountConvention) {
        if (before.dayCountLocked) {
          res.status(400).json({
            success: false,
            error: "dayCountConvention is locked after the first accrual",
          });
          return;
        }
        data.dayCountConvention = String(b.dayCountConvention);
      }

      const updated = await prisma.shortTermInvestmentInstrument.update({
        where: { id },
        data: data as any,
      });

      await AuditService.log({
        userId,
        action: "UPDATE",
        entityType: "ShortTermInvestmentInstrument",
        entityId: id,
        oldValues: before,
        newValues: updated,
        ipAddress: req.ip ?? undefined,
        userAgent: req.get("user-agent") ?? undefined,
      });

      res.json({ success: true, data: updated });
    } catch (e: any) {
      res.status(400).json({ success: false, error: e?.message ?? String(e) });
    }
  }

  /** Deletion is intentionally blocked; use POST /instruments/:id/void instead. */
  static async deleteInstrument(_req: AuthRequest, res: Response): Promise<void> {
    res.status(405).json({
      success: false,
      error: "Deletion is not allowed for short-term investments. Use POST /instruments/:id/void instead.",
    });
  }

  static async appendApy(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }
      const { id } = req.params;
      const b = req.body || {};
      const row = await ShortTermInvestmentService.appendApyRate({
        instrumentId: id,
        effectiveFromIso: String(b.effectiveFromIso || b.effectiveFrom || ""),
        apy: b.apy,
        userId,
        ipAddress: req.ip,
        userAgent: req.get("user-agent"),
      });
      res.status(201).json({ success: true, data: row });
    } catch (e: any) {
      res.status(400).json({ success: false, error: e?.message ?? String(e) });
    }
  }

  static async postLiquidate(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }
      const { id } = req.params;
      const b = req.body || {};
      const settlementIso = String(b.settlementIso || b.settlementDate || "");
      const cashReceived = Number(b.cashReceived);
      if (!settlementIso || !Number.isFinite(cashReceived)) {
        res.status(400).json({ success: false, error: "settlementIso and cashReceived required" });
        return;
      }
      const row = await ShortTermInvestmentService.liquidateInstrument({
        instrumentId: id,
        settlementIso,
        cashReceived,
        actorId: userId,
      });
      res.json({ success: true, data: row });
    } catch (e: any) {
      res.status(400).json({ success: false, error: e?.message ?? String(e) });
    }
  }

  static async postVoid(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }
      const { id } = req.params;
      const row = await ShortTermInvestmentService.voidInstrument({
        instrumentId: id,
        actorId: userId,
      });
      res.json({ success: true, data: row });
    } catch (e: any) {
      res.status(400).json({ success: false, error: e?.message ?? String(e) });
    }
  }

  static async postCatchUp(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }
      const { id } = req.params;
      const b = req.body || {};
      const throughIso = String(b.throughIso || b.throughDate || "");
      if (!throughIso) {
        res.status(400).json({ success: false, error: "throughIso required (YYYY-MM-DD)" });
        return;
      }
      const rows = await ShortTermInvestmentService.catchUpAccruals({
        instrumentId: id,
        throughIso,
        actorId: userId,
      });
      res.json({ success: true, data: rows });
    } catch (e: any) {
      res.status(400).json({ success: false, error: e?.message ?? String(e) });
    }
  }

  static async postApproveAccrual(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }
      const { accrualId } = req.params;
      const row = await ShortTermInvestmentService.approveAccrualJournal(accrualId, userId);
      res.json({ success: true, data: row });
    } catch (e: any) {
      res.status(400).json({ success: false, error: e?.message ?? String(e) });
    }
  }

  static async postApproveAllAccruals(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }
      const instrumentId =
        (req.params as { id?: string; instrumentId?: string }).id ??
        (req.params as { id?: string; instrumentId?: string }).instrumentId;
      if (!instrumentId) {
        res.status(400).json({ success: false, error: "Missing instrument id" });
        return;
      }
      const data = await ShortTermInvestmentService.approveAllPendingAccrualJournalsForInstrument(
        instrumentId,
        userId
      );
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, error: e?.message ?? String(e) });
    }
  }

  static async postMonthEndFx(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
      }
      const b = req.body || {};
      const yearMonth = String(b.yearMonth || "");
      if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
        res.status(400).json({ success: false, error: "yearMonth must be YYYY-MM" });
        return;
      }
      const result = await ShortTermInvestmentService.runMonthEndRevaluation({
        yearMonth,
        actorId: userId,
      });
      res.json({ success: true, data: result });
    } catch (e: any) {
      res.status(400).json({ success: false, error: e?.message ?? String(e) });
    }
  }

  static async getDashboard(req: AuthRequest, res: Response): Promise<void> {
    try {
      const asOfIso = String(
        (req.query.asOfIso as string) || new Date().toISOString().slice(0, 10)
      );
      const broker = req.query.broker != null ? String(req.query.broker) : undefined;
      const dash = await ShortTermInvestmentService.getDashboard({ asOfIso, broker });
      res.json({ success: true, data: dash });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e?.message ?? String(e) });
    }
  }
}
