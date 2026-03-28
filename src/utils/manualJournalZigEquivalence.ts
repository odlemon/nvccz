import { Decimal } from '@prisma/client/runtime/library';
import type { PrismaClient } from '@prisma/client';
import { resolveUsdZwgAvgForSnapshot } from '../services/UsdZwgRateResolver';
import { fetchZimrateRates, extractZwgPerZar } from '../services/ZimrateRateService';

const ZIG_CODES = new Set(['ZWL', 'ZWG', 'ZIG']);

export type ManualJournalLineForZig = {
  chartOfAccountId: string;
  debitAmount: number;
  creditAmount: number;
  description: string;
  currencyId?: string;
};

export type ZigLineBreakdown = {
  chartOfAccountId: string;
  description: string;
  currencyCode: string;
  debitOriginal: string;
  creditOriginal: string;
  zigDebit: string;
  zigCredit: string;
};

export type MixedCurrencyZigResult = {
  zigDebitTotal: Decimal;
  zigCreditTotal: Decimal;
  lines: ZigLineBreakdown[];
};

function isZigCode(code: string): boolean {
  return ZIG_CODES.has(code.toUpperCase());
}

/**
 * Convert a positive amount in `currencyCode` to ZiG (ZWL) using the same sources as journal snapshots / Zimrate.
 */
export async function amountToZig(
  prisma: PrismaClient,
  amount: Decimal,
  currencyCode: string
): Promise<Decimal> {
  const code = currencyCode.toUpperCase();
  if (amount.lte(0)) return new Decimal(0);

  if (isZigCode(code)) {
    return amount;
  }

  if (code === 'USD') {
    const usdZwg = await resolveUsdZwgAvgForSnapshot(prisma);
    if (usdZwg == null || usdZwg <= 0) {
      throw new Error('Could not resolve USD→ZiG rate for manual journal validation');
    }
    return amount.mul(usdZwg);
  }

  if (code === 'ZAR') {
    const full = await fetchZimrateRates();
    const zar = extractZwgPerZar(full);
    if (zar == null) {
      throw new Error('Zimrate did not return a usable ZAR→ZWL rate for manual journal ZiG validation');
    }
    return amount.mul(zar.zwgPerZar);
  }

  throw new Error(
    `Unsupported currency for ZiG equivalence on manual journal: ${code}. Use USD, ZAR, ZWL, or ZWG.`
  );
}

/**
 * True when lines use more than one distinct currency (after defaulting to journal currency).
 */
export function hasMixedRecordedCurrencies(
  journalCurrencyId: string,
  lines: ManualJournalLineForZig[],
  currencyIdToCode: Map<string, string>
): boolean {
  const codes = new Set<string>();
  for (const line of lines) {
    const cid = line.currencyId ?? journalCurrencyId;
    const code = currencyIdToCode.get(cid);
    if (!code) continue;
    codes.add(code.toUpperCase());
  }
  return codes.size > 1;
}

/**
 * Build ZiG debit/credit totals and per-line breakdown. Caller must only call when mixed currencies.
 */
export async function computeManualJournalZigEquivalence(
  prisma: PrismaClient,
  journalCurrencyId: string,
  lines: ManualJournalLineForZig[],
  currencyIdToCode: Map<string, string>
): Promise<MixedCurrencyZigResult> {
  let zigDebitTotal = new Decimal(0);
  let zigCreditTotal = new Decimal(0);
  const breakdown: ZigLineBreakdown[] = [];

  for (const line of lines) {
    const cid = line.currencyId ?? journalCurrencyId;
    const code = currencyIdToCode.get(cid);
    if (!code) {
      throw new Error(`Unknown currency id for manual journal line: ${cid}`);
    }

    const debit = new Decimal(line.debitAmount ?? 0);
    const credit = new Decimal(line.creditAmount ?? 0);

    let zigDr = new Decimal(0);
    let zigCr = new Decimal(0);
    if (debit.gt(0)) {
      zigDr = await amountToZig(prisma, debit, code);
    }
    if (credit.gt(0)) {
      zigCr = await amountToZig(prisma, credit, code);
    }

    zigDebitTotal = zigDebitTotal.plus(zigDr);
    zigCreditTotal = zigCreditTotal.plus(zigCr);

    breakdown.push({
      chartOfAccountId: line.chartOfAccountId,
      description: line.description,
      currencyCode: code.toUpperCase(),
      debitOriginal: debit.toFixed(3),
      creditOriginal: credit.toFixed(3),
      zigDebit: zigDr.toFixed(3),
      zigCredit: zigCr.toFixed(3),
    });
  }

  return { zigDebitTotal, zigCreditTotal, lines: breakdown };
}

const ZIG_BALANCE_TOLERANCE = new Decimal('0.05');

export function zigTotalsBalanced(zigDebitTotal: Decimal, zigCreditTotal: Decimal): boolean {
  return zigDebitTotal.minus(zigCreditTotal).abs().lte(ZIG_BALANCE_TOLERANCE);
}
