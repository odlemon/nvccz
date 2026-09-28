// @ts-nocheck
/**
 * The bank side of a journal raised by another module (an asset bought or sold through a bank account, a short-term
 * investment placed or settled). Such journals debit or credit the bank's ledger account directly; without a cashbook
 * line the cashbook and the ledger disagree and the movement can never be reconciled (FINDINGS C-05 / I-01). This records
 * the cashbook line for it, linked to the journal (journalEntryId), without posting a second journal: the line is POSTED
 * when the journal is posted and PENDING while the journal is a draft; JournalEntryService keeps it in step when the
 * journal is later posted or voided. The owning module reverses it, not the cashbook (see OWNED_PREFIXES).
 */
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../utils/database";

/** Journal references whose bank line is owned by another module. */
export const OWNED_PREFIXES: Array<[RegExp, string]> = [
  [/^ASSET-/, "the fixed asset register (asset purchase)"],
  [/^DISPOSAL-/, "the fixed asset register (asset disposal)"],
  [/^STI-PLC-/, "short-term investments (placement)"],
  [/^STI-SET-/, "short-term investments (settlement)"],
  [/^CCALLPAY-/, "the fund's capital calls (an LP's payment)"],
  [/^DISTPAY-/, "the fund's distributions (an LP payout)"],
  [/^PERF-/, "performance (a goal-linked posting)"],
  [/^CLMPAY-/, "employee expense claims (a reimbursement)"],
];
export const ownerOfBankLine = (ref?: string | null) => (OWNED_PREFIXES.find(([re]) => re.test(String(ref || ""))) || [])[1] || null;

export async function recordBankLeg(
  client: any,
  p: { bankId: string; journalEntryId: string; journalStatus: string; type: "RECEIPT" | "PAYMENT"; amount: any; transactionDate: Date; description: string; reference?: string | null; contraAccountId?: string | null; createdById: string }
) {
  const db = client || prisma;
  const existing = await db.cashbookEntry.findFirst({ where: { journalEntryId: p.journalEntryId } });
  if (existing) return existing;
  const posted = p.journalStatus === "POSTED";
  return db.cashbookEntry.create({
    data: {
      bankId: p.bankId,
      transactionDate: p.transactionDate,
      type: p.type,
      amount: new Decimal(p.amount.toString ? p.amount.toString() : p.amount),
      reference: p.reference ? String(p.reference).slice(0, 50) : null,
      description: String(p.description || "").slice(0, 190),
      status: posted ? "POSTED" : "PENDING",
      counterpartyType: "GL",
      glAccountId: p.contraAccountId || null,
      journalEntryId: p.journalEntryId,
      createdById: p.createdById,
      ...(posted ? { postedAt: new Date(), postedById: p.createdById } : {}),
    },
  });
}

/**
 * The bank side of any journal: when a journal (posted or draft) debits or credits exactly one bank account's ledger
 * account and has no cashbook line yet, record it — a receipt for a debit, a payment for a credit, the other line's
 * account as the counterpart when there is only one. Every module that pays or receives through the ledger (capital
 * calls, distributions, performance postings, …) is covered, including one written later. Returns the line, or null
 * when the journal touches no bank or more than one (a transfer between banks has its own cashbook entries).
 */
export async function ensureBankLeg(journalEntryId: string) {
  const je = await prisma.journalEntry.findUnique({
    where: { id: journalEntryId },
    select: { id: true, referenceNumber: true, description: true, transactionDate: true, status: true, createdById: true, cashbookEntries: { select: { id: true }, take: 1 }, journalEntryLines: { select: { chartOfAccountId: true, debitAmount: true, creditAmount: true } } },
  });
  if (!je || je.status === "VOID" || je.cashbookEntries.length) return null;
  if (/^(VR|REV)-/.test(je.referenceNumber)) return null;
  const glIds = [...new Set(je.journalEntryLines.map((l) => l.chartOfAccountId))];
  const banks = await prisma.bank.findMany({ where: { glAccountId: { in: glIds } }, select: { id: true, glAccountId: true } });
  if (banks.length !== 1) return null;
  const bank = banks[0];
  const net = je.journalEntryLines.filter((l) => l.chartOfAccountId === bank.glAccountId).reduce((s, l) => s + Number(l.debitAmount) - Number(l.creditAmount), 0);
  if (Math.abs(net) < 0.005) return null;
  const others = [...new Set(je.journalEntryLines.filter((l) => l.chartOfAccountId !== bank.glAccountId).map((l) => l.chartOfAccountId))];
  return recordBankLeg(prisma, {
    bankId: bank.id, journalEntryId: je.id, journalStatus: je.status, type: net > 0 ? "RECEIPT" : "PAYMENT", amount: Math.round(Math.abs(net) * 100) / 100,
    transactionDate: je.transactionDate, description: je.description, reference: je.referenceNumber, contraAccountId: others.length === 1 ? others[0] : null, createdById: je.createdById,
  });
}

/** Every posted or draft journal touching a bank account without a cashbook line (the nightly sweep and the backfill). */
export async function recordMissingBankLegs(opts: { dryRun?: boolean } = {}) {
  const bankGl = (await prisma.bank.findMany({ where: { glAccountId: { not: null } }, select: { glAccountId: true } })).map((b) => b.glAccountId);
  if (!bankGl.length) return { found: 0, recorded: 0, skipped: [] };
  const rows = await prisma.journalEntry.findMany({
    where: { status: { in: ["POSTED", "PENDING"] }, cashbookEntries: { none: {} }, journalEntryLines: { some: { chartOfAccountId: { in: bankGl } } }, NOT: [{ referenceNumber: { startsWith: "VR-" } }, { referenceNumber: { startsWith: "REV-" } }] },
    select: { id: true, referenceNumber: true },
  });
  let recorded = 0; const skipped = [];
  for (const r of rows) {
    if (opts.dryRun) continue;
    const line = await ensureBankLeg(r.id).catch((e) => { skipped.push(`${r.referenceNumber}: ${e.message}`); return null; });
    if (line) recorded++; else skipped.push(r.referenceNumber);
  }
  return { found: rows.length, recorded, skipped: skipped.slice(0, 50) };
}
