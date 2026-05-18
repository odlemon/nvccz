// @ts-nocheck
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../utils/database";
import { assignNextAuditIdAndCreateJournal } from "./AuditTrailSequenceService";
import { EmailNotificationService } from "./EmailNotificationService";
import { loadCapitalCallAccountingLetterhead } from "../utils/capitalCallAccountingLetterhead";

const ELIGIBLE_COMMITMENT_STATUSES = ["ACTIVE", "PENDING"];
/** Receivable account debited at fee accrual. Seeded via npm run db:migrate:lp-fees-distributions. */
const DR_MGT_FEE_RECEIVABLE = "1220";
/** Revenue account credited at fee accrual. */
const CR_MGT_FEE_REVENUE = "4010";

const ALLOWED_FEE_BASES = new Set(["COMMITTED", "INVESTED", "NAV"]);

function roundMoney(d: Decimal): Decimal {
  return new Decimal(d.toFixed(2, Decimal.ROUND_HALF_UP));
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toDate(value: unknown, name: string): Date {
  if (value == null || value === "") throw new Error(`${name} is required`);
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid ${name}`);
  return d;
}

function toDateLabel(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const s = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function dayCount(periodStart: Date, periodEnd: Date): number {
  const ms = periodEnd.getTime() - periodStart.getTime();
  const days = Math.floor(ms / 86_400_000) + 1; // inclusive
  if (days <= 0) throw new Error("periodEnd must be on or after periodStart");
  return days;
}

function normalizeEmail(value: unknown): string | null {
  const email = String(value ?? "").trim();
  if (!email) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

async function resolveCurrencyIdFromCode(currencyCode: string): Promise<string> {
  const row = await prisma.currency.findFirst({
    where: { code: currencyCode.toUpperCase(), isActive: true },
    select: { id: true },
  });
  if (!row) throw new Error(`Currency code ${currencyCode} not found or inactive`);
  return row.id;
}

async function requireFeeChartAccounts(): Promise<{ drId: string; crId: string }> {
  const [dr, cr] = await Promise.all([
    prisma.chartOfAccounts.findFirst({
      where: { accountNo: DR_MGT_FEE_RECEIVABLE, isActive: true },
      select: { id: true },
    }),
    prisma.chartOfAccounts.findFirst({
      where: { accountNo: CR_MGT_FEE_REVENUE, isActive: true },
      select: { id: true },
    }),
  ]);
  if (!dr) {
    throw new Error(
      `Chart of accounts ${DR_MGT_FEE_RECEIVABLE} (Management Fee Receivable) missing or inactive — run npm run db:migrate:lp-fees-distributions`
    );
  }
  if (!cr) {
    throw new Error(
      `Chart of accounts ${CR_MGT_FEE_REVENUE} (Management Fee Revenue) missing or inactive — run npm run db:migrate:lp-fees-distributions`
    );
  }
  return { drId: dr.id, crId: cr.id };
}

/**
 * GL to debit when LPs pay a management fee. Override per request with `cashChartOfAccountId`,
 * or set env CAPITAL_CALL_RECEIPT_CASH_ACCOUNT_NO, else first active bank GL, else 1100 / Bank / Cash name match.
 */
async function resolveCashGlAccountId(explicitId?: string | null): Promise<string> {
  if (explicitId) {
    const row = await prisma.chartOfAccounts.findFirst({
      where: { id: explicitId, isActive: true },
      select: { id: true },
    });
    if (!row) throw new Error("cashChartOfAccountId is not a valid active chart of accounts id");
    return row.id;
  }
  const envNo = process.env.CAPITAL_CALL_RECEIPT_CASH_ACCOUNT_NO?.trim();
  if (envNo) {
    const coa = await prisma.chartOfAccounts.findFirst({
      where: { accountNo: envNo, isActive: true },
      select: { id: true },
    });
    if (coa) return coa.id;
  }
  const firstBank = await prisma.bank.findFirst({
    where: { isActive: true, glAccountId: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { glAccountId: true },
  });
  if (firstBank?.glAccountId) return firstBank.glAccountId;
  const fallback = await prisma.chartOfAccounts.findFirst({
    where: {
      OR: [{ accountNo: "1100" }, { accountName: { contains: "Bank" } }, { accountName: { contains: "Cash" } }],
      isActive: true,
    },
    orderBy: { accountNo: "asc" },
    select: { id: true },
  });
  if (!fallback) {
    throw new Error("No cash/bank GL for management fee receipts. Pass cashChartOfAccountId.");
  }
  return fallback.id;
}

function periodHeaderStatusLabel(s: string): string {
  return (
    {
      ACCRUED: "Accrued",
      INVOICED: "Invoices Sent",
      PARTIALLY_PAID: "Partially Paid",
      PAID: "Fully Paid",
    }[s] ?? s
  );
}

function allocationStatusLabel(s: string): string {
  return ({ PENDING: "Pending", PARTIALLY_PAID: "Partially Paid", PAID: "Paid" }[s] ?? s);
}

function allocationStatus(share: Decimal, paid: Decimal): string {
  if (paid.lte(0)) return "PENDING";
  if (paid.lt(share)) return "PARTIALLY_PAID";
  return "PAID";
}

function recomputeHeaderStatus(
  rows: Array<{ shareOfFee: Decimal; amountPaid: Decimal }>,
  invoicesSent: boolean
): string {
  const statuses = rows.map((r) => allocationStatus(r.shareOfFee, r.amountPaid));
  if (statuses.every((s) => s === "PAID")) return "PAID";
  const any = statuses.some((s) => s === "PARTIALLY_PAID" || s === "PAID");
  if (any) return "PARTIALLY_PAID";
  return invoicesSent ? "INVOICED" : "ACCRUED";
}

function enrichPeriodRow(row: any) {
  if (!row) return row;
  return {
    ...row,
    statusLabel: periodHeaderStatusLabel(row.status),
    allocations: (row.allocations ?? []).map((a: any) => ({
      ...a,
      statusLabel: allocationStatusLabel(a.status),
    })),
  };
}

async function computeFeeBaseAmount(
  fundId: string,
  feeBase: string,
  commitmentsByCurrency: Map<string, Decimal>
): Promise<{ baseAmount: Decimal; currencyCode: string }> {
  const codes = [...commitmentsByCurrency.keys()];
  if (codes.length !== 1) {
    throw new Error(
      `Management fee requires all commitments to share one currency; found: ${codes.join(", ") || "(none)"}`
    );
  }
  const currencyCode = codes[0];

  if (feeBase === "COMMITTED") {
    return { baseAmount: roundMoney(commitmentsByCurrency.get(currencyCode)!), currencyCode };
  }
  if (feeBase === "INVESTED") {
    const disbursed = await prisma.fundDisbursement.aggregate({
      where: { fundId, status: "DISBURSED" },
      _sum: { amount: true },
    });
    const total = new Decimal((disbursed._sum.amount ?? 0).toString());
    return { baseAmount: roundMoney(total), currencyCode };
  }
  if (feeBase === "NAV") {
    // NAV proxy: invested capital minus dividends already received (cleared/recovered cash).
    // (Replace with PortfolioValuationService when NAV roll-up is wired.)
    const [disbursed, dividends] = await Promise.all([
      prisma.fundDisbursement.aggregate({
        where: { fundId, status: "DISBURSED" },
        _sum: { amount: true },
      }),
      prisma.portfolioCompanyDividend.aggregate({
        where: { portfolioCompany: { fundId } },
        _sum: { amount: true },
      }),
    ]);
    const inv = new Decimal((disbursed._sum.amount ?? 0).toString());
    const div = new Decimal((dividends._sum.amount ?? 0).toString());
    const nav = inv.minus(div);
    const navFloored = nav.lt(0) ? new Decimal(0) : nav;
    return { baseAmount: roundMoney(navFloored), currencyCode };
  }
  throw new Error(`Unknown feeBase: ${feeBase}`);
}

export class ManagementFeeService {
  static async accrueForPeriod(params: {
    fundId: string;
    periodStart: Date | string;
    periodEnd: Date | string;
    /** Overrides fund.managementFeeBase for this run. */
    feeBase?: string;
    /** Overrides fund.managementFeeRate for this run (fraction; 0.02 = 2%/yr). */
    rateOverride?: number | string | null;
    /** Overrides computed feeBaseAmount for this run (e.g. external NAV report). */
    feeBaseAmountOverride?: number | string | null;
    transactionDate?: Date | string;
    notes?: string | null;
    createdById: string;
  }) {
    const fund = await prisma.fund.findUnique({
      where: { id: params.fundId },
      select: {
        id: true,
        name: true,
        managementFeeRate: true,
        managementFeeBase: true,
      },
    });
    if (!fund) throw new Error("Fund not found");

    const rate =
      params.rateOverride != null && params.rateOverride !== ""
        ? new Decimal(String(params.rateOverride))
        : fund.managementFeeRate
          ? new Decimal(fund.managementFeeRate.toString())
          : null;
    if (!rate) {
      throw new Error("Fund has no managementFeeRate configured — set the fee policy first (PUT /api/funds/:fundId/fee-policy).");
    }
    if (!rate.isFinite() || rate.lte(0) || rate.gt(1)) {
      throw new Error("rate must be a fraction in (0, 1]");
    }

    const feeBase = String(
      params.feeBase || fund.managementFeeBase || "COMMITTED"
    ).toUpperCase();
    if (!ALLOWED_FEE_BASES.has(feeBase)) {
      throw new Error(`feeBase must be one of ${[...ALLOWED_FEE_BASES].join(", ")}`);
    }

    const periodStart = toDate(params.periodStart, "periodStart");
    const periodEnd = toDate(params.periodEnd, "periodEnd");
    const days = dayCount(periodStart, periodEnd);

    const commitments = await prisma.investmentCommitment.findMany({
      where: { fundId: params.fundId, status: { in: ELIGIBLE_COMMITMENT_STATUSES } },
      include: { client: { select: { id: true, legalName: true, email: true } } },
    });
    if (commitments.length === 0) {
      throw new Error("No eligible LP commitments (ACTIVE or PENDING) found for this fund.");
    }

    const commitmentsByCurrency = new Map<string, Decimal>();
    for (const c of commitments) {
      const code = String(c.currency).toUpperCase();
      const cur = commitmentsByCurrency.get(code) ?? new Decimal(0);
      commitmentsByCurrency.set(code, cur.plus(new Decimal(c.amount.toString())));
    }
    let baseAmount: Decimal;
    let currencyCode: string;
    if (params.feeBaseAmountOverride != null && params.feeBaseAmountOverride !== "") {
      const codes = [...commitmentsByCurrency.keys()];
      if (codes.length !== 1) {
        throw new Error(
          `Management fee requires one shared LP commitment currency; found: ${codes.join(", ") || "(none)"}`
        );
      }
      currencyCode = codes[0];
      baseAmount = roundMoney(new Decimal(String(params.feeBaseAmountOverride)));
      if (baseAmount.lte(0)) throw new Error("feeBaseAmountOverride must be > 0");
    } else {
      const computed = await computeFeeBaseAmount(params.fundId, feeBase, commitmentsByCurrency);
      baseAmount = computed.baseAmount;
      currencyCode = computed.currencyCode;
      if (baseAmount.lte(0)) {
        throw new Error(
          `Computed fee base (${feeBase}) is zero — nothing to accrue. Provide feeBaseAmountOverride to force.`
        );
      }
    }

    // totalFee = baseAmount × rate × (days / 365), rounded half-up.
    const totalFee = roundMoney(baseAmount.mul(rate).mul(days).div(365));
    if (totalFee.lte(0)) {
      throw new Error("Computed totalFee is zero — nothing to accrue.");
    }

    const totalCommitment = roundMoney(commitmentsByCurrency.get(currencyCode)!);
    if (totalCommitment.lte(0)) throw new Error("Total LP commitments is zero — cannot split fee.");

    // Pro-rata split by commitment with last-line correction so sum == totalFee.
    const lines: Array<{
      commitmentId: string;
      clientId: string;
      lpName: string;
      commitmentSnapshot: Decimal;
      shareOfFee: Decimal;
    }> = [];
    let runningSum = new Decimal(0);
    for (let i = 0; i < commitments.length; i++) {
      const c = commitments[i];
      const commit = new Decimal(c.amount.toString());
      let share: Decimal;
      if (i === commitments.length - 1) {
        share = roundMoney(totalFee.minus(runningSum));
      } else {
        share = roundMoney(totalFee.mul(commit).div(totalCommitment));
        runningSum = runningSum.plus(share);
      }
      lines.push({
        commitmentId: c.id,
        clientId: c.clientId,
        lpName: c.client.legalName,
        commitmentSnapshot: roundMoney(commit),
        shareOfFee: share,
      });
    }

    const currencyId = await resolveCurrencyIdFromCode(currencyCode);
    const { drId, crId } = await requireFeeChartAccounts();
    const txDate = toDate(params.transactionDate ?? periodEnd, "transactionDate");
    const desc = `Management fee — ${fund.name} (${toDateLabel(periodStart)} → ${toDateLabel(periodEnd)})`;
    const referenceNumber = `MGTFEE-${params.fundId.slice(0, 6)}-${Date.now()}`;

    const periodId = await prisma.$transaction(
      async (tx) => {
        const journalEntry = await assignNextAuditIdAndCreateJournal(tx, {
          transactionDate: txDate,
          referenceNumber,
          description: desc,
          totalAmount: totalFee,
          currencyId,
          status: "POSTED",
          createdById: params.createdById,
        });

        await tx.journalEntryLine.createMany({
          data: [
            {
              journalEntryId: journalEntry.id,
              chartOfAccountId: drId,
              debitAmount: totalFee,
              creditAmount: new Decimal(0),
              description: `${DR_MGT_FEE_RECEIVABLE} — Management fee receivable (${fund.name})`,
            },
            {
              journalEntryId: journalEntry.id,
              chartOfAccountId: crId,
              debitAmount: new Decimal(0),
              creditAmount: totalFee,
              description: `${CR_MGT_FEE_REVENUE} — Management fee revenue (${fund.name})`,
            },
          ],
        });

        const period = await tx.managementFeePeriod.create({
          data: {
            fundId: params.fundId,
            currencyId,
            periodStart,
            periodEnd,
            feeBase,
            feeBaseAmount: baseAmount,
            rate,
            totalFee,
            status: "ACCRUED",
            journalEntryId: journalEntry.id,
            notes: params.notes ?? null,
            createdById: params.createdById,
          },
        });

        await tx.managementFeeAllocation.createMany({
          data: lines.map((row) => ({
            managementFeePeriodId: period.id,
            clientId: row.clientId,
            investmentCommitmentId: row.commitmentId,
            lpLegalNameSnapshot: row.lpName,
            commitmentSnapshot: row.commitmentSnapshot,
            shareOfFee: row.shareOfFee,
            amountPaid: new Decimal(0),
            status: "PENDING",
          })),
        });

        return period.id;
      },
      { maxWait: 5_000, timeout: 12_000 }
    );

    return this.getById(params.fundId, periodId);
  }

  static async list(fundId: string) {
    const fund = await prisma.fund.findUnique({ where: { id: fundId }, select: { id: true } });
    if (!fund) throw new Error("Fund not found");
    const rows = await prisma.managementFeePeriod.findMany({
      where: { fundId },
      orderBy: { periodEnd: "desc" },
      select: {
        id: true,
        periodStart: true,
        periodEnd: true,
        feeBase: true,
        feeBaseAmount: true,
        rate: true,
        totalFee: true,
        status: true,
        invoicesSentAt: true,
        journalEntryId: true,
        createdAt: true,
        currency: { select: { code: true, symbol: true } },
        _count: { select: { allocations: true } },
      },
    });
    return rows.map((r: any) => ({ ...r, statusLabel: periodHeaderStatusLabel(r.status) }));
  }

  static async getById(fundId: string, periodId: string) {
    const row = await prisma.managementFeePeriod.findFirst({
      where: { id: periodId, fundId },
      include: {
        fund: { select: { name: true } },
        currency: { select: { code: true, symbol: true } },
        allocations: {
          orderBy: { lpLegalNameSnapshot: "asc" },
          include: {
            client: { select: { id: true, legalName: true, email: true } },
            payments: { orderBy: { recordedAt: "desc" } },
          },
        },
        journalEntry: {
          select: {
            id: true,
            referenceNumber: true,
            transactionDate: true,
            status: true,
            auditTrailSequenceNumber: true,
          },
        },
      },
    });
    if (!row) throw new Error("Management fee period not found");
    return enrichPeriodRow(row);
  }

  static async sendInvoices(fundId: string, periodId: string) {
    const period = await this.getById(fundId, periodId);
    const fundName = period.fund.name;
    const ccy = period.currency.code;
    const dateLabel = toDateLabel(period.periodEnd);

    const candidates = period.allocations.map((a: any) => ({
      allocation: a,
      rawEmail: String(a.client?.email ?? ""),
      email: normalizeEmail(a.client?.email),
    }));
    const skippedRecipients = candidates
      .filter((x: any) => x.email == null)
      .map((x: any) => ({
        allocationId: x.allocation.id,
        lpName: x.allocation.lpLegalNameSnapshot,
        rawEmail: x.rawEmail,
        reason: "Missing or invalid email",
      }));
    const toSend = candidates.filter((x: any) => x.email != null);
    if (toSend.length === 0) {
      const e: any = new Error("No allocations with a valid client email — cannot send invoices.");
      e.details = { attemptedCount: 0, sentCount: 0, failedCount: 0, skippedRecipients };
      throw e;
    }

    const letterhead = await loadCapitalCallAccountingLetterhead();
    const fmt = (n: number) =>
      n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const sentRecipients: any[] = [];
    const failedRecipients: any[] = [];

    for (const row of toSend) {
      const a = row.allocation;
      const email = row.email as string;
      const share = Number(a.shareOfFee.toString());
      const commit = Number(a.commitmentSnapshot.toString());

      const th = "border:1px solid #ccc;font-weight:400;color:#333;width:38%;";
      const td = "border:1px solid #ccc;font-weight:400;";

      const logoUrl = letterhead.logoUrlForEmail?.trim() ?? "";
      const logoHtml =
        logoUrl && /^https:\/\//i.test(logoUrl)
          ? `<div style="text-align:right;margin-bottom:10px;"><img src="${escapeHtml(logoUrl)}" alt="" width="80" height="80" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:1px solid #e8e8e8;display:inline-block;" /></div>`
          : "";
      const detail = letterhead.detailLines
        .map(
          (line) =>
            `<div style="font-size:11px;color:#444;line-height:1.4;text-align:right;">${escapeHtml(line)}</div>`
        )
        .join("");

      const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;line-height:1.5;color:#222;">
        <div style="border-bottom:1px solid #ddd;padding-bottom:14px;margin-bottom:18px;text-align:right;">
          ${logoHtml}
          <div style="font-weight:500;font-size:14px;color:#111;margin-bottom:6px;letter-spacing:0.01em;">${escapeHtml(letterhead.displayName)}</div>
          ${detail}
        </div>
        <p>Dear ${escapeHtml(a.lpLegalNameSnapshot)},</p>
        <p>Please find your management fee invoice for ${escapeHtml(fundName)} (${escapeHtml(ccy)}) below.</p>
        <table style="border-collapse:collapse;margin:16px 0;width:100%;" cellpadding="8">
          <tr><td style="${th}">LP name</td><td style="${td}">${escapeHtml(a.lpLegalNameSnapshot)}</td></tr>
          <tr><td style="${th}">Period</td><td style="${td}">${escapeHtml(toDateLabel(period.periodStart))} → ${escapeHtml(toDateLabel(period.periodEnd))}</td></tr>
          <tr><td style="${th}">Fee base</td><td style="${td}">${escapeHtml(period.feeBase)} (${escapeHtml(ccy)} ${fmt(Number(period.feeBaseAmount.toString()))})</td></tr>
          <tr><td style="${th}">Annual rate</td><td style="${td}">${(Number(period.rate.toString()) * 100).toFixed(4)}%</td></tr>
          <tr><td style="${th}">Your commitment</td><td style="${td}">${escapeHtml(ccy)} ${fmt(commit)}</td></tr>
          <tr><td style="${th}">Your share of fee</td><td style="${td}"><strong>${escapeHtml(ccy)} ${fmt(share)}</strong></td></tr>
        </table>
        <p style="color:#666;font-size:12px;text-align:right;font-weight:400;">${escapeHtml(letterhead.displayName)}</p>
      </body></html>`;

      try {
        await EmailNotificationService.sendCapitalCallNoticeEmail({
          lpEmail: email,
          lpDisplayName: a.lpLegalNameSnapshot,
          fundName: `Management Fee — ${fundName}`,
          subjectDateLabel: dateLabel,
          html,
        });
        sentRecipients.push({
          allocationId: a.id,
          lpName: a.lpLegalNameSnapshot,
          email,
        });
      } catch (e: any) {
        failedRecipients.push({
          allocationId: a.id,
          lpName: a.lpLegalNameSnapshot,
          email,
          error: e?.message ?? "Send failed",
        });
      }
    }

    if (failedRecipients.length === 0) {
      await prisma.managementFeePeriod.update({
        where: { id: periodId },
        data: {
          invoicesSentAt: new Date(),
          status: period.status === "ACCRUED" ? "INVOICED" : period.status,
        },
      });
    }

    const detail = await this.getById(fundId, periodId);
    return {
      ...detail,
      invoiceDispatch: {
        attemptedCount: toSend.length,
        sentCount: sentRecipients.length,
        failedCount: failedRecipients.length,
        skippedCount: skippedRecipients.length,
        sentRecipients,
        failedRecipients,
        skippedRecipients,
      },
    };
  }

  static async recordAllocationPayment(params: {
    fundId: string;
    periodId: string;
    allocationId: string;
    amount: number | string;
    createdById: string;
    transactionDate?: Date | string;
    cashChartOfAccountId?: string | null;
  }) {
    const amt = new Decimal(typeof params.amount === "string" ? params.amount : String(params.amount));
    if (!amt.isFinite() || amt.lte(0)) throw new Error("amount must be a positive number");

    const allocation = await prisma.managementFeeAllocation.findFirst({
      where: {
        id: params.allocationId,
        managementFeePeriodId: params.periodId,
        period: { fundId: params.fundId },
      },
      include: {
        period: {
          select: {
            id: true,
            status: true,
            invoicesSentAt: true,
            currencyId: true,
            fund: { select: { name: true } },
          },
        },
      },
    });
    if (!allocation) throw new Error("Allocation not found");

    const share = new Decimal(allocation.shareOfFee.toString());
    const paid = new Decimal(allocation.amountPaid.toString());
    const remaining = share.minus(paid);
    if (remaining.lte(0)) throw new Error("This allocation is already fully paid.");
    if (amt.gt(remaining)) {
      throw new Error(`Payment exceeds remaining balance (${remaining.toFixed(2)}).`);
    }

    const newPaid = roundMoney(paid.plus(amt));
    const allocStatus = allocationStatus(share, newPaid);
    const invoicesSent = allocation.period.invoicesSentAt != null;
    const amtPosted = roundMoney(amt);
    const fundName = allocation.period.fund.name;
    const currencyId = allocation.period.currencyId;
    const txDate =
      params.transactionDate != null && params.transactionDate !== ""
        ? toDate(params.transactionDate, "transactionDate")
        : new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");

    const [{ drId: receivableId }, cashGlId] = await Promise.all([
      requireFeeChartAccounts(),
      resolveCashGlAccountId(params.cashChartOfAccountId ?? null),
    ]);

    const referenceNumber = `MGTFEEPAY-${params.allocationId.slice(0, 8)}-${Date.now()}`;
    const desc = `LP management fee receipt — ${fundName} — ${allocation.lpLegalNameSnapshot}`;

    await prisma.$transaction(
      async (tx) => {
        await tx.managementFeeAllocationPayment.create({
          data: {
            managementFeeAllocationId: params.allocationId,
            amount: amtPosted,
          },
        });
        await tx.managementFeeAllocation.update({
          where: { id: params.allocationId },
          data: { amountPaid: newPaid, status: allocStatus },
        });

        const allRows = await tx.managementFeeAllocation.findMany({
          where: { managementFeePeriodId: params.periodId },
          select: { shareOfFee: true, amountPaid: true },
        });
        const hdr = recomputeHeaderStatus(
          allRows.map((r) => ({
            shareOfFee: new Decimal(r.shareOfFee.toString()),
            amountPaid: new Decimal(r.amountPaid.toString()),
          })),
          invoicesSent
        );
        await tx.managementFeePeriod.update({
          where: { id: params.periodId },
          data: { status: hdr },
        });

        const journalEntry = await assignNextAuditIdAndCreateJournal(tx, {
          transactionDate: txDate,
          referenceNumber,
          description: desc,
          totalAmount: amtPosted,
          currencyId,
          status: "POSTED",
          createdById: params.createdById,
        });
        await tx.journalEntryLine.createMany({
          data: [
            {
              journalEntryId: journalEntry.id,
              chartOfAccountId: cashGlId,
              debitAmount: amtPosted,
              creditAmount: new Decimal(0),
              description: `Cash/bank — management fee receipt (${fundName})`,
            },
            {
              journalEntryId: journalEntry.id,
              chartOfAccountId: receivableId,
              debitAmount: new Decimal(0),
              creditAmount: amtPosted,
              description: `${DR_MGT_FEE_RECEIVABLE} — Clear management fee receivable (${fundName})`,
            },
          ],
        });
      },
      { maxWait: 8_000, timeout: 20_000 }
    );

    return this.getById(params.fundId, params.periodId);
  }
}
