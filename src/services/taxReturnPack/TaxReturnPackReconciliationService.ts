// @ts-nocheck
import { randomUUID } from "crypto";
import { prisma } from "../../utils/database";
import { TaxReturnPackAuditService } from "./TaxReturnPackAuditService";
import { TaxReturnPackCitEngine } from "./TaxReturnPackCitEngine";
import { TaxReturnPackDualCurrencyService } from "./TaxReturnPackDualCurrencyService";
import { TaxReturnPackProvisionService } from "./TaxReturnPackProvisionService";
import { TRP_AUDIT_EVENTS, TRP_PACK_STATUSES, TRP_TAX_CATEGORIES } from "./taxReturnPackSupport";

export class TaxReturnPackReconciliationService {
  static async list(packId: string) {
    return prisma.taxReturnPackReconciliationLine.findMany({
      where: { packId },
      orderBy: { displayOrder: "asc" },
    });
  }

  static async overrideLine(
    packId: string,
    lineId: string,
    userId: string,
    input: { taxCategory: string; reason?: string }
  ) {
    const pack = await TaxReturnPackProvisionService.getDetail(packId);
    if (pack.status === TRP_PACK_STATUSES.SIGNED_OFF || pack.lockedAt) {
      throw Object.assign(new Error("Cannot modify a signed-off tax pack"), { statusCode: 400 });
    }

    const line = pack.reconciliationLines.find((l) => l.id === lineId);
    if (!line) throw Object.assign(new Error("Reconciliation line not found"), { statusCode: 404 });

    const newCategory = String(input.taxCategory || "").toUpperCase();
    if (!Object.values(TRP_TAX_CATEGORIES).includes(newCategory)) {
      throw Object.assign(new Error("Invalid tax category"), { statusCode: 400 });
    }

    const priorCategory = line.taxCategory;
    const taxAdjustment = TaxReturnPackCitEngine.computeTaxAdjustment(Number(line.glBalance), newCategory);

    await prisma.$transaction([
      prisma.taxReturnPackReconciliationLine.update({
        where: { id: lineId },
        data: { taxCategory: newCategory, taxAdjustment },
      }),
      prisma.taxReturnPackLineOverride.create({
        data: {
          id: randomUUID(),
          packId,
          reconciliationLineId: lineId,
          priorTaxCategory: priorCategory,
          newTaxCategory: newCategory,
          reason: input.reason ?? null,
          overriddenById: userId,
        },
      }),
    ]);

    await TaxReturnPackReconciliationService.recalculatePackTotals(packId);

    await TaxReturnPackAuditService.log(packId, TRP_AUDIT_EVENTS.LINE_OVERRIDE, userId, {
      lineId,
      priorTaxCategory: priorCategory,
      newTaxCategory: newCategory,
    });

    return prisma.taxReturnPackReconciliationLine.findUnique({ where: { id: lineId } });
  }

  static async recalculatePackTotals(packId: string) {
    const pack = await TaxReturnPackProvisionService.getDetail(packId);
    const bookLine = pack.reconciliationLines.find((l) => l.lineCode === "NET_INCOME_BOOK");
    const accountingProfit = bookLine ? Number(bookLine.glBalance) : Number(pack.accountingProfit ?? 0);

    const expenseLines = pack.reconciliationLines
      .filter((l) => l.lineCode !== "NET_INCOME_BOOK")
      .map((l) => ({
        lineCode: l.lineCode,
        lineLabel: l.lineLabel,
        accountNo: l.accountNo,
        glBalance: Number(l.glBalance),
        taxCategory: l.taxCategory,
        currencyCode: l.currencyCode,
        displayOrder: l.displayOrder,
      }));

    const citResult = TaxReturnPackCitEngine.compute({
      accountingProfit,
      expenseLines,
      bookCurrency: pack.baseCurrency,
    });

    const cgtTotal = Number(pack.cgtLiability ?? 0);
    const closingRate =
      pack.closingFxRate != null
        ? Number(pack.closingFxRate)
        : await TaxReturnPackDualCurrencyService.closingUsdZigRate(pack.periodEnd);

    const weightedEtr = TaxReturnPackDualCurrencyService.computeWeightedEtr({
      taxableIncomeUsd: citResult.taxableIncomeUsd,
      taxableIncomeZig: citResult.taxableIncomeZig,
      taxPaidUsd: citResult.citLiabilityUsd,
      taxPaidZig: citResult.citLiabilityZig,
      closingRate,
    });

    await prisma.taxReturnPack.update({
      where: { id: packId },
      data: {
        accountingProfit: citResult.accountingProfit,
        taxableIncome: citResult.taxableIncome,
        citLiability: citResult.citLiability,
        totalTaxLiability: citResult.citLiability + cgtTotal,
        citLiabilityUsd: citResult.citLiabilityUsd,
        citLiabilityZig: citResult.citLiabilityZig,
        weightedEtr,
        closingFxRate: closingRate,
        liabilitySnapshot: {
          cit: citResult,
          cgtTotal,
          closingFxRate: closingRate,
          weightedEtr,
        },
      },
    });
  }
}
