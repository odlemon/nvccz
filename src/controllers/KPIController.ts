// @ts-nocheck
import { Request, Response } from "express";
import { KPIService } from "../services/KPIService";

function parseRequiredBool(value: unknown, field: string): { ok: true; value: boolean } | { ok: false; message: string } {
  if (value === undefined) {
    return { ok: false, message: `${field} is required` };
  }
  if (typeof value === "boolean") {
    return { ok: true, value };
  }
  if (value === "true") {
    return { ok: true, value: true };
  }
  if (value === "false") {
    return { ok: true, value: false };
  }
  return { ok: false, message: `${field} must be a boolean` };
}

function parseRequiredFiniteNumber(value: unknown, field: string): { ok: true; value: number } | { ok: false; message: string } {
  if (value === undefined || value === null) {
    return { ok: false, message: `${field} is required` };
  }
  const n = typeof value === "number" ? value : typeof value === "string" ? parseFloat(value) : NaN;
  if (!Number.isFinite(n)) {
    return { ok: false, message: `${field} must be a finite number` };
  }
  return { ok: true, value: n };
}

function parseRequiredNonEmptyString(value: unknown, field: string): { ok: true; value: string } | { ok: false; message: string } {
  if (value === undefined || value === null) {
    return { ok: false, message: `${field} is required` };
  }
  if (typeof value !== "string") {
    return { ok: false, message: `${field} must be a non-empty string` };
  }
  const t = value.trim();
  if (!t) {
    return { ok: false, message: `${field} must be a non-empty string` };
  }
  return { ok: true, value: t };
}

const KPI_ACCOUNT_TYPES = ["Revenue", "Expense", "Asset", "Liability", "Equity"];
const KPI_JOURNAL_TYPES = ["Debit", "Credit"];

function serializeKpiForJson(kpi: any) {
  if (!kpi) return kpi;
  const { catalogDescription, type, weightValue, departmentId, catalogDepartmentName, ...rest } = kpi as any;
  return {
    ...rest,
    description: catalogDescription ?? null
  };
}

export class KPIController {
  // Create a new KPI
  static async createKPI(req: Request, res: Response) {
    try {
      const {
        name,
        isReverseKpi,
        hasUnit,
        unitCategory,
        unit,
        unitSymbol,
        unitPosition,
        code,
        description,
        accountType,
        accountNumber,
        journalEntryType,
        isFinancial,
        scorecardPillar
      } = req.body;

      if (!name || !String(name).trim()) {
        return res.status(400).json({
          success: false,
          message: "KPI name is required"
        });
      }

      const rev = parseRequiredBool(isReverseKpi, "isReverseKpi");
      if (!rev.ok) {
        return res.status(400).json({ success: false, message: rev.message });
      }
      const hu = parseRequiredBool(hasUnit, "hasUnit");
      if (!hu.ok) {
        return res.status(400).json({ success: false, message: hu.message });
      }
      const uc = parseRequiredNonEmptyString(unitCategory, "unitCategory");
      if (!uc.ok) {
        return res.status(400).json({ success: false, message: uc.message });
      }
      let unitNorm: string | null = null;
      let unitSymbolNorm: string | null = null;
      let unitPositionNorm: string | null = null;
      if (hu.value) {
        const uReq = parseRequiredNonEmptyString(unit, "unit");
        if (!uReq.ok) {
          return res.status(400).json({ success: false, message: uReq.message });
        }
        unitNorm = uReq.value;
        const usReq = parseRequiredNonEmptyString(unitSymbol, "unitSymbol");
        if (!usReq.ok) {
          return res.status(400).json({ success: false, message: usReq.message });
        }
        unitSymbolNorm = usReq.value;
        if (unitPosition === undefined || unitPosition === null) {
          return res.status(400).json({ success: false, message: "unitPosition is required when hasUnit is true" });
        }
        if (unitPosition !== "prefix" && unitPosition !== "suffix") {
          return res.status(400).json({
            success: false,
            message: "unitPosition must be either 'prefix' or 'suffix'"
          });
        }
        unitPositionNorm = unitPosition;
      }

      const codeP = parseRequiredNonEmptyString(code, "code");
      if (!codeP.ok) {
        return res.status(400).json({ success: false, message: codeP.message });
      }
      const descP = parseRequiredNonEmptyString(description, "description");
      if (!descP.ok) {
        return res.status(400).json({ success: false, message: descP.message });
      }
      const fin = parseRequiredBool(isFinancial, "isFinancial");
      if (!fin.ok) {
        return res.status(400).json({ success: false, message: fin.message });
      }

      let accountTypeNorm: string | null = null;
      let journalEntryTypeNorm: string | null = null;
      let accountNumberNorm: string | null = null;

      if (fin.value === true) {
        const atP = parseRequiredNonEmptyString(accountType, "accountType");
        if (!atP.ok) {
          return res.status(400).json({ success: false, message: atP.message });
        }
        if (!KPI_ACCOUNT_TYPES.includes(atP.value)) {
          return res.status(400).json({
            success: false,
            message: `accountType must be one of: ${KPI_ACCOUNT_TYPES.join(", ")}`
          });
        }
        accountTypeNorm = atP.value;

        const jtP = parseRequiredNonEmptyString(journalEntryType, "journalEntryType");
        if (!jtP.ok) {
          return res.status(400).json({ success: false, message: jtP.message });
        }
        if (!KPI_JOURNAL_TYPES.includes(jtP.value)) {
          return res.status(400).json({
            success: false,
            message: `journalEntryType must be one of: ${KPI_JOURNAL_TYPES.join(", ")}`
          });
        }
        journalEntryTypeNorm = jtP.value;

        const an = parseRequiredNonEmptyString(accountNumber, "accountNumber");
        if (!an.ok) {
          return res.status(400).json({
            success: false,
            message: "accountNumber is required when isFinancial is true (chart / GL identifier)"
          });
        }
        accountNumberNorm = an.value;
      } else {
        if (accountType != null && String(accountType).trim() !== "") {
          const atP = parseRequiredNonEmptyString(accountType, "accountType");
          if (!atP.ok) {
            return res.status(400).json({ success: false, message: atP.message });
          }
          if (KPI_ACCOUNT_TYPES.includes(atP.value)) accountTypeNorm = atP.value;
        }
        if (journalEntryType != null && String(journalEntryType).trim() !== "") {
          const jtP = parseRequiredNonEmptyString(journalEntryType, "journalEntryType");
          if (!jtP.ok) {
            return res.status(400).json({ success: false, message: jtP.message });
          }
          if (KPI_JOURNAL_TYPES.includes(jtP.value)) journalEntryTypeNorm = jtP.value;
        }
        if (accountNumber != null && String(accountNumber).trim() !== "") {
          const an = parseRequiredNonEmptyString(accountNumber, "accountNumber");
          if (!an.ok) {
            return res.status(400).json({ success: false, message: an.message });
          }
          accountNumberNorm = an.value;
        }
      }

      const kpi = await KPIService.createKPI({
        name: String(name).trim(),
        isReverseKpi: rev.value,
        hasUnit: hu.value,
        unitCategory: uc.value,
        unit: unitNorm,
        unitSymbol: unitSymbolNorm,
        unitPosition: unitPositionNorm,
        code: codeP.value,
        description: descP.value,
        catalogDepartmentName: null,
        accountType: accountTypeNorm,
        accountNumber: accountNumberNorm,
        journalEntryType: journalEntryTypeNorm,
        isFinancial: fin.value,
        ...(scorecardPillar != null && String(scorecardPillar).trim() !== ""
          ? { scorecardPillar: String(scorecardPillar).trim() }
          : {})
      });

      return res.status(201).json({
        success: true,
        message: "KPI created successfully",
        kpi: serializeKpiForJson(kpi)
      });
    } catch (error: any) {
      if (res.headersSent) {
        return;
      }
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get all KPIs
  static async getAllKPIs(req: Request, res: Response) {
    try {
      const { isActive, hasUnit, search, scorecardPillar } = req.query;

      const filters: any = {};
      if (isActive !== undefined) filters.isActive = isActive === "true";
      if (hasUnit !== undefined) filters.hasUnit = hasUnit === "true";
      if (search) filters.search = search as string;
      if (scorecardPillar) filters.scorecardPillar = scorecardPillar as string;

      const kpis = await KPIService.getAllKPIs(filters);

      res.status(200).json({
        success: true,
        count: kpis.length,
        kpis: kpis.map((k) => serializeKpiForJson(k))
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get KPI by ID
  static async getKPIById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const kpi = await KPIService.getKPIById(id);

      res.status(200).json({
        success: true,
        kpi: serializeKpiForJson(kpi)
      });
    } catch (error: any) {
      res.status(404).json({
        success: false,
        message: error.message
      });
    }
  }

  // Update KPI
  static async updateKPI(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const {
        name,
        isReverseKpi,
        hasUnit,
        unitCategory,
        unit,
        unitSymbol,
        unitPosition,
        isActive,
        code,
        description,
        accountType,
        accountNumber,
        journalEntryType,
        isFinancial,
        scorecardPillar
      } = req.body;

      if (accountType && !KPI_ACCOUNT_TYPES.includes(accountType)) {
        return res.status(400).json({
          success: false,
          message: `accountType must be one of: ${KPI_ACCOUNT_TYPES.join(", ")}`
        });
      }
      if (journalEntryType && !KPI_JOURNAL_TYPES.includes(journalEntryType)) {
        return res.status(400).json({
          success: false,
          message: `journalEntryType must be one of: ${KPI_JOURNAL_TYPES.join(", ")}`
        });
      }

      const patch: any = {
        ...(name !== undefined && { name }),
        ...(isReverseKpi !== undefined && {
          isReverseKpi: typeof isReverseKpi === "boolean" ? isReverseKpi : isReverseKpi === "true"
        }),
        ...(hasUnit !== undefined && { hasUnit }),
        ...(unitCategory !== undefined && { unitCategory }),
        ...(unit !== undefined && { unit }),
        ...(unitSymbol !== undefined && { unitSymbol }),
        ...(unitPosition !== undefined && { unitPosition }),
        ...(isActive !== undefined && { isActive }),
        ...(code !== undefined && { code: String(code).trim() }),
        ...(description !== undefined && { description }),
        ...(accountType !== undefined && { accountType }),
        ...(accountNumber !== undefined && { accountNumber }),
        ...(journalEntryType !== undefined && { journalEntryType }),
        ...(isFinancial !== undefined && {
          isFinancial: typeof isFinancial === "boolean" ? isFinancial : isFinancial === "true"
        }),
        ...(scorecardPillar !== undefined && { scorecardPillar })
      };

      const kpi = await KPIService.updateKPI(id, patch);

      return res.status(200).json({
        success: true,
        message: "KPI updated successfully",
        kpi: serializeKpiForJson(kpi)
      });
    } catch (error: any) {
      if (res.headersSent) {
        return;
      }
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Delete KPI
  static async deleteKPI(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const result = await KPIService.deleteKPI(id);

      res.status(200).json({
        success: true,
        message: result.message
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get KPI statistics
  static async getKPIStatistics(req: Request, res: Response) {
    try {
      const statistics = await KPIService.getKPIStatistics();

      res.status(200).json({
        success: true,
        statistics
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get comprehensive KPI tracking data
  static async getKPITracking(req: Request, res: Response) {
    try {
      const { kpiId, isActive, scorecardPillar } = req.query;

      const filters: any = {};
      if (kpiId) filters.kpiId = kpiId as string;
      if (isActive !== undefined) filters.isActive = isActive === "true";
      if (scorecardPillar) filters.scorecardPillar = scorecardPillar as string;

      const trackingData = await KPIService.getKPITracking(filters);

      res.status(200).json({
        success: true,
        message: "KPI tracking data retrieved successfully",
        data: trackingData
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get KPI analytics summary
  static async getKPIAnalyticsSummary(req: Request, res: Response) {
    try {
      const { scorecardPillar, period = "month" } = req.query;

      const filters: any = {};
      if (scorecardPillar) filters.scorecardPillar = scorecardPillar as string;

      const analyticsData = await KPIService.getKPIAnalyticsSummary(filters, period as string);

      res.status(200).json({
        success: true,
        message: "KPI analytics summary retrieved successfully",
        data: analyticsData
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
}
