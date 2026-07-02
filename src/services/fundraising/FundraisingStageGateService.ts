// @ts-nocheck
import { prisma } from "../../utils/database";
import { FundraisingChecklistService } from "./FundraisingChecklistService";

export class FundraisingStageGateService {
  static async validateMove(dealId: string, targetStageId: string) {
    const deal = await prisma.fundraisingPipelineDeal.findUnique({
      where: { id: dealId },
      include: {
        stage: true,
        agreement: true,
        campaign: { include: { stages: { orderBy: { sortOrder: "asc" } } } },
      },
    });
    if (!deal) throw Object.assign(new Error("Deal not found"), { statusCode: 404 });

    const target = deal.campaign.stages.find((s) => s.id === targetStageId);
    if (!target) {
      throw Object.assign(new Error("Target stage not found in campaign"), { statusCode: 400 });
    }

    const currentOrder = deal.stage.sortOrder;
    const targetOrder = target.sortOrder;

    if (targetOrder < currentOrder) {
      return { ok: true, target };
    }

    const rules = (target.gateRules as Record<string, unknown>) || {};

    if (rules.requiresPreviousStageChecklist) {
      const prevStages = deal.campaign.stages.filter(
        (s) => s.sortOrder < targetOrder && s.sortOrder >= currentOrder
      );
      for (const ps of prevStages) {
        if (ps.id === deal.stageId) {
          const complete = await FundraisingChecklistService.allRequiredComplete(dealId);
          if (!complete) {
            throw Object.assign(
              new Error(`Complete all required checklist items in ${deal.stage.stageName} before advancing`),
              { statusCode: 400 }
            );
          }
        }
      }
      if (targetOrder > currentOrder + 0) {
        const complete = await FundraisingChecklistService.allRequiredComplete(dealId);
        if (!complete && currentOrder < targetOrder) {
          throw Object.assign(
            new Error(`Complete all required checklist items in ${deal.stage.stageName} before advancing`),
            { statusCode: 400 }
          );
        }
      }
    }

    if (rules.requiresAgreementSigned) {
      if (!deal.agreement || deal.agreement.status !== "SIGNED") {
        throw Object.assign(
          new Error("Signed subscription agreement required before moving to Won/Signed"),
          { statusCode: 400 }
        );
      }
    }

    if (rules.requiresChecklistComplete) {
      const complete = await FundraisingChecklistService.allRequiredComplete(dealId);
      if (!complete) {
        throw Object.assign(new Error("Complete all required checklist items before closing"), {
          statusCode: 400,
        });
      }
    }

    return { ok: true, target };
  }
}
