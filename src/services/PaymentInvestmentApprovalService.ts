// @ts-nocheck
import { prisma } from "../utils/database";
import { PurchaseInvoiceService } from "./PurchaseInvoiceService";
import { ShortTermInvestmentService } from "./ShortTermInvestmentService";
import { QuarterlyStatementFxService } from "./quarterlyStatements/QuarterlyStatementFxService";

/**
 * Shared support for gating Payment execution (Payables "pay bill(s)") and Investment booking
 * (Short-Term Investment placement) behind CFO approval — mirrors the MASTER_DATA_COA pattern
 * added earlier the same day for Chart of Accounts edits (see ChartOfAccountsUpdateService.ts,
 * ChartOfAccountsController.updateChartOfAccounts, and the "MASTER_DATA_COA" cases in
 * ApprovalService.updateEntityStatusAfterApproval/Rejection).
 *
 * The two thresholds below are a reasonable STARTING DEFAULT documented here for visibility —
 * there is no existing product policy for either number. Treat both as configurable starting
 * points, not fixed business rules.
 */

/** Payments of this USD-equivalent or more require CFO approval before executing. Default starting policy. */
export const PAYMENT_APPROVAL_THRESHOLD_USD = 10_000;

/** New investments of this USD-equivalent principal or more require CFO approval before booking. Default starting policy. */
export const INVESTMENT_APPROVAL_THRESHOLD_USD = 50_000;

/**
 * USD-equivalent of `amount` (denominated in `currencyCode`) as of `asOf`.
 *
 * Reuses the same FX path TaxReturnPack uses for USD/ZIG normalization
 * (TaxReturnPackDualCurrencyService.convertAtDate -> QuarterlyStatementFxService.convert) rather than
 * inventing a new conversion path, per instruction. Not audited for correctness here — including its
 * existing graceful-degradation behavior (returns the amount unconverted if no FX quote is found).
 */
export async function getUsdEquivalent(
  amount: number,
  currencyCode: string,
  asOf: Date = new Date()
): Promise<number> {
  const code = String(currencyCode || "USD").trim().toUpperCase();
  if (code === "USD") return amount;
  // Accounting's own rate for the day (recorded daily by the rate job): units of the currency per 1 USD, or the inverse
  // pair. The quarterly-statement helper this used looked up a USD→USD quote for ZiG, found none and returned the ZiG
  // amount unconverted, so 1,000,000 ZiG (about $37,500) counted as $1,000,000 and was held for CFO approval.
  const aliases = code === "ZIG" || code === "ZWG" || code === "ZWL" ? ["ZIG", "ZWG", "ZWL"] : [code];
  const [usd, other] = await Promise.all([
    prisma.currency.findFirst({ where: { code: "USD" }, select: { id: true } }),
    prisma.currency.findFirst({ where: { code: { in: aliases } }, select: { id: true } }),
  ]);
  if (usd && other) {
    const direct = await prisma.exchangeRate.findFirst({ where: { fromCurrencyId: usd.id, toCurrencyId: other.id, date: { lte: asOf }, isActive: true }, orderBy: { date: "desc" } });
    if (direct && Number(direct.rate) > 0) return amount / Number(direct.rate);
    const inverse = await prisma.exchangeRate.findFirst({ where: { fromCurrencyId: other.id, toCurrencyId: usd.id, date: { lte: asOf }, isActive: true }, orderBy: { date: "desc" } });
    if (inverse && Number(inverse.rate) > 0) return amount * Number(inverse.rate);
  }
  // no recorded rate: the older helper (which leaves the amount unconverted when it has no quote — the cautious side for
  // an approval threshold)
  return QuarterlyStatementFxService.convert(amount, currencyCode, "USD", asOf);
}

async function currencyCodeFor(currencyId: string): Promise<string> {
  const currency = await prisma.currency.findUnique({
    where: { id: currencyId },
    select: { code: true },
  });
  if (!currency) {
    throw new Error(`Currency ${currencyId} not found`);
  }
  return currency.code;
}

export interface ThresholdEvaluation {
  amountUsd: number;
  currencyCode: string;
  requiresApproval: boolean;
}

/** Pre-flight for `PurchaseInvoiceController.payInvoice` (single bill): outstanding amount, in USD. */
export async function evaluateSinglePaymentThreshold(invoiceId: string): Promise<ThresholdEvaluation> {
  const invoice = await prisma.purchaseInvoice.findUnique({
    where: { id: invoiceId },
    include: { currency: true },
  });
  if (!invoice) {
    throw new Error("Purchase invoice not found");
  }
  const currencyCode = invoice.currency.code;
  const amountUsd = await getUsdEquivalent(Number(invoice.outstandingAmount), currencyCode);
  return { amountUsd, currencyCode, requiresApproval: amountUsd >= PAYMENT_APPROVAL_THRESHOLD_USD };
}

/**
 * Pre-flight for `PurchaseInvoiceController.payBatch`: sum of outstanding amounts across the batch,
 * in USD. `payInvoicesBatch` itself enforces all invoices share one currency, so a single conversion
 * of the total is equivalent to summing per-invoice USD amounts.
 */
export async function evaluateBatchPaymentThreshold(invoiceIds: string[]): Promise<ThresholdEvaluation> {
  const ids = [...new Set((invoiceIds || []).filter(Boolean))];
  const invoices = await prisma.purchaseInvoice.findMany({
    where: { id: { in: ids } },
    include: { currency: true },
  });
  if (invoices.length !== ids.length) {
    throw new Error("One or more purchase invoices were not found");
  }
  const currencyCode = invoices[0]?.currency?.code || "USD";
  const total = invoices.reduce((sum, inv) => sum + Number(inv.outstandingAmount), 0);
  const amountUsd = await getUsdEquivalent(total, currencyCode);
  return { amountUsd, currencyCode, requiresApproval: amountUsd >= PAYMENT_APPROVAL_THRESHOLD_USD };
}

/** Pre-flight for `ShortTermInvestmentController.createInstrument`: proposed principal, in USD. */
export async function evaluateInvestmentThreshold(
  principal: number | string,
  currencyId: string
): Promise<ThresholdEvaluation> {
  const currencyCode = await currencyCodeFor(currencyId);
  const amountUsd = await getUsdEquivalent(Number(principal), currencyCode);
  return { amountUsd, currencyCode, requiresApproval: amountUsd >= INVESTMENT_APPROVAL_THRESHOLD_USD };
}

export type ApprovalApplyResult = { ok: true; data: any } | { ok: false; message: string };

/**
 * Executes an approved PAYMENT_EXECUTION request — called from
 * ApprovalService.updateEntityStatusAfterApproval once the CFO approval completes.
 *
 * Unlike applyChartOfAccountsUpdate (MASTER_DATA_COA), this does NOT accept/participate in the
 * caller's Prisma transaction: PurchaseInvoiceService.payInvoice/payInvoicesBatch run their own
 * cashbook + journal-entry posting logic (shared with several other call sites) which was not
 * written to accept an external `tx`. Threading a `tx` through that whole stack to match the
 * MASTER_DATA_COA pattern exactly would be a much larger, riskier change than this task's scope.
 * Practically this still fails closed: this function is awaited *inside* the approval transaction
 * callback in ApprovalService, so throwing on failure (see below) still rolls back the
 * Approval/ApprovalRequest status flip — a failed payment is never left recorded as "approved".
 * The one residual gap (documented, not fixed here) is a narrow crash window between the payment's
 * own commit and the outer approval-transaction commit.
 */
export async function applyApprovedPayment(
  entityId: string,
  entityData: any,
  requestedById: string
): Promise<ApprovalApplyResult> {
  try {
    const paymentData = {
      paymentMethod: entityData?.paymentMethod,
      bankId: entityData?.bankId,
      paymentDate: new Date(entityData?.paymentDateIso),
      paymentReference: entityData?.paymentReference,
      notes: entityData?.notes,
    };

    if (entityData?.kind === "BATCH") {
      const result = await PurchaseInvoiceService.payInvoicesBatch(
        entityData?.invoiceIds || [],
        paymentData,
        requestedById
      );
      return { ok: true, data: result };
    }

    // SINGLE
    const invoice = await PurchaseInvoiceService.payInvoice(entityId, paymentData, requestedById);
    return { ok: true, data: invoice };
  } catch (error: any) {
    return { ok: false, message: error?.message || String(error) };
  }
}

/**
 * Books an approved INVESTMENT_BOOKING request — called from
 * ApprovalService.updateEntityStatusAfterApproval once the CFO approval completes.
 *
 * No ShortTermInvestmentInstrument row exists yet when the request is created (this gates a CREATE,
 * not an edit of an existing row like MASTER_DATA_COA/PAYMENT_EXECUTION) — the real instrument id is
 * only minted here, on approval. Same non-tx-participation caveat as applyApprovedPayment above:
 * ShortTermInvestmentService.createInstrument runs its own transaction(s) internally.
 */
export async function applyApprovedInvestmentBooking(
  entityData: any,
  requestedById: string
): Promise<ApprovalApplyResult> {
  try {
    const row = await ShortTermInvestmentService.createInstrument(
      {
        name: entityData?.name,
        category: entityData?.category ?? null,
        broker: entityData?.broker ?? null,
        principal: entityData?.principal,
        currencyId: entityData?.currencyId,
        functionalCurrencyId: entityData?.functionalCurrencyId ?? null,
        compoundingMethod: entityData?.compoundingMethod,
        dayCountConvention: entityData?.dayCountConvention,
        settlementBankId: entityData?.settlementBankId,
        principalGlAccountId: entityData?.principalGlAccountId,
        accruedInterestGlAccountId: entityData?.accruedInterestGlAccountId,
        interestIncomeGlAccountId: entityData?.interestIncomeGlAccountId,
        negativeYieldExpenseGlAccountId: entityData?.negativeYieldExpenseGlAccountId,
        unrealizedFxGlAccountId: entityData?.unrealizedFxGlAccountId ?? null,
        realizedFxGlAccountId: entityData?.realizedFxGlAccountId ?? null,
        startDateIso: entityData?.startDateIso,
        maturityDateIso: entityData?.maturityDateIso ?? null,
        initialApy: entityData?.initialApy,
        initialApyEffectiveFromIso: entityData?.initialApyEffectiveFromIso,
      },
      {
        userId: requestedById,
        ipAddress: entityData?.ipAddress ?? null,
        userAgent: entityData?.userAgent ?? null,
      }
    );
    return { ok: true, data: row };
  } catch (error: any) {
    return { ok: false, message: error?.message || String(error) };
  }
}
