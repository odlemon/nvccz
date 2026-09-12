// @ts-nocheck
import { prisma } from "../../utils/database";
import { FpaError } from "./FpaError";
import { FpaModuleService } from "./FpaModuleService";
import { FpaGridService } from "./FpaGridService";

function impactFromSeverity(sev: string): "HIGH" | "MEDIUM" | "LOW" {
  const s = String(sev || "").toUpperCase();
  if (s === "ERROR") return "HIGH";
  if (s === "WARNING") return "MEDIUM";
  return "LOW";
}

export class FpaExceptionsService {
  static async list(modelId: string, query: any = {}, user: any = null) {
    const model = await prisma.planningModel.findUnique({ where: { id: modelId } });
    if (!model) throw new FpaError(404, "NOT_FOUND", "Planning model not found");

    const versionId = query.versionId ? String(query.versionId) : null;
    const scenarioId = query.scenarioId ? String(query.scenarioId) : null;
    const moduleId = query.moduleId ? String(query.moduleId) : null;

    const items: Array<{
      severity: string;
      impact: "HIGH" | "MEDIUM" | "LOW";
      code: string;
      type: string;
      message: string;
      lineItemId?: string | null;
      moduleId?: string | null;
      mappingId?: string | null;
      periodDate?: string | null;
      cellId?: string | null;
    }> = [];

    const enriched = await FpaModuleService.enrichedValidate(modelId);
    for (const issue of enriched.issues || []) {
      if (moduleId && issue.moduleId && issue.moduleId !== moduleId) continue;
      items.push({
        severity: issue.severity,
        impact: issue.impact || impactFromSeverity(issue.severity),
        code: issue.code,
        type: issue.type || issue.category || "VALIDATION",
        message: issue.message,
        lineItemId: issue.lineItemId || null,
        moduleId: issue.moduleId || null,
      });
    }

    if (versionId) {
      try {
        const grid = await FpaGridService.gridValidations(modelId, { versionId, scenarioId, moduleId });
        for (const issue of grid.issues || []) {
          items.push({
            severity: issue.severity,
            impact: impactFromSeverity(issue.severity),
            code: issue.code,
            type: "GRID",
            message: issue.message,
            lineItemId: issue.lineItemId || null,
            moduleId: moduleId || null,
            periodDate: issue.periodDate || null,
            cellId: issue.cellId || null,
          });
        }
      } catch {
        /* version optional for exceptions */
      }
    }

    const mappingWhere: any = { modelId, status: "UNMAPPED" };
    if (moduleId) mappingWhere.moduleId = moduleId;
    const unmapped = await prisma.planningLineItemMapping.findMany({
      where: mappingWhere,
      include: {
        sourceField: { select: { fieldKey: true } },
        lineItem: { select: { id: true, name: true } },
      },
      take: 200,
    });
    for (const m of unmapped) {
      items.push({
        severity: "WARNING",
        impact: "HIGH",
        code: "UNMAPPED_SOURCE",
        type: "MAPPING",
        message: `Unmapped source field ${m.sourceField?.fieldKey || m.sourceFieldId}`,
        lineItemId: m.lineItemId,
        moduleId: m.moduleId,
        mappingId: m.id,
      });
    }

    const counts = {
      total: items.length,
      errors: items.filter((i) => String(i.severity).toUpperCase() === "ERROR").length,
      warnings: items.filter((i) => String(i.severity).toUpperCase() === "WARNING").length,
      info: items.filter((i) => String(i.severity).toUpperCase() === "INFO").length,
      high: items.filter((i) => i.impact === "HIGH").length,
      medium: items.filter((i) => i.impact === "MEDIUM").length,
      low: items.filter((i) => i.impact === "LOW").length,
    };

    return { modelId, versionId, scenarioId, moduleId, counts, items };
  }
}
