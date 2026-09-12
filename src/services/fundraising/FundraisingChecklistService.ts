// @ts-nocheck
import { prisma } from "../../utils/database";

export class FundraisingChecklistService {
  static async seedForDeal(dealId: string, stageId: string) {
    const templates = await prisma.fundraisingStageChecklistTemplate.findMany({
      where: { stageId },
      orderBy: { sortOrder: "asc" },
    });
    for (const t of templates) {
      await prisma.fundraisingDealChecklistItem.upsert({
        where: { dealId_itemKey: { dealId, itemKey: t.itemKey } },
        create: {
          dealId,
          itemKey: t.itemKey,
          label: t.label,
          isRequired: t.isRequired,
        },
        update: {},
      });
    }
  }

  static async list(dealId: string) {
    return prisma.fundraisingDealChecklistItem.findMany({
      where: { dealId },
      orderBy: { createdAt: "asc" },
    });
  }

  static async toggle(dealId: string, itemKey: string, isComplete: boolean, userId: string) {
    const item = await prisma.fundraisingDealChecklistItem.findUnique({
      where: { dealId_itemKey: { dealId, itemKey } },
    });
    if (!item) {
      throw Object.assign(new Error("Checklist item not found"), { statusCode: 404 });
    }
    return prisma.fundraisingDealChecklistItem.update({
      where: { id: item.id },
      data: {
        isComplete,
        completedAt: isComplete ? new Date() : null,
        completedById: isComplete ? userId : null,
      },
    });
  }

  static async allRequiredComplete(dealId: string): Promise<boolean> {
    const items = await prisma.fundraisingDealChecklistItem.findMany({ where: { dealId } });
    const required = items.filter((i) => i.isRequired);
    if (!required.length) return true;
    return required.every((i) => i.isComplete);
  }
}
