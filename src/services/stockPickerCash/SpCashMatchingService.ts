// @ts-nocheck
import { Decimal } from "@prisma/client/runtime/library";
import { InvestmentOpsError } from "../../middleware/investmentOpsFoundation";
import {
  assertMakerNotChecker,
  assertVersion,
  d,
  db,
  emitCash,
  moneyStr,
  paginated,
  parseDateOnly,
  parsePagination,
  requireStr,
  withIdempotency,
} from "./spCashSupport";

const DEFAULT_WEIGHTS = {
  amountWeight: 0.5,
  dateWeight: 0.2,
  referenceWeight: 0.2,
  counterpartyWeight: 0.1,
  autoMatchThreshold: 0.95,
  suggestThreshold: 0.7,
  weakThreshold: 0.5,
  dateToleranceDays: 2,
  amountTolerance: 0.01,
};

async function activeWeights(asOf = new Date()) {
  const policy = await db.spCashMatchWeightPolicy.findFirst({
    where: {
      status: "ACTIVE",
      effectiveFrom: { lte: asOf },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }],
    },
    orderBy: { version: "desc" },
  });
  const tol = await db.spCashTolerancePolicy.findFirst({
    where: {
      status: "ACTIVE",
      effectiveFrom: { lte: asOf },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }],
    },
    orderBy: { version: "desc" },
  });
  if (!policy) return { ...DEFAULT_WEIGHTS, ...(tol ? { dateToleranceDays: tol.dateToleranceDays, amountTolerance: Number(tol.amountTolerance) } : {}) };
  return {
    amountWeight: Number(policy.amountWeight),
    dateWeight: Number(policy.dateWeight),
    referenceWeight: Number(policy.referenceWeight),
    counterpartyWeight: Number(policy.counterpartyWeight),
    autoMatchThreshold: Number(policy.autoMatchThreshold),
    suggestThreshold: Number(policy.suggestThreshold),
    weakThreshold: Number(policy.weakThreshold),
    dateToleranceDays: tol?.dateToleranceDays ?? DEFAULT_WEIGHTS.dateToleranceDays,
    amountTolerance: tol ? Number(tol.amountTolerance) : DEFAULT_WEIGHTS.amountTolerance,
    policyId: policy.id,
    code: policy.code,
    version: policy.version,
  };
}

function daysBetween(a?: Date | null, b?: Date | null): number | null {
  if (!a || !b) return null;
  return Math.abs(Math.round((a.getTime() - b.getTime()) / 86400000));
}

function scorePair(internal: any, external: any, weights: any) {
  const iAmt = d(internal.signedCashAmount);
  const eAmt = d(external.signedCashAmount);
  const amtDiff = iAmt.minus(eAmt).abs();
  const tol = d(weights.amountTolerance || 0.01);
  const amountScore = amtDiff.lte(tol)
    ? 1
    : amtDiff.div(Decimal.max(iAmt.abs(), eAmt.abs(), new Decimal(1))).gte(1)
      ? 0
      : Math.max(0, 1 - Number(amtDiff.div(Decimal.max(iAmt.abs(), eAmt.abs(), new Decimal(1)))));

  const dd = daysBetween(internal.valueDate || internal.journal?.valueDate, external.valueDate);
  let dateScore = 0.5;
  if (dd != null) {
    dateScore = dd <= (weights.dateToleranceDays || 0) ? 1 : Math.max(0, 1 - dd / 10);
  }

  const iRef = String(internal.reference || internal.description || internal.journal?.sourceEventId || "").toLowerCase();
  const eRef = String(external.reference || "").toLowerCase();
  let refScore = 0.3;
  if (iRef && eRef) {
    refScore = iRef === eRef ? 1 : iRef.includes(eRef) || eRef.includes(iRef) ? 0.8 : 0.2;
  }

  const iCpty = String(internal.counterparty || "").toLowerCase();
  const eCpty = String(external.counterparty || "").toLowerCase();
  let cptyScore = 0.5;
  if (iCpty && eCpty) {
    cptyScore = iCpty === eCpty ? 1 : iCpty.includes(eCpty) || eCpty.includes(iCpty) ? 0.75 : 0.2;
  }

  // Hard rule: currency must match
  if (
    internal.currency &&
    external.currency &&
    String(internal.currency).toUpperCase() !== String(external.currency).toUpperCase()
  ) {
    return {
      ok: false,
      code: "HARD_RULE_FAILED",
      reason: "Currency mismatch",
      hardFailures: ["CURRENCY_MISMATCH"],
      scoreTotal: 0,
      scoreComponents: {
        amount: 0,
        date: 0,
        reference: 0,
        counterparty: 0,
        weights: {
          amount: weights.amountWeight,
          date: weights.dateWeight,
          reference: weights.referenceWeight,
          counterparty: weights.counterpartyWeight,
        },
      },
    };
  }

  // Hard rule: signs must agree within tolerance of absolute amounts when both non-zero
  if (!iAmt.isZero() && !eAmt.isZero() && iAmt.isNegative() !== eAmt.isNegative()) {
    return {
      ok: false,
      code: "HARD_RULE_FAILED",
      reason: "Sign mismatch",
      hardFailures: ["SIGN_MISMATCH"],
      scoreTotal: 0,
      scoreComponents: {
        amount: amountScore,
        date: dateScore,
        reference: refScore,
        counterparty: cptyScore,
        weights: {
          amount: weights.amountWeight,
          date: weights.dateWeight,
          reference: weights.referenceWeight,
          counterparty: weights.counterpartyWeight,
        },
      },
    };
  }

  const scoreTotal =
    amountScore * weights.amountWeight +
    dateScore * weights.dateWeight +
    refScore * weights.referenceWeight +
    cptyScore * weights.counterpartyWeight;

  return {
    ok: true,
    scoreTotal,
    scoreComponents: {
      amount: amountScore,
      date: dateScore,
      reference: refScore,
      counterparty: cptyScore,
      // BA-R2: expose SRD weights (0.5 / 0.2 / 0.2 / 0.1) and weighted contributions
      weights: {
        amount: weights.amountWeight,
        date: weights.dateWeight,
        reference: weights.referenceWeight,
        counterparty: weights.counterpartyWeight,
      },
      weighted: {
        amount: amountScore * weights.amountWeight,
        date: dateScore * weights.dateWeight,
        reference: refScore * weights.referenceWeight,
        counterparty: cptyScore * weights.counterpartyWeight,
      },
    },
    amountDiff: moneyStr(amtDiff),
  };
}

function presentBatch(row: any) {
  return {
    id: row.id,
    cashAccountId: row.cashAccountId,
    currency: row.currency,
    periodFrom: row.periodFrom,
    periodTo: row.periodTo,
    reconType: row.reconType,
    openingInternal: row.openingInternal != null ? moneyStr(row.openingInternal) : null,
    closingInternal: row.closingInternal != null ? moneyStr(row.closingInternal) : null,
    openingExternal: row.openingExternal != null ? moneyStr(row.openingExternal) : null,
    closingExternal: row.closingExternal != null ? moneyStr(row.closingExternal) : null,
    adjustedExternal: row.adjustedExternal != null ? moneyStr(row.adjustedExternal) : null,
    variance: row.variance != null ? moneyStr(row.variance) : null,
    toleranceAmount: row.toleranceAmount != null ? moneyStr(row.toleranceAmount) : null,
    status: row.status,
    autoMatchEnabled: row.autoMatchEnabled,
    fundId: row.fundId,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function presentLink(row: any) {
  return {
    id: row.id,
    linkId: row.id,
    batchId: row.batchId,
    internalLineId: row.internalLineId,
    externalLineId: row.externalLineId,
    matchedAmount: moneyStr(row.matchedAmount),
    topology: row.topology,
    scoreTotal: row.scoreTotal != null ? Number(row.scoreTotal) : null,
    scoreComponents: row.scoreComponentsJson,
    method: row.method,
    status: row.status,
    makerId: row.makerId,
    checkerId: row.checkerId,
    version: row.version,
    createdAt: row.createdAt,
  };
}

export class SpCashMatchingService {
  static async activeRules() {
    const weights = await activeWeights();
    return {
      matchWeightPolicy: weights,
      hardRules: [
        "CURRENCY_MUST_MATCH",
        "SIGN_MUST_AGREE",
        "SAME_CASH_ACCOUNT",
      ],
      scoring: {
        amount: weights.amountWeight,
        date: weights.dateWeight,
        reference: weights.referenceWeight,
        counterparty: weights.counterpartyWeight,
      },
      thresholds: {
        autoMatch: weights.autoMatchThreshold,
        suggest: weights.suggestThreshold,
        weak: weights.weakThreshold,
      },
    };
  }

  static async createBatch(body: any, actorId: string, idempotencyKey?: string, tx?: any) {
    const client = tx || db;
    const data = {
      cashAccountId: requireStr(body.cashAccountId, "cashAccountId"),
      currency: requireStr(body.currency, "currency").toUpperCase(),
      periodFrom: parseDateOnly(body.periodFrom, "periodFrom") || new Date(),
      periodTo: parseDateOnly(body.periodTo, "periodTo") || new Date(),
      reconType: requireStr(body.reconType || "CASH_STATEMENT", "reconType"),
    };

    const createFn = async () => {
      const created = await client.spCashReconciliationBatch.create({
        data: {
          ...data,
          autoMatchEnabled: body.autoMatchEnabled !== false,
          fundId: body.fundId || null,
          status: "OPEN",
          makerId: actorId,
          toleranceAmount: body.toleranceAmount != null ? d(body.toleranceAmount) : null,
          version: 1,
        },
      });
      await emitCash({
        eventType: "cash.recon.batch.created",
        aggregateType: "SpCashReconciliationBatch",
        aggregateId: created.id,
        aggregateVersion: 1,
        actorId,
        tx: client === db ? undefined : client,
      });
      return presentBatch(created);
    };

    if (tx) return createFn();
    return withIdempotency(
      "sp-cash:recon-batch:create",
      idempotencyKey || body.idempotencyKey,
      data,
      createFn,
      201
    );
  }

  static async list(query: any = {}) {
    const { page, pageSize, skip, take } = parsePagination(query);
    const where: any = {};
    if (query.cashAccountId) where.cashAccountId = String(query.cashAccountId);
    if (query.status) where.status = String(query.status);
    if (query.fundId) where.fundId = String(query.fundId);
    const [items, total] = await Promise.all([
      db.spCashReconciliationBatch.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      db.spCashReconciliationBatch.count({ where }),
    ]);
    return paginated(items.map(presentBatch), total, page, pageSize);
  }

  static async get(id: string) {
    const row = await db.spCashReconciliationBatch.findUnique({ where: { id } });
    if (!row) throw new InvestmentOpsError("NOT_FOUND", "Batch not found", 404);
    return presentBatch(row);
  }

  static async run(id: string, body: any = {}, actorId: string, tx?: any) {
    const client = tx || db;
    const batch = await client.spCashReconciliationBatch.findUnique({ where: { id } });
    if (!batch) throw new InvestmentOpsError("NOT_FOUND", "Batch not found", 404);

    const internalLines = await client.spCashJournalLine.findMany({
      where: {
        cashAccountId: batch.cashAccountId,
        OR: [
          { matchStatus: null },
          { matchStatus: { in: ["UNMATCHED", "PARTIAL", "SUGGESTED"] } },
        ],
        journal: {
          status: "POSTED",
          currency: batch.currency,
          OR: [
            { valueDate: { gte: batch.periodFrom, lte: batch.periodTo } },
            { valueDate: null },
          ],
        },
      },
      include: { journal: true },
    });

    const externalLines = await client.spCashExternalStatementLine.findMany({
      where: {
        OR: [
          { matchStatus: null },
          { matchStatus: { in: ["UNMATCHED", "PARTIAL", "SUGGESTED"] } },
        ],
        statement: {
          cashAccountId: batch.cashAccountId,
          currency: batch.currency,
          periodFrom: { lte: batch.periodTo },
          periodTo: { gte: batch.periodFrom },
        },
      },
      include: { statement: true },
    });

    let openingInternal = new Decimal(0);
    let closingInternal = new Decimal(0);
    for (const l of internalLines) {
      closingInternal = closingInternal.plus(d(l.signedCashAmount));
    }
    let openingExternal = new Decimal(0);
    let closingExternal = new Decimal(0);
    const stmts = await client.spCashExternalStatement.findMany({
      where: {
        cashAccountId: batch.cashAccountId,
        currency: batch.currency,
        periodFrom: { lte: batch.periodTo },
        periodTo: { gte: batch.periodFrom },
      },
    });
    for (const s of stmts) {
      openingExternal = openingExternal.plus(d(s.openingBalance));
      closingExternal = closingExternal.plus(d(s.closingBalance));
    }

    const variance = closingInternal.minus(closingExternal);
    const updated = await client.spCashReconciliationBatch.update({
      where: { id },
      data: {
        openingInternal,
        closingInternal,
        openingExternal,
        closingExternal,
        variance,
        status: "RUNNING",
        version: { increment: 1 },
      },
    });

    if (batch.autoMatchEnabled && body.autoMatch !== false) {
      await this.autoMatch(id, {}, actorId, client);
    }

    const done = await client.spCashReconciliationBatch.update({
      where: { id },
      data: { status: "READY", version: { increment: 1 } },
    });
    return presentBatch(done);
  }

  static async autoMatch(id: string, body: any, actorId: string, tx?: any) {
    const client = tx || db;
    const batch = await client.spCashReconciliationBatch.findUnique({ where: { id } });
    if (!batch) throw new InvestmentOpsError("NOT_FOUND", "Batch not found", 404);
    const weights = await activeWeights();

    const internalLines = await client.spCashJournalLine.findMany({
      where: {
        cashAccountId: batch.cashAccountId,
        OR: [
          { matchStatus: null },
          { matchStatus: { in: ["UNMATCHED", "PARTIAL", "SUGGESTED"] } },
        ],
        journal: {
          status: "POSTED",
          currency: batch.currency,
          OR: [
            { valueDate: { gte: batch.periodFrom, lte: batch.periodTo } },
            { valueDate: null },
          ],
        },
      },
      include: { journal: true },
    });
    const externalLines = await client.spCashExternalStatementLine.findMany({
      where: {
        OR: [
          { matchStatus: null },
          { matchStatus: { in: ["UNMATCHED", "PARTIAL", "SUGGESTED"] } },
        ],
        residualAmount: { not: 0 },
        statement: { cashAccountId: batch.cashAccountId, currency: batch.currency },
      },
    });

    let matched = 0;
    const usedExt = new Set<string>();
    const usedInt = new Set<string>();

    for (const intl of internalLines) {
      if (usedInt.has(intl.id)) continue;
      const candidates: any[] = [];
      for (const ext of externalLines) {
        if (usedExt.has(ext.id)) continue;
        const scored = scorePair(
          { ...intl, valueDate: intl.journal?.valueDate, reference: intl.description },
          ext,
          weights
        );
        if (!scored.ok) continue;
        if (scored.scoreTotal >= weights.suggestThreshold) {
          candidates.push({ ext, scored });
        }
      }
      candidates.sort((a, b) => b.scored.scoreTotal - a.scored.scoreTotal);
      if (candidates.length >= 2) {
        const top = candidates[0].scored.scoreTotal;
        const second = candidates[1].scored.scoreTotal;
        if (Math.abs(top - second) < 0.02 && top >= weights.autoMatchThreshold) {
          await client.spCashReconciliationBreak.create({
            data: {
              batchId: id,
              breakCode: "COMPETING_CANDIDATES",
              category: "MATCH_AMBIGUITY",
              valueDate: intl.journal?.valueDate || null,
              details: `Competing candidates for internal line ${intl.id}`,
              amount: d(intl.signedCashAmount).abs(),
              currency: batch.currency,
              status: "OPEN",
              internalLineId: intl.id,
              externalLineId: candidates[0].ext.id,
            },
          });
          continue;
        }
      }
      const best = candidates[0];
      if (!best || best.scored.scoreTotal < weights.autoMatchThreshold) continue;

      const matchAmt = Decimal.min(d(intl.signedCashAmount).abs(), d(best.ext.residualAmount ?? best.ext.signedCashAmount).abs());
      const link = await client.spCashMatchLink.create({
        data: {
          batchId: id,
          internalLineId: intl.id,
          externalLineId: best.ext.id,
          matchedAmount: matchAmt,
          topology: "ONE_TO_ONE",
          scoreTotal: best.scored.scoreTotal,
          scoreComponentsJson: best.scored.scoreComponents,
          method: "AUTO",
          status: "CONFIRMED",
          makerId: actorId,
          checkerId: actorId,
          version: 1,
        },
      });

      const iResidual = d(intl.signedCashAmount).abs().minus(matchAmt);
      const eResidual = d(best.ext.residualAmount ?? best.ext.signedCashAmount).abs().minus(matchAmt);
      await client.spCashJournalLine.update({
        where: { id: intl.id },
        data: {
          matchStatus: iResidual.gt(0.000001) ? "PARTIAL" : "MATCHED",
          residualAmount: iResidual.gt(0) ? iResidual : new Decimal(0),
        },
      });
      await client.spCashExternalStatementLine.update({
        where: { id: best.ext.id },
        data: {
          matchStatus: eResidual.gt(0.000001) ? "PARTIAL" : "MATCHED",
          residualAmount: eResidual.gt(0) ? eResidual : new Decimal(0),
        },
      });

      const amtVar = d(intl.signedCashAmount).abs().minus(d(best.ext.signedCashAmount).abs()).abs();
      if (amtVar.gt(d(weights.amountTolerance || 0.01))) {
        await client.spCashReconciliationBreak.create({
          data: {
            batchId: id,
            breakCode: "AMOUNT_VARIANCE",
            category: "AMOUNT",
            valueDate: intl.journal?.valueDate || null,
            details: `Amount variance ${moneyStr(amtVar)} on match ${link.id}`,
            amount: amtVar,
            currency: batch.currency,
            status: "OPEN",
            internalLineId: intl.id,
            externalLineId: best.ext.id,
          },
        });
      }

      usedInt.add(intl.id);
      usedExt.add(best.ext.id);
      matched += 1;
    }

    return { batchId: id, matchedCount: matched };
  }

  static async workspace(id: string) {
    const batch = await db.spCashReconciliationBatch.findUnique({ where: { id } });
    if (!batch) throw new InvestmentOpsError("NOT_FOUND", "Batch not found", 404);

    const internal = await db.spCashJournalLine.findMany({
      where: {
        cashAccountId: batch.cashAccountId,
        journal: {
          status: "POSTED",
          currency: batch.currency,
          valueDate: { gte: batch.periodFrom, lte: batch.periodTo },
        },
      },
      include: { journal: true },
      take: 500,
    });
    const external = await db.spCashExternalStatementLine.findMany({
      where: {
        statement: {
          cashAccountId: batch.cashAccountId,
          currency: batch.currency,
        },
      },
      take: 500,
    });
    const breaks = await db.spCashReconciliationBreak.findMany({
      where: { batchId: id },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const links = await db.spCashMatchLink.findMany({
      where: { batchId: id, status: { in: ["CONFIRMED", "PROPOSED"] } },
      take: 500,
    });
    const weights = await activeWeights();

    // Suggestions for unmatched
    const suggestions: any[] = [];
    const unmatchedInt = internal.filter((l: any) => !["MATCHED"].includes(String(l.matchStatus)));
    const unmatchedExt = external.filter((l: any) => !["MATCHED"].includes(String(l.matchStatus)));
    for (const intl of unmatchedInt.slice(0, 50)) {
      for (const ext of unmatchedExt.slice(0, 50)) {
        const scored = scorePair(
          { ...intl, valueDate: intl.journal?.valueDate, reference: intl.description },
          ext,
          weights
        );
        if (scored.ok && scored.scoreTotal >= weights.suggestThreshold) {
          suggestions.push({
            suggestionId: `sug_${intl.id}_${ext.id}`,
            internalLineId: intl.id,
            externalLineId: ext.id,
            reason: scored.scoreTotal >= weights.autoMatchThreshold ? "High confidence match" : "Suggested match",
            confidence: Number(scored.scoreTotal.toFixed?.(4) ?? scored.scoreTotal),
            scoreTotal: Number(scored.scoreTotal.toFixed?.(4) ?? scored.scoreTotal),
            scoreComponents: {
              ...(scored.scoreComponents || {}),
              weights: {
                amount: weights.amountWeight,
                date: weights.dateWeight,
                reference: weights.referenceWeight,
                counterparty: weights.counterpartyWeight,
              },
            },
            hardRuleFailures: scored.hardFailures || scored.failures || [],
          });
        }
      }
    }
    suggestions.sort((a, b) => b.confidence - a.confidence);

    const iTotal = unmatchedInt.reduce((s: Decimal, l: any) => s.plus(d(l.signedCashAmount)), new Decimal(0));
    const eTotal = unmatchedExt.reduce((s: Decimal, l: any) => s.plus(d(l.signedCashAmount)), new Decimal(0));

    const mapInternal = (l: any) => ({
      id: l.id,
      lineId: l.id,
      valueDate: l.journal?.valueDate,
      description: l.description,
      signedCashAmount: moneyStr(l.signedCashAmount),
      matchStatus: l.matchStatus,
      residualAmount: l.residualAmount != null ? moneyStr(l.residualAmount) : null,
    });
    const mapExternal = (l: any) => ({
      id: l.id,
      lineId: l.id,
      valueDate: l.valueDate,
      description: l.reference,
      signedCashAmount: moneyStr(l.signedCashAmount),
      matchStatus: l.matchStatus,
      residualAmount: l.residualAmount != null ? moneyStr(l.residualAmount) : null,
    });
    const matchItems = links.map((l: any) => ({
      id: l.id,
      matchId: l.id,
      status: l.status,
      matchedAmount: l.matchedAmount != null ? moneyStr(l.matchedAmount) : null,
      internalLineId: l.internalLineId,
      externalLineId: l.externalLineId,
    }));
    const breakItems = breaks.map((b: any) => ({
      id: b.id,
      breakId: b.id,
      valueDate: b.valueDate,
      type: b.breakCode,
      details: b.details,
      amount: b.amount != null ? moneyStr(b.amount) : null,
      status: b.status,
    }));

    return {
      batchId: id,
      // Nested panes (FE Fund Cash workspace)
      internal: {
        sourceLabel: "Arcus Internal Ledger",
        total: moneyStr(iTotal),
        currency: batch.currency,
        entries: unmatchedInt.map(mapInternal),
      },
      external: {
        sourceLabel: "External Statement",
        total: moneyStr(eTotal),
        currency: batch.currency,
        entries: unmatchedExt.map(mapExternal),
      },
      results: {
        matchedCount: links.filter((l: any) => l.status === "CONFIRMED").length,
        breaksCount: breaks.filter((b: any) => b.status === "OPEN" || b.status === "UNRECONCILED").length,
        unmatchedCount: unmatchedInt.length + unmatchedExt.length,
        activeTab: "BREAKS",
        items: [...breakItems, ...matchItems],
      },
      suggestions: suggestions.slice(0, 50),
      // Flat aliases (legacy adapters)
      unmatchedInternal: unmatchedInt.map(mapInternal),
      unmatchedExternal: unmatchedExt.map(mapExternal),
      matches: matchItems,
      breaks: breakItems,
      suggested: suggestions.slice(0, 50),
    };
  }

  static async summary(id: string) {
    const batch = await db.spCashReconciliationBatch.findUnique({ where: { id } });
    if (!batch) throw new InvestmentOpsError("NOT_FOUND", "Batch not found", 404);
    const openBreaks = await db.spCashReconciliationBreak.count({
      where: { batchId: id, status: { in: ["OPEN", "UNRECONCILED"] } },
    });
    const breakRows = await db.spCashReconciliationBreak.findMany({
      where: { batchId: id, status: { in: ["OPEN", "UNRECONCILED"] } },
    });
    let unreconciledValue = new Decimal(0);
    for (const b of breakRows) unreconciledValue = unreconciledValue.plus(d(b.amount ?? 0).abs());

    const links = await db.spCashMatchLink.count({
      where: { batchId: id, status: "CONFIRMED" },
    });
    const iCount = await db.spCashJournalLine.count({
      where: {
        cashAccountId: batch.cashAccountId,
        journal: { status: "POSTED", currency: batch.currency },
      },
    });
    const reconciledPct = iCount ? Math.round((links / iCount) * 10000) / 100 : 0;

    return {
      asAt: batch.periodTo,
      fundId: batch.fundId,
      cashAccountId: batch.cashAccountId,
      currency: batch.currency,
      fundsReconciled: { done: links, total: iCount, pct: reconciledPct },
      openBreaks: { count: openBreaks, trendVsYesterday: null },
      unreconciledValue: {
        amount: moneyStr(unreconciledValue),
        currency: batch.currency,
        trendPct: null,
      },
      awaitingBankStatements: { count: 0, value: "0.00" },
      reconciledPctByValue: { pct: reconciledPct, trendPp: null },
      lastReconciledAt: batch.updatedAt,
      autoMatchEnabled: batch.autoMatchEnabled,
      variance: batch.variance != null ? moneyStr(batch.variance) : null,
    };
  }

  /** Fund cash summary KPIs across accounts/batches. */
  static async fundCashSummary(query: any = {}) {
    const where: any = {};
    if (query.fundId) where.fundId = String(query.fundId);
    if (query.cashAccountId) where.cashAccountId = String(query.cashAccountId);
    const batches = await db.spCashReconciliationBatch.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
    const asOf = query.asOf || new Date().toISOString().slice(0, 10);
    const fundId = query.fundId || batches[0]?.fundId || null;
    const cashAccountId = query.cashAccountId || batches[0]?.cashAccountId || null;
    const currency = query.currency || batches[0]?.currency || "USD";

    let totalCash = new Decimal(0);
    if (cashAccountId) {
      try {
        const { SpCashPositionService } = await import("./SpCashPositionService");
        const pos = await SpCashPositionService.compute({
          cashAccountId,
          currency,
          asOf,
          portfolioId: fundId || undefined,
        });
        totalCash = d(pos.postedSettledCash);
      } catch {
        /* leave 0 */
      }
    }

    if (!batches.length) {
      return {
        fundId,
        asOf,
        totalCash: moneyStr(totalCash),
        matchedCount: 0,
        unmatchedCount: 0,
        breakCount: 0,
        exceptionCount: 0,
        openBreaks: 0,
        matchRate: "100.00",
        currency,
        trendVsPrior7d: { matchRatePp: null },
        fundsReconciled: { done: 0, total: 0, pct: 0 },
        unreconciledValue: { amount: "0.00", currency },
        autoMatchEnabled: true,
      };
    }

    const batchSummary = await this.summary(batches[0].id);
    const batchId = batches[0].id;
    const matchedCount = await db.spCashMatchLink.count({
      where: { batchId, status: "CONFIRMED" },
    });
    const internalLines = await db.spCashJournalLine.count({
      where: {
        cashAccountId: batches[0].cashAccountId,
        journal: { status: "POSTED", currency: batches[0].currency },
      },
    });
    const unmatchedCount = Math.max(0, internalLines - matchedCount);
    const breakCount = Number(batchSummary.openBreaks?.count ?? 0);
    const exceptionCount = await db.spCashReconciliationException.count({
      where: {
        cashAccountId: batches[0].cashAccountId,
        status: { notIn: ["CLOSED", "REJECTED"] },
      },
    });
    const denom = matchedCount + unmatchedCount;
    const matchRate = denom ? ((matchedCount / denom) * 100).toFixed(2) : "100.00";

    return {
      fundId: batchSummary.fundId,
      asOf: batchSummary.asAt || asOf,
      totalCash: moneyStr(totalCash),
      matchedCount,
      unmatchedCount,
      breakCount,
      exceptionCount,
      openBreaks: breakCount,
      matchRate,
      currency: batchSummary.currency || currency,
      trendVsPrior7d: { matchRatePp: null },
      fundsReconciled: batchSummary.fundsReconciled,
      unreconciledValue: batchSummary.unreconciledValue,
      awaitingBankStatements: batchSummary.awaitingBankStatements,
      reconciledPctByValue: batchSummary.reconciledPctByValue,
      lastReconciledAt: batchSummary.lastReconciledAt,
      autoMatchEnabled: batchSummary.autoMatchEnabled,
      variance: batchSummary.variance,
      cashAccountId: batchSummary.cashAccountId,
    };
  }

  static async confirm(body: any, actorId: string) {
    // Normalize FE shapes: top-level single link, or links[]; resolve batchId if omitted.
    let links = Array.isArray(body.links) ? body.links : [];
    if (!links.length && (body.internalLineId || body.externalLineId || body.matchedAmount)) {
      links = [
        {
          internalLineId: body.internalLineId,
          externalLineId: body.externalLineId,
          matchedAmount: body.matchedAmount,
          topology: body.topology,
          scoreTotal: body.scoreTotal,
          scoreComponents: body.scoreComponents || body.scoreComponentsJson,
          evidenceRefs: body.evidenceRefs,
          internalExpectedVersion: body.internalExpectedVersion,
          externalExpectedVersion: body.externalExpectedVersion,
          method: body.method,
          makerId: body.makerId,
        },
      ];
    }
    if (!links.length) {
      throw new InvestmentOpsError(
        "VALIDATION_ERROR",
        "links required (or internalLineId/externalLineId + matchedAmount)",
        400
      );
    }

    let batchId = body.batchId ? String(body.batchId) : null;
    if (!batchId && body.cashAccountId) {
      const batch = await db.spCashReconciliationBatch.findFirst({
        where: { cashAccountId: String(body.cashAccountId) },
        orderBy: { updatedAt: "desc" },
      });
      batchId = batch?.id || null;
    }
    if (!batchId && links[0]?.internalLineId) {
      const il = await db.spCashJournalLine.findUnique({
        where: { id: String(links[0].internalLineId) },
        select: { cashAccountId: true, currency: true },
      });
      if (il?.cashAccountId) {
        const batch = await db.spCashReconciliationBatch.findFirst({
          where: {
            cashAccountId: il.cashAccountId,
            ...(il.currency ? { currency: il.currency } : {}),
          },
          orderBy: { updatedAt: "desc" },
        });
        batchId = batch?.id || null;
        if (!batchId) {
          const today = new Date();
          const created = await db.spCashReconciliationBatch.create({
            data: {
              cashAccountId: il.cashAccountId,
              currency: il.currency || body.currency || "USD",
              periodFrom: new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)),
              periodTo: today,
              reconType: "MANUAL_MATCH",
              status: "OPEN",
              version: 1,
            },
          });
          batchId = created.id;
        }
      }
    }
    if (!batchId) {
      throw new InvestmentOpsError(
        "VALIDATION_ERROR",
        "batchId is required (or provide cashAccountId / internalLineId to resolve)",
        400,
        { field: "batchId" }
      );
    }

    const result = await db.$transaction(
      async (tx: any) => {
        const created = [];
        for (const link of links) {
          const matchAmt = d(requireStr(link.matchedAmount ?? body.matchedAmount, "matchedAmount"));
          const topology = body.topology || link.topology || "ONE_TO_ONE";

          if (link.internalExpectedVersion != null && link.internalLineId) {
            const il = await tx.spCashJournalLine.findUnique({
              where: { id: link.internalLineId },
            });
            if (il) assertVersion({ version: il.lineVersion }, link.internalExpectedVersion);
          }
          if (link.externalExpectedVersion != null && link.externalLineId) {
            const el = await tx.spCashExternalStatementLine.findUnique({
              where: { id: link.externalLineId },
            });
            if (el) assertVersion({ version: el.lineVersion }, link.externalExpectedVersion);
          }

          if (link.internalLineId && link.externalLineId) {
            const existing = await tx.spCashMatchLink.findFirst({
              where: {
                batchId,
                internalLineId: link.internalLineId,
                externalLineId: link.externalLineId,
                status: { in: ["CONFIRMED", "PROPOSED"] },
              },
              orderBy: { createdAt: "desc" },
            });
            if (existing) {
              created.push(presentLink(existing));
              continue;
            }
          }

          const row = await tx.spCashMatchLink.create({
            data: {
              batchId,
              internalLineId: link.internalLineId || null,
              externalLineId: link.externalLineId || null,
              matchedAmount: matchAmt,
              topology,
              scoreTotal: body.scoreTotal ?? link.scoreTotal ?? null,
              scoreComponentsJson: body.scoreComponents || link.scoreComponents || null,
              method: body.method || link.method || "MANUAL_CONFIRM",
              status: "CONFIRMED",
              makerId: body.makerId || link.makerId || null,
              checkerId: actorId,
              evidenceRefsJson: body.evidenceRefs || link.evidenceRefs || null,
              version: 1,
            },
          });

          if (link.internalLineId) {
            const il = await tx.spCashJournalLine.findUnique({
              where: { id: link.internalLineId },
            });
            if (il) {
              const base = d(il.residualAmount ?? il.signedCashAmount).abs();
              const residual = base.minus(matchAmt);
              await tx.spCashJournalLine.update({
                where: { id: il.id },
                data: {
                  matchStatus: residual.gt(0.000001) ? "PARTIAL" : "MATCHED",
                  residualAmount: Decimal.max(new Decimal(0), residual),
                  lineVersion: { increment: 1 },
                },
              });
            }
          }
          if (link.externalLineId) {
            const el = await tx.spCashExternalStatementLine.findUnique({
              where: { id: link.externalLineId },
            });
            if (el) {
              const base = d(el.residualAmount ?? el.signedCashAmount).abs();
              const residual = base.minus(matchAmt);
              await tx.spCashExternalStatementLine.update({
                where: { id: el.id },
                data: {
                  matchStatus: residual.gt(0.000001) ? "PARTIAL" : "MATCHED",
                  residualAmount: Decimal.max(new Decimal(0), residual),
                  lineVersion: { increment: 1 },
                },
              });
            }
          }
          created.push(presentLink(row));
        }
        return { batchId, links: created };
      },
      { maxWait: 15000, timeout: 30000 }
    );

    await emitCash({
      eventType: "cash.match.confirmed",
      aggregateType: "SpCashReconciliationBatch",
      aggregateId: batchId,
      aggregateVersion: 1,
      actorId,
      payload: { linkCount: result.links.length, method: body.method || "MANUAL_CONFIRM" },
    });
    return result;
  }

  static async manual(body: any, actorId: string) {
    return this.confirm({ ...body, method: body.method || "MANUAL" }, actorId);
  }

  static async resolveMatchLink(linkId: string, body?: any) {
    const id = String(linkId || body?.linkId || body?.matchId || "").trim();
    if (!id) {
      throw new InvestmentOpsError("VALIDATION_ERROR", "linkId is required", 400, { field: "linkId" });
    }
    let row = await db.spCashMatchLink.findUnique({ where: { id } });
    if (row) return row;

    // Suggestion ids look like sug_<internalCuid>_<externalCuid>
    if (id.startsWith("sug_")) {
      const payload = id.slice(4);
      const idx = payload.lastIndexOf("_");
      if (idx > 0) {
        const internalLineId = payload.slice(0, idx);
        const externalLineId = payload.slice(idx + 1);
        row = await db.spCashMatchLink.findFirst({
          where: {
            internalLineId,
            externalLineId,
            status: { in: ["CONFIRMED", "PROPOSED"] },
          },
          orderBy: { createdAt: "desc" },
        });
        if (row) return row;
      }
    }

    if (body?.internalLineId && body?.externalLineId) {
      row = await db.spCashMatchLink.findFirst({
        where: {
          internalLineId: String(body.internalLineId),
          externalLineId: String(body.externalLineId),
          status: { in: ["CONFIRMED", "PROPOSED"] },
        },
        orderBy: { createdAt: "desc" },
      });
      if (row) return row;
    }

    throw new InvestmentOpsError("NOT_FOUND", "Match link not found", 404, { linkId: id });
  }

  static async getMatch(linkId: string) {
    const row = await this.resolveMatchLink(linkId);
    return presentLink(row);
  }

  static async reverseMatch(linkId: string, body: any, actorId: string) {
    const row = await this.resolveMatchLink(linkId, body);
    if (row.status === "REVERSED") return presentLink(row);
    if (row.makerId) assertMakerNotChecker(row.makerId, actorId);

    const updated = await db.$transaction(
      async (tx: any) => {
        const next = await tx.spCashMatchLink.update({
          where: { id: row.id },
          data: { status: "REVERSED", version: { increment: 1 } },
        });
        await tx.spCashMatchLink.create({
          data: {
            batchId: row.batchId,
            internalLineId: row.internalLineId,
            externalLineId: row.externalLineId,
            matchedAmount: row.matchedAmount,
            topology: row.topology,
            method: "REVERSAL",
            status: "REVERSAL",
            makerId: actorId,
            checkerId: actorId,
            reversalOf: row.id,
            version: 1,
          },
        });

        if (row.internalLineId) {
          await tx.spCashJournalLine.update({
            where: { id: row.internalLineId },
            data: {
              matchStatus: "UNMATCHED",
              residualAmount: null,
              lineVersion: { increment: 1 },
            },
          });
        }
        if (row.externalLineId) {
          const el = await tx.spCashExternalStatementLine.findUnique({
            where: { id: row.externalLineId },
          });
          if (el) {
            await tx.spCashExternalStatementLine.update({
              where: { id: el.id },
              data: {
                matchStatus: "UNMATCHED",
                residualAmount: el.signedCashAmount,
                lineVersion: { increment: 1 },
              },
            });
          }
        }
        return next;
      },
      { maxWait: 15_000, timeout: 30_000 }
    );

    await emitCash({
      eventType: "cash.match.reversed",
      aggregateType: "SpCashMatchLink",
      aggregateId: row.id,
      aggregateVersion: updated.version,
      actorId,
      reason: body?.reason || null,
    });
    return presentLink(updated);
  }
}
