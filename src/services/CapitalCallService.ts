// @ts-nocheck
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../utils/database";
import { assignNextAuditIdAndCreateJournal } from "./AuditTrailSequenceService";
import { EmailNotificationService } from "./EmailNotificationService";
import { capitalCallNoticeEmailSubject } from "../utils/capitalCallNoticeSubject";
import {
  loadCapitalCallAccountingLetterhead,
  type CapitalCallAccountingLetterhead,
} from "../utils/capitalCallAccountingLetterhead";
import { buildCapitalCallNoticePdfBuffer, safePdfFileBaseName } from "../utils/capitalCallNoticePdf";

const COMMITMENT_STATUSES_ELIGIBLE = ["ACTIVE", "PENDING"];
/** Must match chart_of_accounts.account_no — created by `npm run db:ensure:capital-call-accounts` (or `db:ensure:chart-of-accounts`). */
const DR_ACCOUNT_NO = "1210";
/** Must match chart_of_accounts.account_no */
const CR_ACCOUNT_NO = "3010";

/** SMTP concurrency for LP notices; tuned for typical LP counts (see env). */
function capitalCallEmailConcurrency(): number {
  const raw = process.env.CAPITAL_CALL_EMAIL_CONCURRENCY;
  const n = raw != null && raw !== "" ? parseInt(raw, 10) : 14;
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 64) : 14;
}

/**
 * Bounded concurrent workers for I/O-heavy work (capital call emails).
 * Returns per-item failures so callers can build detailed recipient reports.
 */
async function runPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<Array<{ item: T; error: Error }>> {
  const n = items.length;
  if (n === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, n));
  let next = 0;
  const failures: Array<{ item: T; error: Error }> = [];

  const worker = async () => {
    while (true) {
      const i = next++;
      if (i >= n) break;
      const item = items[i];
      try {
        await fn(item);
      } catch (e: any) {
        failures.push({
          item,
          error: e instanceof Error ? e : new Error(String(e)),
        });
      }
    }
  };

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return failures;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Accounting letterhead block for capital call HTML emails (matches PDF identity). */
function capitalCallEmailLetterheadBlockHtml(lh: CapitalCallAccountingLetterhead): string {
  const logoUrl = lh.logoUrlForEmail?.trim() ?? "";
  const logo =
    logoUrl && /^https:\/\//i.test(logoUrl)
      ? `<div style="text-align:right;margin-bottom:10px;"><img src="${escapeHtml(logoUrl)}" alt="" width="80" height="80" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:1px solid #e8e8e8;display:inline-block;" /></div>`
      : "";
  const detail = lh.detailLines
    .map(
      (line) =>
        `<div style="font-size:11px;color:#444;line-height:1.4;text-align:right;">${escapeHtml(line)}</div>`
    )
    .join("");
  return `<div style="border-bottom:1px solid #ddd;padding-bottom:14px;margin-bottom:18px;text-align:right;">
    ${logo}
    <div style="font-weight:bold;font-size:14px;color:#111;margin-bottom:6px;">${escapeHtml(lh.displayName)}</div>
    ${detail}
  </div>`;
}

/** YYYY-MM-DD for email subject and notices (handles Date, ISO string, MySQL date string). */
function toNoticeDateLabel(value: unknown): string {
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

class CapitalCallNoticeDispatchError extends Error {
  details: any;
  constructor(message: string, details: any) {
    super(message);
    this.name = "CapitalCallNoticeDispatchError";
    this.details = details;
  }
}

function roundMoney(d: Decimal): Decimal {
  return new Decimal(d.toFixed(2, Decimal.ROUND_HALF_UP));
}

function parsePercent(raw: unknown): Decimal {
  const n = typeof raw === "string" ? parseFloat(raw) : Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 100) {
    throw new Error("callPercent must be a number between 0 and 100 (e.g. 10 for 10%)");
  }
  return new Decimal(n);
}

async function requireChartAccounts(): Promise<{ drId: string; crId: string }> {
  const [dr, cr] = await Promise.all([
    prisma.chartOfAccounts.findFirst({
      where: { accountNo: DR_ACCOUNT_NO, isActive: true },
      select: { id: true },
    }),
    prisma.chartOfAccounts.findFirst({
      where: { accountNo: CR_ACCOUNT_NO, isActive: true },
      select: { id: true },
    }),
  ]);
  if (!dr) {
    throw new Error(
      `Chart of accounts ${DR_ACCOUNT_NO} (Capital Contributions Receivable) is missing or inactive — add it before posting capital calls.`
    );
  }
  if (!cr) {
    throw new Error(
      `Chart of accounts ${CR_ACCOUNT_NO} (Partners Capital, Uncalled) is missing or inactive — add it before posting capital calls.`
    );
  }
  return { drId: dr.id, crId: cr.id };
}

/**
 * GL to debit when LPs pay a capital call (cash hitting the fund). Override per request with `cashChartOfAccountId`,
 * or set env **CAPITAL_CALL_RECEIPT_CASH_ACCOUNT_NO** (e.g. `1100`), else first active bank GL, else 1100 / Bank / Cash name match.
 */
async function resolveReceiptCashGlAccountId(explicitId?: string | null): Promise<string> {
  if (explicitId) {
    const row = await prisma.chartOfAccounts.findFirst({
      where: { id: explicitId, isActive: true },
      select: { id: true },
    });
    if (!row) {
      throw new Error("cashChartOfAccountId is not a valid active chart of accounts id");
    }
    return row.id;
  }
  const envNo = process.env.CAPITAL_CALL_RECEIPT_CASH_ACCOUNT_NO?.trim();
  if (envNo) {
    const coa = await prisma.chartOfAccounts.findFirst({
      where: { accountNo: envNo, isActive: true },
      select: { id: true },
    });
    if (!coa) {
      throw new Error(
        `CAPITAL_CALL_RECEIPT_CASH_ACCOUNT_NO=${envNo}: no active chart of accounts row with that accountNo`
      );
    }
    return coa.id;
  }
  const firstBank = await prisma.bank.findFirst({
    where: { isActive: true, glAccountId: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { glAccountId: true },
  });
  if (firstBank?.glAccountId) {
    return firstBank.glAccountId;
  }
  const fallback = await prisma.chartOfAccounts.findFirst({
    where: {
      OR: [{ accountNo: "1100" }, { accountName: { contains: "Bank" } }, { accountName: { contains: "Cash" } }],
      isActive: true,
    },
    orderBy: { accountNo: "asc" },
    select: { id: true },
  });
  if (!fallback) {
    throw new Error(
      "No cash/bank GL for capital call receipts. Pass cashChartOfAccountId on the payment request, set CAPITAL_CALL_RECEIPT_CASH_ACCOUNT_NO, or link an active bank to a GL account."
    );
  }
  return fallback.id;
}

async function resolveCurrencyId(currencyCode: string): Promise<{ id: string; code: string }> {
  const row = await prisma.currency.findFirst({
    where: { code: currencyCode.toUpperCase(), isActive: true },
    select: { id: true, code: true },
  });
  if (!row) {
    throw new Error(`Currency code ${currencyCode} not found or inactive — seed currencies first.`);
  }
  return row;
}

async function priorCalledPerCommitment(
  commitmentIds: string[]
): Promise<Map<string, Decimal>> {
  const map = new Map<string, Decimal>();
  if (commitmentIds.length === 0) return map;
  const rows = await prisma.capitalCallAllocation.groupBy({
    by: ["investmentCommitmentId"],
    where: { investmentCommitmentId: { in: commitmentIds } },
    _sum: { currentCallAmount: true },
  });
  for (const r of rows) {
    map.set(r.investmentCommitmentId, new Decimal(r._sum.currentCallAmount?.toString() ?? "0"));
  }
  return map;
}

function allocationStatus(currentCall: Decimal, paid: Decimal): string {
  if (paid.lte(0)) return "PENDING";
  if (paid.lt(currentCall)) return "PARTIALLY_PAID";
  return "PAID";
}

function capitalCallHeaderStatusLabel(status: string): string {
  const m: Record<string, string> = {
    INITIATED: "Initiated",
    NOTICES_SENT: "Notices Sent",
    PARTIALLY_PAID: "Partially Paid",
    FULLY_PAID: "Fully Paid",
  };
  return m[status] ?? status;
}

function capitalCallAllocationStatusLabel(status: string): string {
  const m: Record<string, string> = {
    PENDING: "Pending",
    PARTIALLY_PAID: "Partially Paid",
    PAID: "Paid",
  };
  return m[status] ?? status;
}

function enrichCapitalCallRow(row: any) {
  if (!row) return row;
  return {
    ...row,
    statusLabel: capitalCallHeaderStatusLabel(row.status),
    allocations: (row.allocations ?? []).map((a: any) => ({
      ...a,
      statusLabel: capitalCallAllocationStatusLabel(a.status),
    })),
  };
}

function recomputeHeaderStatus(
  rows: Array<{ currentCallAmount: Decimal; amountPaid: Decimal }>,
  noticesSent: boolean
): string {
  const statuses = rows.map((r) => allocationStatus(r.currentCallAmount, r.amountPaid));
  if (statuses.every((s) => s === "PAID")) return "FULLY_PAID";
  const anyPaymentActivity = statuses.some((s) => s === "PARTIALLY_PAID" || s === "PAID");
  if (anyPaymentActivity) return "PARTIALLY_PAID";
  return noticesSent ? "NOTICES_SENT" : "INITIATED";
}

export class CapitalCallService {
  static async initiate(params: {
    fundId: string;
    callPercent: number | string;
    paymentDueDate: Date;
    bankInstructions: string;
    transactionDate: Date;
    createdById: string;
  }) {
    const callPct = parsePercent(params.callPercent);

    const [fund, commitments] = await Promise.all([
      prisma.fund.findUnique({
        where: { id: params.fundId },
        select: { id: true, name: true },
      }),
      prisma.investmentCommitment.findMany({
        where: {
          fundId: params.fundId,
          status: { in: COMMITMENT_STATUSES_ELIGIBLE },
        },
        include: { client: { select: { id: true, legalName: true, email: true } } },
      }),
    ]);
    if (!fund) throw new Error("Fund not found");

    if (commitments.length === 0) {
      throw new Error("No eligible investment commitments found for this fund (need ACTIVE or PENDING).");
    }

    const codes = [...new Set(commitments.map((c) => c.currency.toUpperCase()))];
    if (codes.length !== 1) {
      throw new Error(
        `All commitments for a capital call must share one currency; found: ${codes.join(", ")}`
      );
    }
    const commitmentIds = commitments.map((c) => c.id);
    const [{ id: currencyId }, priorMap] = await Promise.all([
      resolveCurrencyId(codes[0]),
      priorCalledPerCommitment(commitmentIds),
    ]);

    const draftLines: Array<{
      commitmentId: string;
      clientId: string;
      lpName: string;
      totalCommitment: Decimal;
      uncalledBefore: Decimal;
      callAmount: Decimal;
    }> = [];

    for (const c of commitments) {
      const total = new Decimal(c.amount.toString());
      const prior = priorMap.get(c.id) ?? new Decimal(0);
      const uncalledBefore = roundMoney(total.minus(prior));
      if (uncalledBefore.lte(0)) continue;

      const rawCall = roundMoney(total.mul(callPct).div(100));
      const callAmount = uncalledBefore.lessThan(rawCall) ? uncalledBefore : rawCall;
      if (callAmount.lte(0)) continue;

      draftLines.push({
        commitmentId: c.id,
        clientId: c.clientId,
        lpName: c.client.legalName,
        totalCommitment: total,
        uncalledBefore,
        callAmount,
      });
    }

    if (draftLines.length === 0) {
      throw new Error("No callable balances — all commitments are fully drawn or call percent yields zero.");
    }

    const totalCall = draftLines.reduce((s, r) => s.plus(r.callAmount), new Decimal(0));
    const totalRounded = roundMoney(totalCall);
    if (totalRounded.lte(0)) throw new Error("Total call amount is zero.");

    const { drId, crId } = await requireChartAccounts();

    const referenceNumber = `CCALL-${params.fundId.slice(0, 6)}-${Date.now()}`;
    const desc = `Capital call — ${fund.name} (${callPct.toString()}%)`;

    const result = await prisma.$transaction(
      async (tx) => {
        const journalEntry = await assignNextAuditIdAndCreateJournal(tx, {
          transactionDate: params.transactionDate,
          referenceNumber,
          description: desc,
          totalAmount: totalRounded,
          currencyId,
          status: "POSTED",
          createdById: params.createdById,
        });

        await tx.journalEntryLine.createMany({
          data: [
            {
              journalEntryId: journalEntry.id,
              chartOfAccountId: drId,
              debitAmount: totalRounded,
              creditAmount: new Decimal(0),
              description: `${DR_ACCOUNT_NO} — Capital contributions receivable (${fund.name})`,
            },
            {
              journalEntryId: journalEntry.id,
              chartOfAccountId: crId,
              debitAmount: new Decimal(0),
              creditAmount: totalRounded,
              description: `${CR_ACCOUNT_NO} — Partners capital uncalled (${fund.name})`,
            },
          ],
        });

        const capitalCall = await tx.capitalCall.create({
          data: {
            fundId: params.fundId,
            currencyId,
            callPercent: callPct,
            paymentDueDate: params.paymentDueDate,
            bankInstructions: params.bankInstructions.trim(),
            transactionDate: params.transactionDate,
            journalEntryId: journalEntry.id,
            status: "INITIATED",
            createdById: params.createdById,
          },
        });

        await tx.capitalCallAllocation.createMany({
          data: draftLines.map((row) => ({
            capitalCallId: capitalCall.id,
            clientId: row.clientId,
            investmentCommitmentId: row.commitmentId,
            lpLegalNameSnapshot: row.lpName,
            totalCommitmentSnapshot: row.totalCommitment,
            uncalledCapitalBeforeSnapshot: row.uncalledBefore,
            currentCallAmount: row.callAmount,
            amountPaid: new Decimal(0),
            status: "PENDING",
          })),
        });

        return { capitalCallId: capitalCall.id, journalEntryId: journalEntry.id };
      },
      { maxWait: 5000, timeout: 12_000 }
    );

    const detail = await this.getById(params.fundId, result.capitalCallId);
    return detail;
  }

  static async listForFund(fundId: string) {
    const [fund, rows] = await Promise.all([
      prisma.fund.findUnique({ where: { id: fundId }, select: { id: true } }),
      prisma.capitalCall.findMany({
        where: { fundId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          callPercent: true,
          paymentDueDate: true,
          transactionDate: true,
          status: true,
          noticesSentAt: true,
          journalEntryId: true,
          createdAt: true,
          _count: { select: { allocations: true } },
        },
      }),
    ]);
    if (!fund) throw new Error("Fund not found");
    return rows.map((r: any) => ({
      ...r,
      statusLabel: capitalCallHeaderStatusLabel(r.status),
    }));
  }

  static async getById(fundId: string, capitalCallId: string) {
    const row = await prisma.capitalCall.findFirst({
      where: { id: capitalCallId, fundId },
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
    if (!row) throw new Error("Capital call not found");
    return enrichCapitalCallRow(row);
  }

  static async fundLpDashboardSummary(fundId: string) {
    const [fund, commitments] = await Promise.all([
      prisma.fund.findUnique({ where: { id: fundId }, select: { id: true } }),
      prisma.investmentCommitment.findMany({
        where: {
          fundId,
          status: { in: COMMITMENT_STATUSES_ELIGIBLE },
        },
        include: { client: { select: { id: true, legalName: true, email: true } } },
      }),
    ]);
    if (!fund) throw new Error("Fund not found");

    const commitmentIds = commitments.map((c) => c.id);
    const [priorMap, paidRows, outstandingRows] = await Promise.all([
      priorCalledPerCommitment(commitmentIds),
      commitmentIds.length
        ? prisma.capitalCallAllocation.groupBy({
            by: ["investmentCommitmentId"],
            where: { investmentCommitmentId: { in: commitmentIds } },
            _sum: { amountPaid: true },
          })
        : Promise.resolve(
            [] as Array<{ investmentCommitmentId: string; _sum: { amountPaid: unknown } }>
          ),
      commitmentIds.length
        ? prisma.capitalCallAllocation.findMany({
            where: { investmentCommitmentId: { in: commitmentIds } },
            select: {
              investmentCommitmentId: true,
              currentCallAmount: true,
              amountPaid: true,
            },
          })
        : Promise.resolve([]),
    ]);
    const paidMap = new Map<string, Decimal>();
    for (const p of paidRows) {
      paidMap.set(p.investmentCommitmentId, new Decimal(p._sum.amountPaid?.toString() ?? "0"));
    }
    const outstandingByCommitment = new Map<string, Decimal>();
    for (const o of outstandingRows) {
      const due = new Decimal(o.currentCallAmount.toString()).minus(new Decimal(o.amountPaid.toString()));
      if (due.gt(0)) {
        const cur = outstandingByCommitment.get(o.investmentCommitmentId) ?? new Decimal(0);
        outstandingByCommitment.set(o.investmentCommitmentId, cur.plus(due));
      }
    }

    return {
      fundId,
      byLp: commitments.map((c) => {
        const total = new Decimal(c.amount.toString());
        const cumulativeCalled = priorMap.get(c.id) ?? new Decimal(0);
        const uncalledCommitmentBalance = roundMoney(total.minus(cumulativeCalled));
        const amountReceivedTowardCalls = roundMoney(paidMap.get(c.id) ?? new Decimal(0));
        const outstandingCallBalance = roundMoney(outstandingByCommitment.get(c.id) ?? new Decimal(0));
        const netRaw = uncalledCommitmentBalance.minus(amountReceivedTowardCalls);
        const uncalledCapitalNetOfReceipts = roundMoney(
          netRaw.lt(0) ? new Decimal(0) : netRaw
        );
        return {
          clientId: c.clientId,
          legalName: c.client.legalName,
          email: c.client.email,
          commitmentId: c.id,
          currency: c.currency,
          totalCommitment: total.toNumber(),
          cumulativeCalled: cumulativeCalled.toNumber(),
          uncalledCommitmentBalance: uncalledCommitmentBalance.toNumber(),
          amountReceivedTowardCalls: amountReceivedTowardCalls.toNumber(),
          outstandingCallBalance: outstandingCallBalance.toNumber(),
          uncalledCapitalNetOfReceipts: uncalledCapitalNetOfReceipts.toNumber(),
        };
      }),
    };
  }

  /**
   * JSON notice payload (same facts as the email PDF attachment).
   * Amounts are numbers in fund currency; dates are ISO date strings (YYYY-MM-DD).
   */
  static async getNoticeDataForFrontend(fundId: string, capitalCallId: string, allocationId: string) {
    const allocation = await prisma.capitalCallAllocation.findFirst({
      where: { id: allocationId, capitalCallId, capitalCall: { fundId } },
      select: {
        id: true,
        lpLegalNameSnapshot: true,
        totalCommitmentSnapshot: true,
        uncalledCapitalBeforeSnapshot: true,
        currentCallAmount: true,
        capitalCall: {
          select: {
            id: true,
            callPercent: true,
            paymentDueDate: true,
            bankInstructions: true,
            fund: { select: { id: true, name: true } },
            currency: { select: { code: true, symbol: true } },
          },
        },
      },
    });
    if (!allocation) throw new Error("Allocation not found");

    const paymentDueDate = toNoticeDateLabel(allocation.capitalCall.paymentDueDate);

    const fundName = allocation.capitalCall.fund.name;

    return {
      fundId: allocation.capitalCall.fund.id,
      capitalCallId: allocation.capitalCall.id,
      allocationId: allocation.id,
      fundName,
      lpLegalName: allocation.lpLegalNameSnapshot,
      currencyCode: allocation.capitalCall.currency.code,
      currencySymbol: allocation.capitalCall.currency.symbol,
      callPercent: Number(allocation.capitalCall.callPercent.toString()),
      totalCommitment: Number(allocation.totalCommitmentSnapshot.toString()),
      uncalledCapital: Number(allocation.uncalledCapitalBeforeSnapshot.toString()),
      uncalledCapitalBeforeThisCall: Number(allocation.uncalledCapitalBeforeSnapshot.toString()),
      currentCallAmount: Number(allocation.currentCallAmount.toString()),
      paymentDueDate,
      bankInstructions: allocation.capitalCall.bankInstructions,
      emailSubjectHint: capitalCallNoticeEmailSubject(fundName, paymentDueDate),
    };
  }

  static async sendNotices(fundId: string, capitalCallId: string) {
    const call = await this.getById(fundId, capitalCallId);
    const fundName = call.fund?.name;
    if (!fundName) throw new Error("Fund not found");

    const dateLabel = toNoticeDateLabel(call.paymentDueDate);

    const candidates = call.allocations.map((a) => ({
      allocation: a,
      rawEmail: String(a.client?.email ?? ""),
      email: normalizeEmail(a.client?.email),
    }));
    const skippedRecipients = candidates
      .filter((x) => x.email == null)
      .map((x) => ({
        allocationId: x.allocation.id,
        lpName: x.allocation.lpLegalNameSnapshot,
        rawEmail: x.rawEmail,
        reason: "Missing or invalid email",
      }));
    const toSend = candidates
      .filter((x) => x.email != null);
    const attemptedRecipients = toSend.map((x) => ({
      allocationId: x.allocation.id,
      lpName: x.allocation.lpLegalNameSnapshot,
      email: x.email as string,
    }));
    if (toSend.length === 0) {
      throw new CapitalCallNoticeDispatchError(
        "No allocations with a valid client email — cannot send notices.",
        {
          attemptedCount: 0,
          sentCount: 0,
          failedCount: 0,
          skippedCount: skippedRecipients.length,
          attemptedRecipients,
          attemptedEmails: [],
          sentRecipients: [],
          sentEmails: [],
          failedRecipients: [],
          failedEmails: [],
          skippedRecipients,
        }
      );
    }

    const fmt = (n: number) =>
      n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const ccy = call.currency.code;
    const fundNameEsc = escapeHtml(fundName);
    const sentRecipients: Array<{ allocationId: string; lpName: string; email: string }> = [];

    const letterhead = await loadCapitalCallAccountingLetterhead();
    const letterheadHtml = capitalCallEmailLetterheadBlockHtml(letterhead);

    const concurrency = capitalCallEmailConcurrency();
    const failures = await runPool(toSend, concurrency, async (row) => {
      const a = row.allocation;
      const email = row.email as string;
      const totalCommitment = Number(a.totalCommitmentSnapshot.toString());
      const uncalled = Number(a.uncalledCapitalBeforeSnapshot.toString());
      const callAmount = Number(a.currentCallAmount.toString());
      const lpEsc = escapeHtml(a.lpLegalNameSnapshot);

      const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;line-height:1.5;color:#222;">
        ${letterheadHtml}
        <p>Dear ${lpEsc},</p>
        <p>This is your <strong>capital call notice</strong> for <strong>${fundNameEsc}</strong> (${escapeHtml(ccy)}).</p>
        <table style="border-collapse:collapse;margin:16px 0;" cellpadding="8">
          <tr><td style="border:1px solid #ccc;"><strong>LP name</strong></td><td style="border:1px solid #ccc;">${lpEsc}</td></tr>
          <tr><td style="border:1px solid #ccc;"><strong>Total commitment</strong></td><td style="border:1px solid #ccc;">${escapeHtml(ccy)} ${fmt(totalCommitment)}</td></tr>
          <tr><td style="border:1px solid #ccc;"><strong>Uncalled capital (before this call)</strong></td><td style="border:1px solid #ccc;">${escapeHtml(ccy)} ${fmt(uncalled)}</td></tr>
          <tr><td style="border:1px solid #ccc;"><strong>Current call amount</strong></td><td style="border:1px solid #ccc;">${escapeHtml(ccy)} ${fmt(callAmount)}</td></tr>
          <tr><td style="border:1px solid #ccc;"><strong>Payment due date</strong></td><td style="border:1px solid #ccc;">${escapeHtml(dateLabel)}</td></tr>
          <tr><td style="border:1px solid #ccc;vertical-align:top;"><strong>Bank instructions</strong></td><td style="border:1px solid #ccc;white-space:pre-wrap;">${escapeHtml(String(call.bankInstructions))}</td></tr>
        </table>
        <p style="color:#666;font-size:12px;text-align:right;">${escapeHtml(letterhead.displayName)}</p>
      </body></html>`;

      const callPercentNum = Number(call.callPercent.toString());
      const pdfBuffer = await buildCapitalCallNoticePdfBuffer({
        fundName,
        lpLegalName: a.lpLegalNameSnapshot,
        currencyCode: ccy,
        callPercent: callPercentNum,
        totalCommitment,
        uncalledCapitalBeforeCall: uncalled,
        currentCallAmount: callAmount,
        paymentDueDate: dateLabel,
        bankInstructions: String(call.bankInstructions),
        letterhead,
      });
      const pdfFilename = `Capital-Call-Notice-${safePdfFileBaseName(fundName)}-${dateLabel}.pdf`;

      await EmailNotificationService.sendCapitalCallNoticeEmail({
        lpEmail: email,
        lpDisplayName: a.lpLegalNameSnapshot,
        fundName,
        subjectDateLabel: dateLabel,
        html,
        pdfAttachment: { filename: pdfFilename, content: pdfBuffer },
      });
      sentRecipients.push({
        allocationId: a.id,
        lpName: a.lpLegalNameSnapshot,
        email,
      });
    });

    const failedRecipients = failures.map((f) => {
      const row: any = f.item;
      return {
        allocationId: row.allocation.id,
        lpName: row.allocation.lpLegalNameSnapshot,
        email: row.email as string,
        error: f.error.message,
      };
    });
    const report = {
      attemptedCount: attemptedRecipients.length,
      sentCount: sentRecipients.length,
      failedCount: failedRecipients.length,
      skippedCount: skippedRecipients.length,
      attemptedRecipients,
      attemptedEmails: attemptedRecipients.map((r) => r.email),
      sentRecipients,
      sentEmails: sentRecipients.map((r) => r.email),
      failedRecipients,
      failedEmails: failedRecipients.map((r) => r.email),
      skippedRecipients,
    };
    if (failedRecipients.length > 0) {
      throw new CapitalCallNoticeDispatchError(
        `Capital call notices: ${failedRecipients.length} recipient(s) failed (first: ${failedRecipients[0].error}).`,
        report
      );
    }

    await prisma.capitalCall.update({
      where: { id: capitalCallId },
      data: {
        noticesSentAt: new Date(),
        status: call.status === "INITIATED" ? "NOTICES_SENT" : call.status,
      },
    });

    const data = await this.getById(fundId, capitalCallId);
    return { ...data, noticeDispatch: report };
  }

  static async recordAllocationPayment(params: {
    fundId: string;
    capitalCallId: string;
    allocationId: string;
    amount: number | string;
    createdById: string;
    /** GL posting date; defaults to UTC start of today. */
    transactionDate?: Date;
    /** Debit this GL (cash/bank). If omitted, uses env / first bank GL / 1100 fallback. */
    cashChartOfAccountId?: string;
  }) {
    const amt = new Decimal(typeof params.amount === "string" ? params.amount : String(params.amount));
    if (!amt.isFinite() || amt.lte(0)) {
      throw new Error("amount must be a positive number");
    }

    const allocation = await prisma.capitalCallAllocation.findFirst({
      where: {
        id: params.allocationId,
        capitalCallId: params.capitalCallId,
        capitalCall: { fundId: params.fundId },
      },
      include: {
        capitalCall: {
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

    const callAmount = new Decimal(allocation.currentCallAmount.toString());
    const paid = new Decimal(allocation.amountPaid.toString());
    const remaining = callAmount.minus(paid);
    if (remaining.lte(0)) throw new Error("This allocation is already fully paid.");
    if (amt.gt(remaining)) {
      throw new Error(`Payment exceeds remaining balance (${remaining.toFixed(2)}).`);
    }

    const newPaid = roundMoney(paid.plus(amt));
    const st = allocationStatus(callAmount, newPaid);

    const noticesSent = allocation.capitalCall?.noticesSentAt != null;
    const amtPosted = roundMoney(amt);
    const currencyId = allocation.capitalCall.currencyId;
    const fundName = allocation.capitalCall.fund.name;
    const txDate = params.transactionDate ?? new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z");

    const [{ drId: receivableId }, cashGlId] = await Promise.all([
      requireChartAccounts(),
      resolveReceiptCashGlAccountId(params.cashChartOfAccountId ?? null),
    ]);

    const referenceNumber = `CCALLPAY-${params.allocationId.slice(0, 8)}-${Date.now()}`;
    const desc = `LP capital call receipt — ${fundName} — ${allocation.lpLegalNameSnapshot}`;

    await prisma.$transaction(
      async (tx) => {
        await tx.capitalCallAllocationPayment.create({
          data: {
            capitalCallAllocationId: params.allocationId,
            amount: amtPosted,
          },
        });
        await tx.capitalCallAllocation.update({
          where: { id: params.allocationId },
          data: { amountPaid: newPaid, status: st },
        });
        const allRows = await tx.capitalCallAllocation.findMany({
          where: { capitalCallId: params.capitalCallId },
          select: { currentCallAmount: true, amountPaid: true },
        });
        const hdr = recomputeHeaderStatus(
          allRows.map((r) => ({
            currentCallAmount: new Decimal(r.currentCallAmount.toString()),
            amountPaid: new Decimal(r.amountPaid.toString()),
          })),
          noticesSent
        );
        await tx.capitalCall.update({
          where: { id: params.capitalCallId },
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
              description: `Cash/bank — capital call receipt (${fundName})`,
            },
            {
              journalEntryId: journalEntry.id,
              chartOfAccountId: receivableId,
              debitAmount: new Decimal(0),
              creditAmount: amtPosted,
              description: `${DR_ACCOUNT_NO} — Clear capital contributions receivable (${fundName})`,
            },
          ],
        });
      },
      { maxWait: 8000, timeout: 20_000 }
    );

    return this.getById(params.fundId, params.capitalCallId);
  }

  /**
   * Ledger for one allocation: shared context (fund, call, LP, currency, JE link) plus payment rows (newest first).
   * Each row includes cumulative paid through that receipt and remaining call balance after it.
   */
  static async listAllocationPayments(fundId: string, capitalCallId: string, allocationId: string) {
    const allocation = await prisma.capitalCallAllocation.findFirst({
      where: { id: allocationId, capitalCallId, capitalCall: { fundId } },
      include: {
        client: { select: { id: true, legalName: true, email: true } },
        capitalCall: {
          select: {
            id: true,
            callPercent: true,
            paymentDueDate: true,
            transactionDate: true,
            fund: { select: { id: true, name: true } },
            currency: { select: { code: true, symbol: true } },
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
        },
      },
    });
    if (!allocation) throw new Error("Allocation not found");

    const asc = await prisma.capitalCallAllocationPayment.findMany({
      where: { capitalCallAllocationId: allocationId },
      orderBy: [{ recordedAt: "asc" }, { id: "asc" }],
    });

    let cumulative = new Decimal(0);
    const cumulativeById = new Map<string, Decimal>();
    for (const p of asc) {
      cumulative = roundMoney(cumulative.plus(new Decimal(p.amount.toString())));
      cumulativeById.set(p.id, cumulative);
    }

    const currentCall = new Decimal(allocation.currentCallAmount.toString());
    const amountPaidTotal = new Decimal(allocation.amountPaid.toString());
    const call = allocation.capitalCall;

    const context = {
      fundId: call.fund.id,
      fundName: call.fund.name,
      capitalCallId: call.id,
      callPercent: Number(call.callPercent.toString()),
      paymentDueDate: toNoticeDateLabel(call.paymentDueDate),
      callTransactionDate: toNoticeDateLabel(call.transactionDate),
      currencyCode: call.currency.code,
      currencySymbol: call.currency.symbol,
      journalEntry: call.journalEntry
        ? {
            id: call.journalEntry.id,
            referenceNumber: call.journalEntry.referenceNumber,
            transactionDate: toNoticeDateLabel(call.journalEntry.transactionDate),
            status: call.journalEntry.status,
            auditTrailSequenceNumber: call.journalEntry.auditTrailSequenceNumber,
          }
        : null,
      allocation: {
        id: allocation.id,
        lpLegalNameSnapshot: allocation.lpLegalNameSnapshot,
        clientId: allocation.clientId,
        clientLegalName: allocation.client?.legalName ?? null,
        clientEmail: allocation.client?.email ?? null,
        totalCommitmentSnapshot: Number(allocation.totalCommitmentSnapshot.toString()),
        uncalledCapitalBeforeSnapshot: Number(allocation.uncalledCapitalBeforeSnapshot.toString()),
        currentCallAmount: Number(currentCall.toString()),
        amountPaidToDate: Number(amountPaidTotal.toString()),
        remainingOnCall: Number(roundMoney(currentCall.minus(amountPaidTotal)).toString()),
        status: allocation.status,
        statusLabel: capitalCallAllocationStatusLabel(allocation.status),
      },
    };

    const desc = [...asc].reverse();
    const payments = desc.map((p) => {
      const cum = cumulativeById.get(p.id) ?? new Decimal(0);
      const rem = roundMoney(currentCall.minus(cum));
      return {
        id: p.id,
        capitalCallAllocationId: p.capitalCallAllocationId,
        amount: p.amount,
        recordedAt: p.recordedAt,
        createdAt: p.createdAt,
        cumulativePaidThroughThisPayment: Number(cum.toString()),
        remainingOnCallAfterThisPayment: Number(rem.toString()),
      };
    });

    return { context, payments };
  }
}
