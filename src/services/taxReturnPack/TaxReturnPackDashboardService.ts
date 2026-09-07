// @ts-nocheck
import { TaxReturnPackPreflightService } from "./TaxReturnPackPreflightService";
import { TaxReturnPackProvisionService } from "./TaxReturnPackProvisionService";
import { TRP_PACK_STATUSES } from "./taxReturnPackSupport";

export class TaxReturnPackDashboardService {
  static async build(packId: string) {
    const pack = await TaxReturnPackProvisionService.getDetail(packId);
    const blockers = await TaxReturnPackPreflightService.collectBlockers(
      pack.periodStart,
      pack.periodEnd,
      pack.fundId
    );

    const glSyncOk = blockers.length === 0;
    const canSignOff =
      pack.status === TRP_PACK_STATUSES.DRAFT_REVIEW &&
      !pack.lockedAt;

    return {
      packId: pack.id,
      status: pack.status,
      entity: pack.forecastEntity,
      fund: pack.fund,
      taxYear: pack.taxYear,
      taxPeriod: pack.taxPeriod,
      periodStart: pack.periodStart,
      periodEnd: pack.periodEnd,
      baseCurrency: pack.baseCurrency,
      summary: {
        accountingProfit: pack.accountingProfit,
        taxableIncome: pack.taxableIncome,
        citLiability: pack.citLiability,
        cgtLiability: pack.cgtLiability,
        totalTaxLiability: pack.totalTaxLiability,
        citLiabilityUsd: pack.citLiabilityUsd,
        citLiabilityZig: pack.citLiabilityZig,
        weightedEtr: pack.weightedEtr,
        closingFxRate: pack.closingFxRate,
        vatOutputTax: pack.vatOutputTax,
        vatInputTax: pack.vatInputTax,
        vatNetPayable: pack.vatNetPayable,
      },
      reconciliationLineCount: pack.reconciliationLines.length,
      cgtLineCount: pack.cgtLines.length,
      glSyncBadge: glSyncOk ? "SYNCED" : "BLOCKED",
      blockers,
      canCompile: !pack.lockedAt && pack.status !== TRP_PACK_STATUSES.SIGNED_OFF,
      canSignOff,
      compiledById: pack.compiledById,
      approvedById: pack.approvedById,
      packPdfSha256: pack.packPdfSha256,
      lockedAt: pack.lockedAt,
    };
  }
}
