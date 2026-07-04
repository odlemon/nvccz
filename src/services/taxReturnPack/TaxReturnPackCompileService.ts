// @ts-nocheck
import { randomUUID } from "crypto";
import { prisma } from "../../utils/database";
import { TaxReturnPackAuditService } from "./TaxReturnPackAuditService";
import { TaxReturnPackLedgerIngestService } from "./TaxReturnPackLedgerIngestService";
import { TaxReturnPackPreflightService } from "./TaxReturnPackPreflightService";
import { TaxReturnPackProvisionService } from "./TaxReturnPackProvisionService";
import { TRP_AUDIT_EVENTS, TRP_PACK_STATUSES } from "./taxReturnPackSupport";

export class TaxReturnPackCompileService {
  static async compile(packId: string, userId: string) {
    const pack = await TaxReturnPackProvisionService.getDetail(packId);
    if (![TRP_PACK_STATUSES.DRAFT, TRP_PACK_STATUSES.COMPILING, TRP_PACK_STATUSES.DRAFT_REVIEW, TRP_PACK_STATUSES.FAILED].includes(pack.status)) {
      throw Object.assign(new Error(`Cannot compile pack in status ${pack.status}`), { statusCode: 400 });
    }
    if (pack.lockedAt) {
      throw Object.assign(new Error("Pack is locked"), { statusCode: 400 });
    }

    await prisma.taxReturnPack.update({
      where: { id: packId },
      data: { status: TRP_PACK_STATUSES.COMPILING, failureReason: null },
    });

    await TaxReturnPackAuditService.log(packId, TRP_AUDIT_EVENTS.COMPILE_STARTED, userId);

    try {
      await TaxReturnPackPreflightService.assertReady(pack.periodStart, pack.periodEnd, pack.fundId);

      const entity = await prisma.forecastEntity.findUnique({
        where: { id: pack.forecastEntityId },
        select: { type: true, portfolioCompanyId: true },
      });
      if (!entity) throw new Error("Forecast entity not found");

      const ingest = await TaxReturnPackLedgerIngestService.ingestForPack({
        id: packId,
        periodStart: pack.periodStart,
        periodEnd: pack.periodEnd,
        baseCurrency: pack.baseCurrency,
        forecastEntity: entity,
      });

      await prisma.taxReturnPackReconciliationLine.deleteMany({ where: { packId } });
      await prisma.taxReturnPackCgtLine.deleteMany({ where: { packId } });

      if (ingest.citResult?.lines?.length) {
        await prisma.taxReturnPackReconciliationLine.createMany({
          data: ingest.citResult.lines.map((l) => ({
            id: randomUUID(),
            packId,
            lineCode: l.lineCode,
            lineLabel: l.lineLabel,
            accountNo: l.accountNo,
            glBalance: l.glBalance,
            taxAdjustment: l.taxAdjustment,
            taxCategory: l.taxCategory,
            currencyCode: l.currencyCode,
            journalLineRefs: l.journalLineRefs ?? undefined,
            displayOrder: l.displayOrder,
          })),
        });
      }

      if (ingest.cgtLines.length) {
        await prisma.taxReturnPackCgtLine.createMany({
          data: ingest.cgtLines.map((l) => ({
            id: randomUUID(),
            packId,
            assetRef: l.assetRef,
            sourceType: l.sourceType,
            sourceId: l.sourceId,
            salePrice: l.salePrice,
            costOriginal: l.costOriginal,
            holdingYears: l.holdingYears,
            costAdjusted: l.costAdjusted,
            capitalGain: l.capitalGain,
            cgtRate: l.cgtRate,
            cgtLiability: l.cgtLiability,
            currencyCode: l.currencyCode,
            acquiredAt: l.acquiredAt,
            disposedAt: l.disposedAt,
          })),
        });
      }

      const liabilitySnapshot = {
        cit: ingest.citResult,
        cgtTotal: ingest.cgtTotal,
        closingFxRate: ingest.closingRate,
        weightedEtr: ingest.weightedEtr,
      };

      await prisma.taxReturnPack.update({
        where: { id: packId },
        data: {
          status: TRP_PACK_STATUSES.DRAFT_REVIEW,
          accountingProfit: ingest.citResult?.accountingProfit ?? 0,
          taxableIncome: ingest.citResult?.taxableIncome ?? 0,
          citLiability: ingest.citResult?.citLiability ?? 0,
          cgtLiability: ingest.cgtTotal,
          totalTaxLiability: ingest.totalTax,
          citLiabilityUsd: ingest.citResult?.citLiabilityUsd ?? 0,
          citLiabilityZig: ingest.citResult?.citLiabilityZig ?? 0,
          weightedEtr: ingest.weightedEtr,
          closingFxRate: ingest.closingRate,
          liabilitySnapshot,
          compiledById: userId,
          compiledAt: new Date(),
          failureReason: null,
        },
      });

      await TaxReturnPackAuditService.log(packId, TRP_AUDIT_EVENTS.COMPILED, userId, {
        citLiability: ingest.citResult?.citLiability,
        cgtLiability: ingest.cgtTotal,
        reconciliationLineCount: ingest.citResult?.lines?.length ?? 0,
        cgtLineCount: ingest.cgtLines.length,
      });

      return TaxReturnPackProvisionService.getDetail(packId);
    } catch (e: any) {
      await prisma.taxReturnPack.update({
        where: { id: packId },
        data: {
          status: TRP_PACK_STATUSES.FAILED,
          failureReason: String(e?.message || e),
        },
      });
      await TaxReturnPackAuditService.log(packId, TRP_AUDIT_EVENTS.COMPILE_FAILED, userId, {
        error: String(e?.message || e),
        blockers: e?.blockers,
      });
      throw e;
    }
  }
}
