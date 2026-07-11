// @ts-nocheck
import { prisma } from "../../utils/database";
import { FpaError } from "./FpaError";

const CATEGORY_MAP: Record<string, string> = {
  workforce: "WORKFORCE",
  revenue: "REVENUE",
  expense: "EXPENSE",
  cash: "CASH",
};

export class FpaDomainService {
  static async listByCategory(modelId: string, category: string) {
    if (!modelId) throw new FpaError(400, "VALIDATION", "modelId required");
    const cat = CATEGORY_MAP[String(category || "").toLowerCase()] || String(category || "").toUpperCase();
    if (!["WORKFORCE", "REVENUE", "EXPENSE", "CASH"].includes(cat)) {
      throw new FpaError(400, "VALIDATION", "category must be workforce|revenue|expense|cash");
    }
    const lineItems = await prisma.planningLineItem.findMany({
      where: { modelId, category: cat },
      orderBy: { sortOrder: "asc" },
      include: {
        cells: { take: 24, orderBy: { periodDate: "asc" } },
        formulas: true,
      },
    });
    const drivers =
      cat === "WORKFORCE"
        ? await prisma.planningDriver.findMany({ where: { modelId, category: { in: ["WORKFORCE", "HC", "HEADCOUNT"] } } })
        : await prisma.planningDriver.findMany({ where: { modelId, category: cat } });

    return { modelId, category: cat, lineItems, drivers };
  }
}
