// @ts-nocheck
import { prisma } from "../../utils/database";
import { FpaError } from "./FpaError";
import { FpaAuditService } from "./FpaAuditService";

/** AI stubs — write planning_ai_forecasts only; never approve/lock. */
export class FpaAiService {
  static async suggestForecast(input: any, userId: string, ip?: string) {
    const modelId = input.modelId;
    if (!modelId) throw new FpaError(400, "VALIDATION", "modelId required");
    const model = await prisma.planningModel.findUnique({ where: { id: modelId } });
    if (!model) throw new FpaError(404, "NOT_FOUND", "Model not found");

    const recent = await prisma.planningCell.findMany({
      where: { modelId, lineItem: { code: "REVENUE" } },
      orderBy: { periodDate: "desc" },
      take: 6,
      include: { lineItem: true },
    });
    const avg =
      recent.length > 0
        ? recent.reduce((s, c) => s + Number(c.value || 0), 0) / recent.length
        : 0;
    const suggestion = {
      method: "SIMPLE_AVG_FORWARD",
      lineItemCode: "REVENUE",
      suggestedMonthly: Number(avg.toFixed(2)),
      note: "Stub suggestion from recent revenue average; requires human review before apply.",
      inputs: input,
    };

    const row = await prisma.planningAiForecast.create({
      data: {
        modelId,
        suggestionType: "FORECAST_SUGGEST",
        payloadJson: suggestion,
        confidence: 0.4,
        status: "DRAFT",
        createdById: userId,
      },
    });
    await FpaAuditService.log("AI_SUGGEST", userId, { modelId, ip });
    return row;
  }

  static async draftCommentary(input: any, userId: string, ip?: string) {
    const modelId = input.modelId;
    if (!modelId) throw new FpaError(400, "VALIDATION", "modelId required");
    const varianceId = input.varianceId;
    let context: any = { varianceId: varianceId || null };
    if (varianceId) {
      const v = await prisma.planningVarianceResult.findUnique({
        where: { id: varianceId },
        include: { lineItem: true },
      });
      if (v) {
        context = {
          lineItem: v.lineItem?.name,
          direction: v.direction,
          varianceAmount: Number(v.varianceAmount),
          variancePercent: v.variancePercent != null ? Number(v.variancePercent) : null,
        };
      }
    }
    const draft = {
      commentary: `Stub commentary: ${context.lineItem || "Line item"} variance is ${
        context.direction || "N/A"
      } (${context.varianceAmount ?? "n/a"} / ${context.variancePercent ?? "n/a"}%). Review drivers and confirm actions.`,
      status: "DRAFT",
      context,
    };
    const row = await prisma.planningAiForecast.create({
      data: {
        modelId,
        suggestionType: "COMMENTARY_DRAFT",
        payloadJson: draft,
        confidence: 0.35,
        status: "DRAFT",
        createdById: userId,
      },
    });
    await FpaAuditService.log("AI_COMMENTARY_DRAFT", userId, { modelId, ip });
    return row;
  }
}
