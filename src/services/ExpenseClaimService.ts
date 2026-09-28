// @ts-nocheck
/**
 * Employee expense claims (SRD ACC-EXP-03…07, UIR 13, finding EX-05).
 *
 * An employee itemises what they spent (date, category, description, amount, VAT, receipt) and submits the claim. It then
 * goes through three people, none of whom may be the claimant:
 *   1. the line manager — someone with line-management rights (accounting.timesheets.manage) in the claimant's
 *      department, or organisation-wide — confirms the spending was for the business;
 *   2. a finance reviewer (manage_accounting) checks the receipts and the policy and assigns the expense account per line;
 *   3. a finance manager (manage_ledger), not the reviewer, approves it: the claim is owed to the employee and the
 *      journal is posted — Dr each line's expense account (and VAT input), Cr 2260 Staff Claims Payable.
 * Anyone in the chain can return it to the claimant with what to correct; the finance manager can reject it. A claim
 * that breaks the policy (a possible duplicate, over a category's daily limit) can still be approved, but only with a
 * note saying why. A line above the receipt threshold without a receipt cannot be submitted.
 * Reimbursement pays an approved claim from a bank account: Dr 2260 / Cr the bank, with its cashbook line.
 *
 * DRAFT / RETURNED → SUBMITTED → MANAGER_APPROVED → REVIEWED → APPROVED → REIMBURSED; REJECTED and WITHDRAWN are final.
 */
import crypto from "crypto";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../utils/database";
import AuditService from "./AuditService";
import PeriodLockService from "./PeriodLockService";
import { userHasEffectivePermission } from "../config/cfoModulePermissions";
import { assignNextAuditIdAndCreateJournal } from "./AuditTrailSequenceService";
import { vatInputAccount } from "../utils/vatAccounts";
import { recordBankLeg } from "./CashbookJournalLinkService";
import { InventoryLedgerService } from "./InventoryLedgerService";
import { TimesheetService } from "./TimesheetService";

const fail = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const r2 = (x: number) => Math.round(Number(x) * 100) / 100;
const audit = (userId, action, id, values) => AuditService.log({ userId, action, entityType: "ExpenseClaim", entityId: id, newValues: values }).catch(() => null);
const can = (user, key) => userHasEffectivePermission(user, key);
const EDITABLE = ["DRAFT", "RETURNED"];
const IN_FLIGHT = ["SUBMITTED", "MANAGER_APPROVED", "REVIEWED"];
const PAYABLE_ACCOUNT_NO = "2260";
const POLICY_KEY = "claims.policy";
const DEFAULT_POLICY = { receiptRequiredAbove: 25, dailyLimits: {} as Record<string, number>, categoryAccounts: {} as Record<string, string> };
const ymd = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

async function claimRow(id: string) {
  const [c] = await prisma.$queryRawUnsafe<any[]>("SELECT * FROM expense_claims WHERE id = ?", id);
  if (!c) throw fail("Claim not found", 404);
  return c;
}
async function linesOf(id: string) {
  return prisma.$queryRawUnsafe<any[]>("SELECT * FROM expense_claim_lines WHERE claim_id = ? ORDER BY line_date, id", id);
}
async function setStatus(id: string, fields: Record<string, any>) {
  const keys = Object.keys(fields);
  await prisma.$executeRawUnsafe(`UPDATE expense_claims SET ${keys.map((k) => `\`${k}\` = ?`).join(", ")} WHERE id = ?`, ...keys.map((k) => fields[k]), id);
}
async function recomputeTotal(id: string) {
  await prisma.$executeRawUnsafe("UPDATE expense_claims SET total = (SELECT COALESCE(SUM(amount), 0) FROM expense_claim_lines WHERE claim_id = ?) WHERE id = ?", id, id);
}

async function nextReference(day: Date) {
  const stem = `CLM-${ymd(day).replace(/-/g, "")}-`;
  const [row] = await prisma.$queryRawUnsafe<any[]>("SELECT COUNT(*) AS n FROM expense_claims WHERE reference LIKE ?", `${stem}%`);
  return `${stem}${String(Number(row?.n || 0) + 1).padStart(3, "0")}`;
}

/** The account a line's category posts to unless the reviewer picks another: the policy's mapping, else travel → 5070, else 5090. */
async function defaultAccountFor(categoryId: string | null, policy) {
  if (categoryId && policy.categoryAccounts?.[categoryId]) return policy.categoryAccounts[categoryId];
  const cat = categoryId ? await prisma.expenseCategory.findUnique({ where: { id: categoryId }, select: { name: true } }) : null;
  const no = cat && /travel|accommodation|subsistence|per diem/i.test(cat.name) ? "5070" : "5090";
  const a = await prisma.chartOfAccounts.findUnique({ where: { accountNo: no }, select: { id: true } });
  return a?.id || null;
}

export class ExpenseClaimService {
  static async policy() {
    const [row] = await prisma.$queryRawUnsafe<any[]>("SELECT value FROM accounting_settings WHERE setting_key = ?", POLICY_KEY);
    const v = row ? (typeof row.value === "string" ? JSON.parse(row.value) : row.value) : {};
    return { ...DEFAULT_POLICY, ...v };
  }

  static async savePolicy(input: any, user: any) {
    if (!can(user, "manage_ledger")) throw fail("Only a finance manager can change the claims policy.", 403);
    const cur = await this.policy();
    const next = {
      receiptRequiredAbove: input.receiptRequiredAbove == null ? cur.receiptRequiredAbove : Math.max(0, Number(input.receiptRequiredAbove) || 0),
      dailyLimits: Object.fromEntries(Object.entries(input.dailyLimits || cur.dailyLimits || {}).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)])),
      categoryAccounts: Object.fromEntries(Object.entries(input.categoryAccounts || cur.categoryAccounts || {}).filter(([, v]) => !!v)),
    };
    for (const id of Object.values(next.categoryAccounts)) {
      const a = await prisma.chartOfAccounts.findUnique({ where: { id: String(id) }, select: { isActive: true, accountType: true } });
      if (!a || !a.isActive) throw fail("A category is mapped to an account that is missing or switched off.");
    }
    await prisma.$executeRawUnsafe("INSERT INTO accounting_settings (setting_key, value, updated_by_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value), updated_by_id = VALUES(updated_by_id), updated_at = CURRENT_TIMESTAMP(3)", POLICY_KEY, JSON.stringify(next), user.id);
    await AuditService.log({ userId: user.id, action: "UPDATE", entityType: "ExpenseClaimPolicy", entityId: POLICY_KEY, oldValues: cur, newValues: next }).catch(() => null);
    return next;
  }

  /** What the viewer can see: their own claims, and the ones waiting on them (or that they can act on). */
  static async list(user: any, scope = "mine") {
    let rows: any[];
    if (scope === "mine") rows = await prisma.$queryRawUnsafe("SELECT * FROM expense_claims WHERE claimant_id = ? ORDER BY created_at DESC LIMIT 300", user.id);
    else if (scope === "all") {
      if (!["view_accounting", "manage_accounting", "view_ledger", "manage_ledger"].some((k) => can(user, k))) throw fail("Your role does not include the claims register.", 403);
      rows = await prisma.$queryRawUnsafe("SELECT * FROM expense_claims WHERE status <> 'DRAFT' ORDER BY created_at DESC LIMIT 500");
    } else {
      // waiting on me
      const out = [];
      if (can(user, "accounting.timesheets.manage")) {
        const reach = await TimesheetService.approverReach(user.id);
        const sub: any[] = await prisma.$queryRawUnsafe("SELECT * FROM expense_claims WHERE status = 'SUBMITTED' AND claimant_id <> ?", user.id);
        for (const c of sub) if (await this.inReach(reach, c.claimant_id)) out.push(c);
      }
      if (can(user, "manage_accounting")) out.push(...(await prisma.$queryRawUnsafe<any[]>("SELECT * FROM expense_claims WHERE status = 'MANAGER_APPROVED' AND claimant_id <> ?", user.id)));
      if (can(user, "manage_ledger")) {
        out.push(...(await prisma.$queryRawUnsafe<any[]>("SELECT * FROM expense_claims WHERE status = 'REVIEWED' AND claimant_id <> ? AND (reviewer_id IS NULL OR reviewer_id <> ?)", user.id, user.id)));
        out.push(...(await prisma.$queryRawUnsafe<any[]>("SELECT * FROM expense_claims WHERE status = 'APPROVED' AND claimant_id <> ?", user.id)));
      }
      rows = out;
    }
    return this.decorate(rows);
  }

  static async inReach(reach, claimantId: string) {
    if (reach.all) return true;
    const owner: any = await prisma.user.findUnique({ where: { id: claimantId }, select: { userDepartment: true, departmentId: true } });
    return (!!reach.departmentId && owner?.departmentId === reach.departmentId) || (!!owner?.userDepartment && reach.departments.includes(owner.userDepartment));
  }

  static async decorate(rows: any[]) {
    const ids = [...new Set(rows.flatMap((c) => [c.claimant_id, c.manager_id, c.reviewer_id, c.approver_id, c.reimbursed_by_id]).filter(Boolean))];
    const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true, email: true } }) : [];
    const name = (id) => { const u = users.find((x) => x.id === id); return u ? `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email : null; };
    return rows.map((c) => ({
      id: c.id, reference: c.reference, title: c.title, purpose: c.purpose, tripFrom: ymd(c.trip_from), tripTo: ymd(c.trip_to), projectId: c.project_id,
      currency: c.currency_code, status: c.status, total: Number(c.total), exceptions: c.exceptions ? (typeof c.exceptions === "string" ? JSON.parse(c.exceptions) : c.exceptions) : [],
      claimantId: c.claimant_id, claimant: name(c.claimant_id), submittedAt: c.submitted_at,
      manager: name(c.manager_id), managerAt: c.manager_at, reviewer: name(c.reviewer_id), reviewerAt: c.reviewer_at,
      approver: name(c.approver_id), approverAt: c.approver_at, exceptionNote: c.exception_note, returnReason: c.return_reason,
      journalEntryId: c.journal_entry_id, reimbursedAt: c.reimbursed_at, reimbursedBy: name(c.reimbursed_by_id), reimbursementJournalId: c.reimbursement_journal_id, createdAt: c.created_at,
    }));
  }

  static async get(id: string, user: any) {
    const c = await claimRow(id);
    const finance = ["view_accounting", "manage_accounting", "view_ledger", "manage_ledger"].some((k) => can(user, k));
    let manager = false;
    if (!finance && c.claimant_id !== user.id && can(user, "accounting.timesheets.manage")) manager = await this.inReach(await TimesheetService.approverReach(user.id), c.claimant_id);
    if (c.claimant_id !== user.id && !finance && !manager) throw fail("You cannot see this claim.", 403);
    const [claim] = await this.decorate([c]);
    const lines = await linesOf(id);
    const catIds = [...new Set(lines.map((l) => l.category_id).filter(Boolean))];
    const accIds = [...new Set(lines.map((l) => l.account_id).filter(Boolean))];
    const cats = catIds.length ? await prisma.expenseCategory.findMany({ where: { id: { in: catIds } }, select: { id: true, name: true } }) : [];
    const accs = accIds.length ? await prisma.chartOfAccounts.findMany({ where: { id: { in: accIds } }, select: { id: true, accountNo: true, accountName: true } }) : [];
    const refs = [c.journal_entry_id, c.reimbursement_journal_id].filter(Boolean);
    const jes = refs.length ? await prisma.journalEntry.findMany({ where: { id: { in: refs } }, select: { id: true, referenceNumber: true, status: true } }) : [];
    return {
      ...claim,
      journal: jes.find((j) => j.id === c.journal_entry_id) || null,
      reimbursementJournal: jes.find((j) => j.id === c.reimbursement_journal_id) || null,
      lines: lines.map((l) => {
        const cat = cats.find((x) => x.id === l.category_id), acc = accs.find((x) => x.id === l.account_id);
        return { id: l.id, date: ymd(l.line_date), categoryId: l.category_id, category: cat?.name || null, description: l.description, amount: Number(l.amount), vat: Number(l.vat_amount), accountId: l.account_id, account: acc ? `${acc.accountNo} ${acc.accountName}` : null, receiptUrl: l.receipt_path, receiptName: l.receipt_name };
      }),
    };
  }

  // ── the claimant ────────────────────────────────────────────────────────────────────────────────────────────────
  static async create(input: any, user: any) {
    const title = String(input.title || "").trim();
    if (!title) throw fail("Give the claim a title (what the spending was for).");
    const cur = String(input.currency || "USD").toUpperCase();
    if (!(await prisma.currency.findFirst({ where: { code: cur } }))) throw fail(`Unknown currency ${cur}.`);
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 25);
    const today = await InventoryLedgerService.tenantToday();
    const reference = await nextReference(today);
    await prisma.$executeRawUnsafe(
      "INSERT INTO expense_claims (id, reference, claimant_id, title, purpose, trip_from, trip_to, project_id, currency_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      id, reference, user.id, title.slice(0, 200), input.purpose || null, input.tripFrom || null, input.tripTo || null, input.projectId || null, cur
    );
    await audit(user.id, "CREATE", id, { reference, title, currency: cur });
    return this.get(id, user);
  }

  static async ownEditable(id: string, user: any) {
    const c = await claimRow(id);
    if (c.claimant_id !== user.id) throw fail("Only the person claiming can change the claim.", 403);
    if (!EDITABLE.includes(c.status)) throw fail("The claim has been submitted; it can be changed only if it is returned to you.", 409);
    return c;
  }

  static async update(id: string, input: any, user: any) {
    const c = await this.ownEditable(id, user);
    const f: any = {};
    if (input.title !== undefined) { if (!String(input.title).trim()) throw fail("The claim needs a title."); f.title = String(input.title).trim().slice(0, 200); }
    if (input.purpose !== undefined) f.purpose = input.purpose || null;
    if (input.tripFrom !== undefined) f.trip_from = input.tripFrom || null;
    if (input.tripTo !== undefined) f.trip_to = input.tripTo || null;
    if (input.projectId !== undefined) f.project_id = input.projectId || null;
    if (input.currency !== undefined) {
      const lines = await linesOf(id);
      if (lines.length && String(input.currency).toUpperCase() !== c.currency_code) throw fail("Remove the lines before changing the claim's currency.");
      f.currency_code = String(input.currency).toUpperCase();
    }
    if (Object.keys(f).length) await setStatus(id, f);
    return this.get(id, user);
  }

  static async addLine(id: string, input: any, user: any, receipt?: { url: string; name: string }) {
    await this.ownEditable(id, user);
    const amount = r2(input.amount), vat = r2(input.vat || 0);
    if (!(amount > 0)) throw fail("Enter the amount spent.");
    if (vat < 0 || vat >= amount) throw fail("VAT must be less than the amount.");
    const description = String(input.description || "").trim();
    if (!description) throw fail("Describe what the spending was.");
    const date = String(input.date || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw fail("Enter the date of the spending.");
    const today = ymd(await InventoryLedgerService.tenantToday());
    if (date > today) throw fail("The spending date cannot be in the future.");
    if (input.categoryId && !(await prisma.expenseCategory.findFirst({ where: { id: input.categoryId, isActive: true } }))) throw fail("Unknown or inactive category.");
    const lid = crypto.randomUUID().replace(/-/g, "").slice(0, 25);
    await prisma.$executeRawUnsafe(
      "INSERT INTO expense_claim_lines (id, claim_id, line_date, category_id, description, amount, vat_amount, receipt_path, receipt_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      lid, id, date, input.categoryId || null, description.slice(0, 500), amount, vat, receipt?.url || null, receipt?.name || null
    );
    await recomputeTotal(id);
    return this.get(id, user);
  }

  static async attachReceipt(id: string, lineId: string, user: any, receipt: { url: string; name: string }) {
    await this.ownEditable(id, user);
    const n = await prisma.$executeRawUnsafe("UPDATE expense_claim_lines SET receipt_path = ?, receipt_name = ? WHERE id = ? AND claim_id = ?", receipt.url, receipt.name, lineId, id);
    if (!n) throw fail("Line not found", 404);
    return this.get(id, user);
  }

  static async removeLine(id: string, lineId: string, user: any) {
    await this.ownEditable(id, user);
    const n = await prisma.$executeRawUnsafe("DELETE FROM expense_claim_lines WHERE id = ? AND claim_id = ?", lineId, id);
    if (!n) throw fail("Line not found", 404);
    await recomputeTotal(id);
    return this.get(id, user);
  }

  /** Policy checks: a missing receipt above the threshold blocks submission; possible duplicates and daily limits are exceptions. */
  static async check(c: any, lines: any[]) {
    const policy = await this.policy();
    const blocks = [], exceptions = [];
    for (const l of lines) if (Number(l.amount) > Number(policy.receiptRequiredAbove) && !l.receipt_path) blocks.push(`${ymd(l.line_date)} ${l.description}: a receipt is needed above ${c.currency_code} ${policy.receiptRequiredAbove}`);
    // the same amount on the same day, on this claim or another live claim of the claimant
    const others: any[] = await prisma.$queryRawUnsafe(
      "SELECT l.line_date, l.amount, c.reference FROM expense_claim_lines l JOIN expense_claims c ON c.id = l.claim_id WHERE c.claimant_id = ? AND c.id <> ? AND c.status NOT IN ('REJECTED','WITHDRAWN')", c.claimant_id, c.id
    );
    const seen = new Map();
    for (const l of lines) {
      const k = `${ymd(l.line_date)}|${Number(l.amount).toFixed(2)}`;
      if (seen.has(k)) exceptions.push(`Possible duplicate: ${c.currency_code} ${Number(l.amount).toFixed(2)} on ${ymd(l.line_date)} appears twice on this claim`);
      seen.set(k, true);
      const o = others.find((x) => ymd(x.line_date) === ymd(l.line_date) && Math.abs(Number(x.amount) - Number(l.amount)) < 0.005);
      if (o) exceptions.push(`Possible duplicate: ${c.currency_code} ${Number(l.amount).toFixed(2)} on ${ymd(l.line_date)} is also on claim ${o.reference}`);
    }
    // a category's daily limit (per diem)
    const byDay = new Map();
    for (const l of lines) if (l.category_id && policy.dailyLimits?.[l.category_id]) { const k = `${l.category_id}|${ymd(l.line_date)}`; byDay.set(k, (byDay.get(k) || 0) + Number(l.amount)); }
    for (const [k, total] of byDay) {
      const [catId, day] = k.split("|"), limit = Number(policy.dailyLimits[catId]);
      if (total > limit + 0.005) {
        const cat = await prisma.expenseCategory.findUnique({ where: { id: catId }, select: { name: true } });
        exceptions.push(`${cat?.name || "Category"} on ${day}: ${c.currency_code} ${total.toFixed(2)} is over the daily limit of ${limit.toFixed(2)}`);
      }
    }
    return { blocks, exceptions };
  }

  static async submit(id: string, user: any) {
    const c = await this.ownEditable(id, user);
    const lines = await linesOf(id);
    if (!lines.length) throw fail("Add at least one item before submitting.");
    const { blocks, exceptions } = await this.check(c, lines);
    if (blocks.length) throw fail(`Attach the missing receipts first: ${blocks.join("; ")}`, 409);
    await setStatus(id, { status: "SUBMITTED", submitted_at: new Date(), exceptions: JSON.stringify(exceptions), return_reason: null, manager_id: null, manager_at: null, reviewer_id: null, reviewer_at: null });
    await audit(user.id, "SUBMIT", id, { total: Number(c.total), exceptions });
    return this.get(id, user);
  }

  static async withdraw(id: string, user: any) {
    const c = await claimRow(id);
    if (c.claimant_id !== user.id) throw fail("Only the person claiming can withdraw the claim.", 403);
    if (![...EDITABLE, ...IN_FLIGHT].includes(c.status)) throw fail("An approved claim cannot be withdrawn.", 409);
    await setStatus(id, { status: "WITHDRAWN" });
    await audit(user.id, "WITHDRAW", id, { from: c.status });
    return this.get(id, user);
  }

  // ── the approval chain ──────────────────────────────────────────────────────────────────────────────────────────
  static async managerApprove(id: string, user: any) {
    const c = await claimRow(id);
    if (c.claimant_id === user.id) throw fail("You cannot approve your own claim.", 403);
    if (!can(user, "accounting.timesheets.manage")) throw fail("Only the claimant's line manager can approve this step.", 403);
    if (!(await this.inReach(await TimesheetService.approverReach(user.id), c.claimant_id))) throw fail("You can only approve claims from your own department.", 403);
    if (c.status !== "SUBMITTED") throw fail("The claim is not waiting for the line manager.", 409);
    await setStatus(id, { status: "MANAGER_APPROVED", manager_id: user.id, manager_at: new Date() });
    await audit(user.id, "MANAGER_APPROVE", id, {});
    return this.get(id, user);
  }

  /** The finance reviewer confirms the receipts and assigns each line's expense account (the category's by default). */
  static async review(id: string, input: any, user: any) {
    const c = await claimRow(id);
    if (c.claimant_id === user.id) throw fail("You cannot review your own claim.", 403);
    if (!can(user, "manage_accounting")) throw fail("Only a finance reviewer can review claims.", 403);
    if (c.status !== "MANAGER_APPROVED") throw fail("The claim is not waiting for finance review.", 409);
    const policy = await this.policy();
    const chosen = input.accounts || {};
    for (const l of await linesOf(id)) {
      const accId = chosen[l.id] || l.account_id || (await defaultAccountFor(l.category_id, policy));
      const a = accId ? await prisma.chartOfAccounts.findUnique({ where: { id: accId }, select: { isActive: true, accountType: true, accountNo: true } }) : null;
      if (!a || !a.isActive) throw fail(`${l.description}: choose an active expense account.`);
      if (!/expense|cost/i.test(a.accountType)) throw fail(`${l.description}: ${a.accountNo} is not an expense account.`);
      await prisma.$executeRawUnsafe("UPDATE expense_claim_lines SET account_id = ? WHERE id = ?", accId, l.id);
    }
    await setStatus(id, { status: "REVIEWED", reviewer_id: user.id, reviewer_at: new Date() });
    await audit(user.id, "REVIEW", id, { accounts: chosen });
    return this.get(id, user);
  }

  /** The finance manager approves: the claim is owed to the employee and its journal is posted. */
  static async approve(id: string, input: any, user: any) {
    const c = await claimRow(id);
    if (c.claimant_id === user.id) throw fail("You cannot approve your own claim.", 403);
    if (!can(user, "manage_ledger")) throw fail("Only a finance manager can approve claims for payment.", 403);
    if (c.status !== "REVIEWED") throw fail("The claim is not waiting for final approval.", 409);
    if (c.reviewer_id === user.id) throw fail("You reviewed this claim; someone else approves it.", 403);
    const lines = await linesOf(id);
    const { blocks, exceptions } = await this.check(c, lines);
    if (blocks.length) throw fail(blocks.join("; "), 409);
    const note = String(input.exceptionNote || "").trim();
    if (exceptions.length && !note) throw fail(`This claim breaks the policy (${exceptions.join("; ")}). Approve it with a note saying why.`, 409);
    const day = await InventoryLedgerService.tenantToday();
    await PeriodLockService.assertModuleDateOpen({ moduleCode: "GL", accountingDate: day, userId: user.id, source: "API", actionType: "EXPENSE_CLAIM_JE", user });
    const currency = await prisma.currency.findFirst({ where: { code: c.currency_code }, select: { id: true } });
    const payable = await prisma.chartOfAccounts.findUnique({ where: { accountNo: PAYABLE_ACCOUNT_NO }, select: { id: true, isActive: true } });
    if (!payable?.isActive) throw fail(`Account ${PAYABLE_ACCOUNT_NO} Staff Claims Payable is missing or switched off.`);
    const vatAcc = lines.some((l) => Number(l.vat_amount) > 0) ? await vatInputAccount() : null;
    const total = r2(lines.reduce((s, l) => s + Number(l.amount), 0));
    const who = await prisma.user.findUnique({ where: { id: c.claimant_id }, select: { firstName: true, lastName: true, email: true } });
    const claimant = `${who?.firstName || ""} ${who?.lastName || ""}`.trim() || who?.email || "employee";
    const je = await prisma.$transaction(async (tx) => {
      const j = await assignNextAuditIdAndCreateJournal(tx, { transactionDate: day, referenceNumber: c.reference, description: `Expense claim ${c.reference} — ${claimant}: ${c.title}`.slice(0, 190), currencyId: currency.id, status: "POSTED", createdById: user.id, totalAmount: new Decimal(total) }, { source: "API" });
      for (const l of lines) {
        const net = r2(Number(l.amount) - Number(l.vat_amount));
        await tx.journalEntryLine.create({ data: { journalEntryId: j.id, chartOfAccountId: l.account_id, debitAmount: new Decimal(net), creditAmount: new Decimal(0), description: `${ymd(l.line_date)} ${l.description}`.slice(0, 190) } });
        if (Number(l.vat_amount) > 0) await tx.journalEntryLine.create({ data: { journalEntryId: j.id, chartOfAccountId: vatAcc.id, debitAmount: new Decimal(r2(l.vat_amount)), creditAmount: new Decimal(0), description: `VAT ${l.description}`.slice(0, 190) } });
      }
      await tx.journalEntryLine.create({ data: { journalEntryId: j.id, chartOfAccountId: payable.id, debitAmount: new Decimal(0), creditAmount: new Decimal(total), description: `Owed to ${claimant}`.slice(0, 190) } });
      const n = await tx.$executeRawUnsafe("UPDATE expense_claims SET status = 'APPROVED', approver_id = ?, approver_at = ?, exception_note = ?, exceptions = ?, journal_entry_id = ? WHERE id = ? AND status = 'REVIEWED'", user.id, new Date(), note || null, JSON.stringify(exceptions), j.id, id);
      if (!n) throw fail("The claim changed while you were approving it; reload it.", 409);
      return j;
    });
    await audit(user.id, exceptions.length ? "APPROVE_WITH_EXCEPTION" : "APPROVE", id, { journal: je.referenceNumber, total, exceptions, note: note || undefined });
    return this.get(id, user);
  }

  /** Back to the claimant with what to correct (any step before approval). */
  static async returnClaim(id: string, reason: string, user: any) {
    const c = await claimRow(id);
    if (!String(reason || "").trim()) throw fail("Say what the claimant needs to correct.");
    if (c.claimant_id === user.id) throw fail("You cannot return your own claim; withdraw it instead.", 403);
    const allowed =
      (c.status === "SUBMITTED" && can(user, "accounting.timesheets.manage") && (await this.inReach(await TimesheetService.approverReach(user.id), c.claimant_id))) ||
      (c.status === "MANAGER_APPROVED" && can(user, "manage_accounting")) ||
      (c.status === "REVIEWED" && can(user, "manage_ledger"));
    if (!IN_FLIGHT.includes(c.status)) throw fail("Only a claim waiting for approval can be returned.", 409);
    if (!allowed) throw fail("The claim is not waiting on you.", 403);
    await setStatus(id, { status: "RETURNED", return_reason: String(reason).trim().slice(0, 2000) });
    await audit(user.id, "RETURN", id, { from: c.status, reason });
    return this.get(id, user);
  }

  static async reject(id: string, reason: string, user: any) {
    const c = await claimRow(id);
    if (!String(reason || "").trim()) throw fail("Give the reason for rejecting the claim.");
    if (c.claimant_id === user.id) throw fail("You cannot reject your own claim.", 403);
    if (!can(user, "manage_ledger")) throw fail("Only a finance manager can reject a claim.", 403);
    if (!IN_FLIGHT.includes(c.status)) throw fail("Only a claim waiting for approval can be rejected.", 409);
    await setStatus(id, { status: "REJECTED", return_reason: String(reason).trim().slice(0, 2000) });
    await audit(user.id, "REJECT", id, { from: c.status, reason });
    return this.get(id, user);
  }

  /** Pay an approved claim from a bank account in the claim's currency: Dr 2260 / Cr the bank, with its cashbook line. */
  static async reimburse(id: string, input: any, user: any) {
    const c = await claimRow(id);
    if (c.claimant_id === user.id) throw fail("You cannot pay your own claim.", 403);
    if (!can(user, "manage_ledger")) throw fail("Only a finance manager can pay claims.", 403);
    if (c.status !== "APPROVED") throw fail("Only an approved claim can be paid.", 409);
    const bank = await prisma.bank.findUnique({ where: { id: String(input.bankId || "") }, include: { currency: { select: { code: true, id: true } } } });
    if (!bank || !bank.isActive) throw fail("Choose an active bank account.");
    if (!bank.glAccountId) throw fail("That bank account has no ledger account.");
    if (bank.currency?.code !== c.currency_code) throw fail(`The claim is in ${c.currency_code}; pay it from a ${c.currency_code} bank account.`);
    const day = input.date ? new Date(`${String(input.date).slice(0, 10)}T12:00:00Z`) : await InventoryLedgerService.tenantToday();
    if (ymd(day) > ymd(await InventoryLedgerService.tenantToday())) throw fail("The payment date cannot be in the future.");
    await PeriodLockService.assertModuleDateOpen({ moduleCode: "GL", accountingDate: day, userId: user.id, source: "API", actionType: "EXPENSE_CLAIM_PAY", user });
    const payable = await prisma.chartOfAccounts.findUnique({ where: { accountNo: PAYABLE_ACCOUNT_NO }, select: { id: true } });
    const total = r2(c.total);
    const reference = `CLMPAY-${c.reference.replace(/^CLM-/, "")}`;
    const je = await prisma.$transaction(async (tx) => {
      const j = await assignNextAuditIdAndCreateJournal(tx, { transactionDate: day, referenceNumber: reference, description: `Reimbursement of expense claim ${c.reference}${input.bankReference ? ` (${String(input.bankReference).slice(0, 40)})` : ""}`, currencyId: bank.currency.id, status: "POSTED", createdById: user.id, totalAmount: new Decimal(total) }, { source: "API" });
      await tx.journalEntryLine.create({ data: { journalEntryId: j.id, chartOfAccountId: payable.id, debitAmount: new Decimal(total), creditAmount: new Decimal(0), description: `Claim ${c.reference} paid` } });
      await tx.journalEntryLine.create({ data: { journalEntryId: j.id, chartOfAccountId: bank.glAccountId, debitAmount: new Decimal(0), creditAmount: new Decimal(total), description: `Claim ${c.reference} paid` } });
      await recordBankLeg(tx, { bankId: bank.id, journalEntryId: j.id, journalStatus: "POSTED", type: "PAYMENT", amount: total, transactionDate: day, description: `Expense claim ${c.reference} reimbursed`, reference, contraAccountId: payable.id, createdById: user.id });
      const n = await tx.$executeRawUnsafe("UPDATE expense_claims SET status = 'REIMBURSED', reimbursed_at = ?, reimbursed_by_id = ?, reimbursement_journal_id = ? WHERE id = ? AND status = 'APPROVED'", new Date(), user.id, j.id, id);
      if (!n) throw fail("The claim changed while you were paying it; reload it.", 409);
      return j;
    });
    await audit(user.id, "REIMBURSE", id, { journal: je.referenceNumber, bank: bank.name, total });
    return this.get(id, user);
  }
}
