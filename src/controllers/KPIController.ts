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
  const { catalogDescription, weightValue, ...rest } = kpi;
  return {
    ...rest,
    description: catalogDescription ?? null,
    weightValue:
      weightValue != null && typeof weightValue?.toString === "function"
        ? parseFloat(weightValue.toString())
        : weightValue
  };
}

export class KPIController {
  // Create a new KPI
  static async createKPI(req: Request, res: Response) {
    try {
      const {
        name,
        type,
        departmentId,
        isReverseKpi,
        weightValue,
        hasUnit,
        unitCategory,
        unit,
        unitSymbol,
        unitPosition,
        code,
        description,
        catalogDepartmentName,
        accountType,
        accountNumber,
        journalEntryType,
        isFinancial,
        scorecardPillar
      } = req.body;

      if (!name || !type) {
        return res.status(400).json({
          success: false,
          message: "KPI name and type are required"
        });
      }

      if (!["Metric", "Percentage"].includes(type)) {
        return res.status(400).json({
          success: false,
          message: "KPI type must be either 'Metric' or 'Percentage'"
        });
      }

      const rev = parseRequiredBool(isReverseKpi, "isReverseKpi");
      if (!rev.ok) {
        return res.status(400).json({ success: false, message: rev.message });
      }
      const w = parseRequiredFiniteNumber(weightValue, "weightValue");
      if (!w.ok) {
        return res.status(400).json({ success: false, message: w.message });
      }
      const hu = parseRequiredBool(hasUnit, "hasUnit");
      if (!hu.ok) {
        return res.status(400).json({ success: false, message: hu.message });
      }
      const uc = parseRequiredNonEmptyString(unitCategory, "unitCategory");
      if (!uc.ok) {
        return res.status(400).json({ success: false, message: uc.message });
      }
      const u = parseRequiredNonEmptyString(unit, "unit");
      if (!u.ok) {
        return res.status(400).json({ success: false, message: u.message });
      }
      const us = parseRequiredNonEmptyString(unitSymbol, "unitSymbol");
      if (!us.ok) {
        return res.status(400).json({ success: false, message: us.message });
      }
      if (unitPosition === undefined || unitPosition === null) {
        return res.status(400).json({ success: false, message: "unitPosition is required" });
      }
      if (unitPosition !== "prefix" && unitPosition !== "suffix") {
        return res.status(400).json({
          success: false,
          message: "unitPosition must be either 'prefix' or 'suffix'"
        });
      }

      const codeP = parseRequiredNonEmptyString(code, "code");
      if (!codeP.ok) {
        return res.status(400).json({ success: false, message: codeP.message });
      }
      const descP = parseRequiredNonEmptyString(description, "description");
      if (!descP.ok) {
        return res.status(400).json({ success: false, message: descP.message });
      }
      const cdnP = parseRequiredNonEmptyString(catalogDepartmentName, "catalogDepartmentName");
      if (!cdnP.ok) {
        return res.status(400).json({ success: false, message: cdnP.message });
      }
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
      const fin = parseRequiredBool(isFinancial, "isFinancial");
      if (!fin.ok) {
        return res.status(400).json({ success: false, message: fin.message });
      }
      let accountNumberNorm = null;
      if (fin.value === true) {
        const an = parseRequiredNonEmptyString(accountNumber, "accountNumber");
        if (!an.ok) {
          return res.status(400).json({
            success: false,
            message: "accountNumber is required when isFinancial is true (chart / GL identifier)"
          });
        }
        accountNumberNorm = an.value;
      } else if (accountNumber != null && String(accountNumber).trim() !== "") {
        const an = parseRequiredNonEmptyString(accountNumber, "accountNumber");
        if (!an.ok) {
          return res.status(400).json({ success: false, message: an.message });
        }
        accountNumberNorm = an.value;
      }

      const resolvedDepartmentId = await KPIService.resolveDepartmentIdByCatalogDepartmentName(
        cdnP.value
      );
      if (!resolvedDepartmentId) {
        return res.status(400).json({
          success: false,
          message: `No department found with name "${cdnP.value}". Use the exact name from the departments table (e.g. Human Resources).`
        });
      }
      if (
        departmentId != null &&
        String(departmentId).trim() !== "" &&
        String(departmentId).trim() !== resolvedDepartmentId
      ) {
        return res.status(400).json({
          success: false,
          message: "departmentId does not match catalogDepartmentName; omit departmentId or align it with the resolved department."
        });
      }

      const kpi = await KPIService.createKPI({
        name,
        type,
        departmentId: resolvedDepartmentId,
        isReverseKpi: rev.value,
        weightValue: w.value,
        hasUnit: hu.value,
        unitCategory: uc.value,
        unit: u.value,
        unitSymbol: us.value,
        unitPosition,
        code: codeP.value,
        description: descP.value,
        catalogDepartmentName: cdnP.value,
        accountType: atP.value,
        accountNumber: accountNumberNorm,
        journalEntryType: jtP.value,
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
      const {
        type,
        departmentId,
        isActive,
        hasUnit,
        search,
        scorecardPillar
      } = req.query;

      const filters: any = {};
      if (type) filters.type = type as string;
      if (departmentId) filters.departmentId = departmentId as string;
      if (isActive !== undefined) filters.isActive = isActive === 'true';
      if (hasUnit !== undefined) filters.hasUnit = hasUnit === 'true';
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
        type,
        departmentId,
        isReverseKpi,
        weightValue,
        hasUnit,
        unitCategory,
        unit,
        unitSymbol,
        unitPosition,
        isActive,
        code,
        description,
        catalogDepartmentName,
        accountType,
        accountNumber,
        journalEntryType,
        isFinancial,
        scorecardPillar
      } = req.body;

      if (type && !["Metric", "Percentage"].includes(type)) {
        return res.status(400).json({
          success: false,
          message: "KPI type must be either 'Metric' or 'Percentage'"
        });
      }

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

      const patch = {
        name,
        type,
        ...(isReverseKpi !== undefined && {
          isReverseKpi:
            typeof isReverseKpi === "boolean"
              ? isReverseKpi
              : isReverseKpi === "true",
        }),
        weightValue,
        hasUnit,
        unitCategory,
        unit,
        unitSymbol,
        unitPosition,
        isActive,
        ...(code !== undefined && { code: String(code).trim() }),
        ...(description !== undefined && { description }),
        ...(accountType !== undefined && { accountType }),
        ...(accountNumber !== undefined && { accountNumber }),
        ...(journalEntryType !== undefined && { journalEntryType }),
        ...(isFinancial !== undefined && {
          isFinancial:
            typeof isFinancial === "boolean" ? isFinancial : isFinancial === "true"
        }),
        ...(scorecardPillar !== undefined && { scorecardPillar })
      };

      if (catalogDepartmentName !== undefined) {
        if (catalogDepartmentName === null || String(catalogDepartmentName).trim() === "") {
          patch.catalogDepartmentName = null;
          patch.departmentId = null;
        } else {
          const cdn = parseRequiredNonEmptyString(catalogDepartmentName, "catalogDepartmentName");
          if (!cdn.ok) {
            return res.status(400).json({ success: false, message: cdn.message });
          }
          const rid = await KPIService.resolveDepartmentIdByCatalogDepartmentName(cdn.value);
          if (!rid) {
            return res.status(400).json({
              success: false,
              message: `No department found with name "${cdn.value}". Use the exact name from the departments table.`
            });
          }
          if (
            departmentId != null &&
            String(departmentId).trim() !== "" &&
            String(departmentId).trim() !== rid
          ) {
            return res.status(400).json({
              success: false,
              message: "departmentId does not match catalogDepartmentName; omit departmentId or align it with the resolved department."
            });
          }
          patch.catalogDepartmentName = cdn.value;
          patch.departmentId = rid;
        }
      } else if (departmentId !== undefined) {
        patch.departmentId = departmentId;
      }

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
      const {
        kpiId,
        type,
        departmentId,
        isActive,
        scorecardPillar
      } = req.query;

      const filters: any = {};
      if (kpiId) filters.kpiId = kpiId as string;
      if (type) filters.type = type as string;
      if (departmentId) filters.departmentId = departmentId as string;
      if (isActive !== undefined) filters.isActive = isActive === 'true';
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
      const {
        departmentId,
        scorecardPillar,
        period = 'month'
      } = req.query;

      const filters: any = {};
      if (departmentId) filters.departmentId = departmentId as string;
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
