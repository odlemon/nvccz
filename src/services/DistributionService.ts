// @ts-nocheck
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../utils/database";
import { assignNextAuditIdAndCreateJournal } from "./AuditTrailSequenceService";
import { EmailNotificationService } from "./EmailNotificationService";
import { loadCapitalCallAccountingLetterhead } from "../utils/capitalCallAccountingLetterhead";

const ELIGIBLE_COMMITMENT_STATUSES = ["ACTIVE", "PENDING"];
const ALLOWED_SOURCES = new Set(["DIVIDEND", "EXIT_PROCEEDS", "INTEREST", "OTHER"]);
/** Source-of-funds income (Cr at declaration). */
const CR_DIVIDEND_INCOME = "4100";
/** Distributions payable to LPs (Cr at declaration, Dr at payout). */
const DIST_PAYABLE = "2400";
/** Performance fee revenue (Cr for the GP carry portion at declaration). */
const CR_PERF_FEE_REVENUE = "4020";

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

async function findCoaByAccountNo(accountNo: string): Promise<string> {
  const row = await prisma.chartOfAccounts.findFirst({
    where: { accountNo, isActive: true },
    select: { id: true },
  });
  if (!row) {
    throw new Error(
      `Chart of accounts ${accountNo} missing or inactive — run npm run db:migrate:lp-fees-distributions`
    );
  }
  return row.id;
}

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
  if (!fallback) throw new Error("No cash/bank GL for distribution payouts. Pass cashChartOfAccountId.");
  return fallback.id;
}

function headerStatusLabel(s: string): string {
  return (
    {
      DECLARED: "Declared",
      NOTICES_SENT: "Notices Sent",
      PARTIALLY_PAID: "Partially Paid",
      PAID: "Fully Paid",
    }[s] ?? s
  );
}

function allocStatusLabel(s: string): string {
  return ({ PENDING: "Pending", PARTIALLY_PAID: "Partially Paid", PAID: "Paid" }[s] ?? s);
}

function allocStatus(share: Decimal, paid: Decimal): string {
  if (paid.lte(0)) return "PENDING";
  if (paid.lt(share)) return "PARTIALLY_PAID";
  return "PAID";
}

function recomputeHeaderStatus(
  rows: Array<{ shareAmount: Decimal; amountPaid: Decimal }>,
  noticesSent: boolean
): string {
  const statuses = rows.map((r) => allocStatus(r.shareAmount, r.amountPaid));
  if (statuses.every((s) => s === "PAID")) return "PAID";
  const any = statuses.some((s) => s === "PARTIALLY_PAID" || s === "PAID");
  if (any) return "PARTIALLY_PAID";
  return noticesSent ? "NOTICES_SENT" : "DECLARED";
}

function enrichRow(row: any) {
  if (!row) return row;
  return {
    ...row,
    statusLabel: headerStatusLabel(row.status),
    allocations: (row.allocations ?? []).map((a: any) => ({
      ...a,
      statusLabel: allocStatusLabel(a.status),
    })),
  };
}

/**
 * European-waterfall carry calculation on a single distribution event.
 *
 * Inputs:
 *   gross           total cash to distribute (in fund currency)
 *   carryRate       e.g. 0.20 (20%)
 *   hurdleType      NONE | PREFERRED_RETURN
 *   hurdleRate      e.g. 0.08 (annualized; we approximate "hurdle return earned to date" as gross × hurdleRate)
 *
 * Simplification: this does not compute IRR-based hurdles across the fund's life.
 * It treats gross as the realization event; if hurdleType=PREFERRED_RETURN, hurdleRate fraction
 * of gross is returned to LPs before carry. (For a strict IRR waterfall, swap this for a richer calc.)
 */
function computeWaterfall(opts: {
  gross: Decimal;
  carryRate: Decimal | null;
  hurdleType: string | null;
  hurdleRate: Decimal | null;
}): { carryAmount: Decimal; netToLPs: Decimal; hurdleAppliedAmount: Decimal } {
  const gross = roundMoney(opts.gross);
  if (gross.lte(0)) {
    return { carryAmount: new Decimal(0), netToLPs: gross, hurdleAppliedAmount: new Decimal(0) };
  }
  if (!opts.carryRate || opts.carryRate.lte(0)) {
    return { carryAmount: new Decimal(0), netToLPs: gross, hurdleAppliedAmount: new Decimal(0) };
  }

  let hurdleAppliedAmount = new Decimal(0);
  let above = gross;
  if (opts.hurdleType === "PREFERRED_RETURN" && opts.hurdleRate && opts.hurdleRate.gt(0)) {
    hurdleAppliedAmount = roundMoney(gross.mul(opts.hurdleRate));
    if (hurdleAppliedAmount.gt(gross)) hurdleAppliedAmount = gross;
    above = gross.minus(hurdleAppliedAmount);
  }
  const carry = roundMoney(above.mul(opts.carryRate));
  const carryCapped = carry.gt(above) ? above : carry;
  const net = roundMoney(gross.minus(carryCapped));
  return { carryAmount: carryCapped, netToLPs: net, hurdleAppliedAmount };
}

async function paidInByCommitment(commitmentIds: string[]): Promise<Map<string, Decimal>> {
  const map = new Map<string, Decimal>();
  if (commitmentIds.length === 0) return map;
  const rows = await prisma.capitalCallAllocation.groupBy({
    by: ["investmentCommitmentId"],
    where: { investmentCommitmentId: { in: commitmentIds } },
    _sum: { amountPaid: true },
  });
  for (const r of rows) {
    map.set(r.investmentCommitmentId, new Decimal(r._sum.amountPaid?.toString() ?? "0"));
  }
  return map;
}

export class DistributionService {
  static async create(params: {
    fundId: string;
    distributionDate: Date | string;
    source: string;
    grossAmount: number | string;
    sourceCompanyId?: string | null;
    sourceDividendId?: string | null;
    /** Optional override for the GP carry rate; otherwise uses fund.carryRate. */
    carryRateOverride?: number | string | null;
    /** Optional explicit currency code (must match commitments); otherwise inferred from LP commitments. */
    currencyCode?: string | null;
    notes?: string | null;
    createdById: string;
  }) {
    const fund = await prisma.fund.findUnique({
      where: { id: params.fundId },
      select: {
        id: true,
        name: true,
        carryRate: true,
        hurdleRate: true,
        hurdleType: true,
      },
    });
    if (!fund) throw new Error("Fund not found");

    const source = String(params.source || "").trim().toUpperCase();
    if (!ALLOWED_SOURCES.has(source)) {
      throw new Error(`source must be one of: ${[...ALLOWED_SOURCES].join(", ")}`);
    }

    const gross = new Decimal(typeof params.grossAmount === "string" ? params.grossAmount : String(params.grossAmount));
    if (!gross.isFinite() || gross.lte(0)) throw new Error("grossAmount must be a positive number");

    const distributionDate = toDate(params.distributionDate, "distributionDate");

    if (params.sourceDividendId) {
      const div = await prisma.portfolioCompanyDividend.findUnique({
        where: { id: params.sourceDividendId },
        select: { id: true, portfolioCompanyId: true, amount: true },
      });
      if (!div) throw new Error("sourceDividendId not found");
      if (gross.gt(new Decimal(div.amount.toString()))) {
        throw new Error("grossAmount cannot exceed the source dividend amount");
      }
      if (!params.sourceCompanyId) params.sourceCompanyId = div.portfolioCompanyId;
    }
    if (params.sourceCompanyId) {
      const pc = await prisma.portfolioCompany.findUnique({
        where: { id: params.sourceCompanyId },
        select: { id: true, fundId: true },
      });
      if (!pc) throw new Error("sourceCompanyId not found");
      if (pc.fundId && pc.fundId !== params.fundId) {
        throw new Error("sourceCompanyId belongs to a different fund");
      }
    }

    const commitments = await prisma.investmentCommitment.findMany({
      where: { fundId: params.fundId, status: { in: ELIGIBLE_COMMITMENT_STATUSES } },
      include: { client: { select: { id: true, legalName: true, email: true } } },
    });
    if (commitments.length === 0) {
      throw new Error("No eligible LP commitments — cannot distribute.");
    }

    const codes = [...new Set(commitments.map((c) => String(c.currency).toUpperCase()))];
    if (codes.length !== 1) {
      throw new Error(`Distributions require one shared LP commitment currency; found: ${codes.join(", ")}`);
    }
    const currencyCode = params.currencyCode
      ? String(params.currencyCode).toUpperCase()
      : codes[0];
    if (params.currencyCode && currencyCode !== codes[0]) {
      throw new Error(`Currency mismatch: LP commitments are in ${codes[0]}, request provided ${currencyCode}`);
    }
    const currencyId = await resolveCurrencyIdFromCode(currencyCode);

    const carryRate =
      params.carryRateOverride != null && params.carryRateOverride !== ""
        ? new Decimal(String(params.carryRateOverride))
        : fund.carryRate
          ? new Decimal(fund.carryRate.toString())
          : null;
    if (carryRate && (!carryRate.isFinite() || carryRate.lt(0) || carryRate.gt(1))) {
      throw new Error("carryRate must be a fraction in [0, 1]");
    }

    const { carryAmount, netToLPs, hurdleAppliedAmount } = computeWaterfall({
      gross,
      carryRate,
      hurdleType: fund.hurdleType,
      hurdleRate: fund.hurdleRate ? new Decimal(fund.hurdleRate.toString()) : null,
    });
    if (netToLPs.lte(0)) throw new Error("Net to LPs is zero after carry — cannot distribute.");

    // Split netToLPs pro-rata by paid-in (cumulative capital called and paid).
    const commitmentIds = commitments.map((c) => c.id);
    const paidInMap = await paidInByCommitment(commitmentIds);
    const totalPaidIn = [...paidInMap.values()].reduce((s, v) => s.plus(v), new Decimal(0));

    // If no paid-in yet (LPs haven't paid any calls), fall back to commitment-weighted split.
    const useCommitmentSplit = totalPaidIn.lte(0);
    const splitTotal = useCommitmentSplit
      ? commitments.reduce((s, c) => s.plus(new Decimal(c.amount.toString())), new Decimal(0))
      : totalPaidIn;

    const lines: Array<{
      commitmentId: string;
      clientId: string;
      lpName: string;
      commitmentSnapshot: Decimal;
      paidInSnapshot: Decimal;
      shareAmount: Decimal;
    }> = [];
    let runningSum = new Decimal(0);
    for (let i = 0; i < commitments.length; i++) {
      const c = commitments[i];
      const commit = roundMoney(new Decimal(c.amount.toString()));
      const paidIn = roundMoney(paidInMap.get(c.id) ?? new Decimal(0));
      const weight = useCommitmentSplit ? commit : paidIn;
      let share: Decimal;
      if (i === commitments.length - 1) {
        share = roundMoney(netToLPs.minus(runningSum));
      } else {
        share = splitTotal.gt(0)
          ? roundMoney(netToLPs.mul(weight).div(splitTotal))
          : new Decimal(0);
        runningSum = runningSum.plus(share);
      }
      lines.push({
        commitmentId: c.id,
        clientId: c.clientId,
        lpName: c.client.legalName,
        commitmentSnapshot: commit,
        paidInSnapshot: paidIn,
        shareAmount: share,
      });
    }

    const [incomeId, payableId, carryCrId] = await Promise.all([
      findCoaByAccountNo(CR_DIVIDEND_INCOME),
      findCoaByAccountNo(DIST_PAYABLE),
      findCoaByAccountNo(CR_PERF_FEE_REVENUE),
    ]);

    const txDate = toDate(params.distributionDate, "distributionDate");
    const referenceNumber = `DIST-${params.fundId.slice(0, 6)}-${Date.now()}`;
    const desc = `LP distribution — ${fund.name} (${source}, ${toDateLabel(distributionDate)})`;

    const distributionId = await prisma.$transaction(
      async (tx) => {
        const journalEntry = await assignNextAuditIdAndCreateJournal(tx, {
          transactionDate: txDate,
          referenceNumber,
          description: desc,
          totalAmount: roundMoney(gross),
          currencyId,
          status: "POSTED",
          createdById: params.createdById,
        });

        // Dr Income (move income through) / Cr Distributions Payable + Cr Performance Fee Revenue (carry)
        const jeLines: any[] = [
          {
            journalEntryId: journalEntry.id,
            chartOfAccountId: incomeId,
            debitAmount: roundMoney(gross),
            creditAmount: new Decimal(0),
            description: `${CR_DIVIDEND_INCOME} — Reclassify to LP distribution (${fund.name})`,
          },
          {
            journalEntryId: journalEntry.id,
            chartOfAccountId: payableId,
            debitAmount: new Decimal(0),
            creditAmount: netToLPs,
            description: `${DIST_PAYABLE} — Distributions payable to LPs (${fund.name})`,
          },
        ];
        if (carryAmount.gt(0)) {
          jeLines.push({
            journalEntryId: journalEntry.id,
            chartOfAccountId: carryCrId,
            debitAmount: new Decimal(0),
            creditAmount: carryAmount,
            description: `${CR_PERF_FEE_REVENUE} — GP carry (${fund.name})`,
          });
        }
        await tx.journalEntryLine.createMany({ data: jeLines });

        const distribution = await tx.distribution.create({
          data: {
            fundId: params.fundId,
            currencyId,
            distributionDate,
            source,
            sourceCompanyId: params.sourceCompanyId ?? null,
            sourceDividendId: params.sourceDividendId ?? null,
            grossAmount: roundMoney(gross),
            carryAmount,
            netToLPs,
            hurdleAppliedAmount: hurdleAppliedAmount.gt(0) ? hurdleAppliedAmount : null,
            status: "DECLARED",
            journalEntryId: journalEntry.id,
            notes: params.notes ?? null,
            createdById: params.createdById,
          },
        });

        await tx.distributionAllocation.createMany({
          data: lines.map((row) => ({
            distributionId: distribution.id,
            clientId: row.clientId,
            investmentCommitmentId: row.commitmentId,
            lpLegalNameSnapshot: row.lpName,
            commitmentSnapshot: row.commitmentSnapshot,
            paidInSnapshot: row.paidInSnapshot,
            shareAmount: row.shareAmount,
            amountPaid: new Decimal(0),
            status: "PENDING",
          })),
        });

        return distribution.id;
      },
      { maxWait: 5_000, timeout: 12_000 }
    );

    return this.getById(params.fundId, distributionId);
  }

  static async list(fundId: string) {
    const fund = await prisma.fund.findUnique({ where: { id: fundId }, select: { id: true } });
    if (!fund) throw new Error("Fund not found");
    const rows = await prisma.distribution.findMany({
      where: { fundId },
      orderBy: { distributionDate: "desc" },
      select: {
        id: true,
        distributionDate: true,
        source: true,
        sourceCompanyId: true,
        grossAmount: true,
        carryAmount: true,
        netToLPs: true,
        hurdleAppliedAmount: true,
        status: true,
        noticesSentAt: true,
        journalEntryId: true,
        createdAt: true,
        currency: { select: { code: true, symbol: true } },
        _count: { select: { allocations: true } },
      },
    });
    return rows.map((r: any) => ({ ...r, statusLabel: headerStatusLabel(r.status) }));
  }

  static async getById(fundId: string, distributionId: string) {
    const row = await prisma.distribution.findFirst({
      where: { id: distributionId, fundId },
      include: {
        fund: { select: { name: true } },
        currency: { select: { code: true, symbol: true } },
        sourceCompany: { select: { id: true, name: true } },
        sourceDividend: { select: { id: true, amount: true, dividendDate: true } },
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
    if (!row) throw new Error("Distribution not found");
    return enrichRow(row);
  }

  static async sendNotices(fundId: string, distributionId: string) {
    const distribution = await this.getById(fundId, distributionId);
    const fundName = distribution.fund.name;
    const ccy = distribution.currency.code;
    const dateLabel = toDateLabel(distribution.distributionDate);

    const candidates = distribution.allocations.map((a: any) => ({
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
      const e: any = new Error("No allocations with a valid client email — cannot send notices.");
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
      const share = Number(a.shareAmount.toString());
      const paidIn = Number(a.paidInSnapshot.toString());
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
        <p>We are pleased to notify you of a distribution from ${escapeHtml(fundName)} (${escapeHtml(ccy)}).</p>
        <table style="border-collapse:collapse;margin:16px 0;width:100%;" cellpadding="8">
          <tr><td style="${th}">LP name</td><td style="${td}">${escapeHtml(a.lpLegalNameSnapshot)}</td></tr>
          <tr><td style="${th}">Distribution date</td><td style="${td}">${escapeHtml(dateLabel)}</td></tr>
          <tr><td style="${th}">Source</td><td style="${td}">${escapeHtml(distribution.source)}</td></tr>
          <tr><td style="${th}">Fund gross</td><td style="${td}">${escapeHtml(ccy)} ${fmt(Number(distribution.grossAmount.toString()))}</td></tr>
          <tr><td style="${th}">GP carry</td><td style="${td}">${escapeHtml(ccy)} ${fmt(Number(distribution.carryAmount.toString()))}</td></tr>
          <tr><td style="${th}">Net to LPs</td><td style="${td}">${escapeHtml(ccy)} ${fmt(Number(distribution.netToLPs.toString()))}</td></tr>
          <tr><td style="${th}">Your commitment</td><td style="${td}">${escapeHtml(ccy)} ${fmt(commit)}</td></tr>
          <tr><td style="${th}">Your paid-in capital</td><td style="${td}">${escapeHtml(ccy)} ${fmt(paidIn)}</td></tr>
          <tr><td style="${th}">Your share</td><td style="${td}"><strong>${escapeHtml(ccy)} ${fmt(share)}</strong></td></tr>
        </table>
        <p style="color:#666;font-size:12px;text-align:right;font-weight:400;">${escapeHtml(letterhead.displayName)}</p>
      </body></html>`;

      try {
        await EmailNotificationService.sendCapitalCallNoticeEmail({
          lpEmail: email,
          lpDisplayName: a.lpLegalNameSnapshot,
          fundName: `Distribution Notice — ${fundName}`,
          subjectDateLabel: dateLabel,
          html,
        });
        sentRecipients.push({ allocationId: a.id, lpName: a.lpLegalNameSnapshot, email });
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
      await prisma.distribution.update({
        where: { id: distributionId },
        data: {
          noticesSentAt: new Date(),
          status: distribution.status === "DECLARED" ? "NOTICES_SENT" : distribution.status,
        },
      });
    }

    const detail = await this.getById(fundId, distributionId);
    return {
      ...detail,
      noticeDispatch: {
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
    distributionId: string;
    allocationId: string;
    amount: number | string;
    createdById: string;
    transactionDate?: Date | string;
    /** Bank/cash GL to credit (the fund is paying out). */
    cashChartOfAccountId?: string | null;
  }) {
    const amt = new Decimal(typeof params.amount === "string" ? params.amount : String(params.amount));
    if (!amt.isFinite() || amt.lte(0)) throw new Error("amount must be a positive number");

    const allocation = await prisma.distributionAllocation.findFirst({
      where: {
        id: params.allocationId,
        distributionId: params.distributionId,
        distribution: { fundId: params.fundId },
      },
      include: {
        distribution: {
          select: {
            id: true,
            status: true,
            noticesSentAt: true,
            currencyId: true,
            fund: { select: { name: true } },
          },
        },
      },
    });
    if (!allocation) throw new Error("Allocation not found");

    const share = new Decimal(allocation.shareAmount.toString());
    const paid = new Decimal(allocation.amountPaid.toString());
    const remaining = share.minus(paid);
    if (remaining.lte(0)) throw new Error("This allocation is already fully paid out.");
    if (amt.gt(remaining)) {
      throw new Error(`Payout exceeds remaining balance (${remaining.toFixed(2)}).`);
    }

    const newPaid = roundMoney(paid.plus(amt));
    const aStatus = allocStatus(share, newPaid);
    const noticesSent = allocation.distribution.noticesSentAt != null;
    const amtPosted = roundMoney(amt);
    const fundName = allocation.distribution.fund.name;
    const currencyId = allocation.distribution.currencyId;
    const txDate =
      params.transactionDate != null && params.transactionDate !== ""
        ? toDate(params.transactionDate, "transactionDate")
        : new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");

    const [payableId, cashGlId] = await Promise.all([
      findCoaByAccountNo(DIST_PAYABLE),
      resolveCashGlAccountId(params.cashChartOfAccountId ?? null),
    ]);

    const referenceNumber = `DISTPAY-${params.allocationId.slice(0, 8)}-${Date.now()}`;
    const desc = `LP distribution payout — ${fundName} — ${allocation.lpLegalNameSnapshot}`;

    await prisma.$transaction(
      async (tx) => {
        await tx.distributionAllocationPayment.create({
          data: {
            distributionAllocationId: params.allocationId,
            amount: amtPosted,
          },
        });
        await tx.distributionAllocation.update({
          where: { id: params.allocationId },
          data: { amountPaid: newPaid, status: aStatus },
        });

        const allRows = await tx.distributionAllocation.findMany({
          where: { distributionId: params.distributionId },
          select: { shareAmount: true, amountPaid: true },
        });
        const hdr = recomputeHeaderStatus(
          allRows.map((r) => ({
            shareAmount: new Decimal(r.shareAmount.toString()),
            amountPaid: new Decimal(r.amountPaid.toString()),
          })),
          noticesSent
        );
        await tx.distribution.update({
          where: { id: params.distributionId },
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
              chartOfAccountId: payableId,
              debitAmount: amtPosted,
              creditAmount: new Decimal(0),
              description: `${DIST_PAYABLE} — Clear distribution payable (${fundName})`,
            },
            {
              journalEntryId: journalEntry.id,
              chartOfAccountId: cashGlId,
              debitAmount: new Decimal(0),
              creditAmount: amtPosted,
              description: `Cash/bank — distribution payout (${fundName})`,
            },
          ],
        });
      },
      { maxWait: 8_000, timeout: 20_000 }
    );

    return this.getById(params.fundId, params.distributionId);
  }
}
