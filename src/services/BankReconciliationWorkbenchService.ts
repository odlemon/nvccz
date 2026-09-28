// @ts-nocheck
/**
 * Bank reconciliation workbench (SRD Cashbook ACC-CB-25…35), on the tick-based reconciliation sessions
 * (CashbookReconciliationSessionService): a session's bank statement is imported (CSV in the bank template, or lines typed
 * in) into bank_statements / bank_statement_items and linked through cashbook_reconciliation_statements; statement lines
 * are matched to posted cashbook entries — automatically (same direction, same amount, within two days, reference
 * preferred, one to one) or by hand — and a matched entry is ticked on the session. A bank line with no book entry
 * (charges, interest) is booked into the cashbook from here and matched. Finishing (the session service) then requires
 * every statement line matched and the cleared balance equal to the statement's closing balance. The latest finished
 * reconciliation of a bank can be reopened, with a reason, by someone who may post to the ledger.
 */
import { prisma } from "../utils/database";
import AuditService from "./AuditService";
import FiscalCalendarService from "./FiscalCalendarService";
import { parseBankStatementCSV } from "./BankStatementUploadService";
import { CashbookReconciliationSessionService } from "./CashbookReconciliationSessionService";
import { CashbookService } from "./CashbookService";

const DATE_WINDOW_DAYS = 2;
const AMOUNT_EPS = 0.005;
const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: any) => (v == null ? 0 : Number(v.toString ? v.toString() : v) || 0);
const fail = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });

/** The calendar day a statement date names (parsed as local midnight by the CSV parser), stored at UTC noon. */
function statementDay(d: Date | string): Date {
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.trim())) return new Date(`${d.trim()}T12:00:00.000Z`);
  const x = new Date(d as any);
  if (Number.isNaN(x.getTime())) throw fail(`Unreadable date: ${d}`);
  return new Date(Date.UTC(x.getFullYear(), x.getMonth(), x.getDate(), 12));
}
const dayKey = (d: Date, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000);

export class BankReconciliationWorkbenchService {
  static async link(sessionId: string): Promise<any | null> {
    const rows: any[] = await prisma.$queryRawUnsafe("SELECT * FROM cashbook_reconciliation_statements WHERE session_id = ? LIMIT 1", sessionId);
    return rows[0] || null;
  }

  static async draftSession(sessionId: string) {
    const s = await prisma.cashbookReconciliationSession.findUnique({ where: { id: sessionId } });
    if (!s) throw fail("Reconciliation not found", 404);
    if (s.status !== "DRAFT") throw fail("This reconciliation is finished; reopen it to change it.");
    return s;
  }

  /** Tick or untick one book entry on a draft (upserts its session line). */
  static async tick(sessionId: string, cashbookEntryId: string, selected: boolean) {
    const s = await this.draftSession(sessionId);
    const e = await prisma.cashbookEntry.findUnique({ where: { id: cashbookEntryId }, select: { id: true, bankId: true, status: true, isReconciled: true, transactionDate: true } });
    if (!e || e.bankId !== s.bankId) throw fail("That entry is not on this bank account.");
    if (selected) {
      if (e.status !== "POSTED") throw fail("Only posted entries can be ticked.");
      if (e.isReconciled) throw fail("That entry is already reconciled.");
      const end = new Date(s.statementDate); end.setHours(23, 59, 59, 999);
      if (e.transactionDate > end) throw fail("That entry is dated after the statement date.");
    }
    await prisma.cashbookReconciliationSessionLine.upsert({
      where: { sessionId_cashbookEntryId: { sessionId, cashbookEntryId } },
      create: { sessionId, cashbookEntryId, selected },
      update: { selected },
    });
  }

  /** Import the statement for a draft: CSV (bank template) or typed lines. Replaces an earlier import on the draft. */
  static async importStatement(params: { sessionId: string; userId: string; fileBuffer?: Buffer; fileName?: string | null; items?: any[]; openingBalance?: number | null; closingBalance?: number | null }) {
    const s = await this.draftSession(params.sessionId);
    let parsed: any;
    if (params.fileBuffer) {
      parsed = parseBankStatementCSV(params.fileBuffer);
    } else {
      parsed = {
        openingBalance: params.openingBalance ?? null,
        closingBalance: params.closingBalance ?? null,
        items: (params.items || []).map((i) => ({ transactionDate: i.transactionDate, description: String(i.description || "").trim(), reference: i.reference || null, debitAmount: Number(i.debitAmount) || 0, creditAmount: Number(i.creditAmount) || 0, balance: i.balance != null && i.balance !== "" ? Number(i.balance) : null })),
      };
    }
    const items = (parsed.items || []).filter((i) => (Number(i.debitAmount) || 0) || (Number(i.creditAmount) || 0));
    if (!items.length) throw fail("The statement has no lines with an amount. Use the bank statement template (Transaction Date, Value Date, Reference, Description, Debit, Credit, Balance).");
    for (const i of items) {
      if ((Number(i.debitAmount) || 0) < 0 || (Number(i.creditAmount) || 0) < 0) throw fail("Statement amounts are positive: money out in Debit, money in in Credit.");
      if ((Number(i.debitAmount) || 0) && (Number(i.creditAmount) || 0)) throw fail(`A statement line is a debit or a credit, not both (${i.description || i.reference || "line"}).`);
    }
    const lines = items.map((i) => ({ ...i, day: statementDay(i.transactionDate) }));
    const end = new Date(s.statementDate); end.setHours(23, 59, 59, 999);
    const late = lines.filter((l) => l.day > end);
    if (late.length) throw fail(`${late.length} statement line(s) are dated after this reconciliation's statement date; set the statement date to the statement's last day.`);
    const credits = r2(lines.reduce((t, l) => t + (Number(l.creditAmount) || 0), 0));
    const debits = r2(lines.reduce((t, l) => t + (Number(l.debitAmount) || 0), 0));
    const prior = await CashbookReconciliationSessionService.getPriorClosingBalance(s.bankId, s.id);
    const opening = parsed.openingBalance != null ? Number(parsed.openingBalance) : s.openingBalance != null ? num(s.openingBalance) : prior;
    if (opening == null || !Number.isFinite(opening)) throw fail("The statement's opening balance is needed (the statement has none and this bank has no earlier reconciliation).");
    const closing = parsed.closingBalance != null ? Number(parsed.closingBalance) : r2(opening + credits - debits);
    // a statement must add up: opening + money in − money out = closing
    if (Math.abs(r2(opening + credits - debits) - closing) > 0.01) {
      throw fail(`The statement does not add up: opening ${opening.toFixed(2)} + credits ${credits.toFixed(2)} − debits ${debits.toFixed(2)} = ${r2(opening + credits - debits).toFixed(2)}, but its closing balance is ${closing.toFixed(2)}.`);
    }
    if (prior != null && Math.abs(prior - opening) > 0.01) {
      throw fail(`The statement opens at ${opening.toFixed(2)} but the last reconciliation of this account closed at ${prior.toFixed(2)}; a statement is missing in between.`);
    }

    const old = await this.link(s.id);
    const stmtId = await prisma.$transaction(async (tx) => {
      if (old) {
        await tx.$executeRawUnsafe("DELETE FROM cashbook_reconciliation_statements WHERE session_id = ?", s.id);
        await tx.bankStatementItem.deleteMany({ where: { statementId: old.bank_statement_id } });
        await tx.reconciliationMismatch.deleteMany({ where: { statementId: old.bank_statement_id } });
        await tx.bankStatement.delete({ where: { id: old.bank_statement_id } }).catch(() => null);
        // ticks made by the old statement's matches go with it
        await tx.cashbookReconciliationSessionLine.updateMany({ where: { sessionId: s.id }, data: { selected: false } });
      }
      const st = await tx.bankStatement.create({
        data: { bankId: s.bankId, statementDate: s.statementDate, openingBalance: opening.toFixed(2), closingBalance: closing.toFixed(2), totalDebits: debits.toFixed(2), totalCredits: credits.toFixed(2) },
      });
      await tx.bankStatementItem.createMany({
        data: lines.map((l) => ({ statementId: st.id, transactionDate: l.day, description: (l.description || l.reference || "Statement line").slice(0, 190), reference: l.reference ? String(l.reference).slice(0, 190) : null, debitAmount: (Number(l.debitAmount) || 0).toFixed(2), creditAmount: (Number(l.creditAmount) || 0).toFixed(2), balance: (l.balance != null && Number.isFinite(Number(l.balance)) ? Number(l.balance) : 0).toFixed(2) })),
      });
      await tx.$executeRawUnsafe("INSERT INTO cashbook_reconciliation_statements (session_id, bank_statement_id, file_name, imported_by_id, imported_at) VALUES (?, ?, ?, ?, UTC_TIMESTAMP(3))", s.id, st.id, params.fileName || null, params.userId);
      await tx.cashbookReconciliationSession.update({ where: { id: s.id }, data: { openingBalance: opening.toFixed(2), statementEndBalance: closing.toFixed(2) } });
      return st.id;
    }, { maxWait: 60000, timeout: 120000 });
    await AuditService.log({ userId: params.userId, action: "CREATE", entityType: "BankStatementImport", entityId: stmtId, newValues: { sessionId: s.id, lines: lines.length, opening, closing, fileName: params.fileName || null, replaced: !!old } }).catch(() => null);
    return { statementId: stmtId, lines: lines.length, openingBalance: opening, closingBalance: closing };
  }

  /** Match every unmatched statement line that has exactly one best book entry (ACC-CB-35 rules). */
  static async autoMatch(sessionId: string, userId: string) {
    const s = await this.draftSession(sessionId);
    const link = await this.link(s.id);
    if (!link) throw fail("Import the bank statement first.");
    const tz = await FiscalCalendarService.getFiscalTimezone();
    const items = await prisma.bankStatementItem.findMany({ where: { statementId: link.bank_statement_id, isMatched: false }, orderBy: { transactionDate: "asc" } });
    const taken = new Set((await prisma.bankStatementItem.findMany({ where: { statementId: link.bank_statement_id, isMatched: true }, select: { matchedTransactionId: true } })).map((x) => x.matchedTransactionId));
    const end = new Date(s.statementDate); end.setHours(23, 59, 59, 999);
    const entries = (await prisma.cashbookEntry.findMany({ where: { bankId: s.bankId, status: "POSTED", isReconciled: false, transactionDate: { lte: new Date(end.getTime() + DATE_WINDOW_DAYS * 86400000) } }, select: { id: true, type: true, amount: true, transactionDate: true, reference: true } }))
      .filter((e) => !taken.has(e.id))
      .map((e) => ({ ...e, amt: num(e.amount), day: dayKey(e.transactionDate, tz) }));
    let matched = 0;
    const used = new Set<string>();
    for (const it of items) {
      const credit = num(it.creditAmount), debit = num(it.debitAmount);
      const type = credit > 0 ? "RECEIPT" : "PAYMENT";
      const amount = credit > 0 ? credit : debit;
      const iday = it.transactionDate.toISOString().slice(0, 10);
      const ref = String(it.reference || "").trim().toLowerCase();
      const cands = entries
        .filter((e) => !used.has(e.id) && e.type === type && Math.abs(e.amt - amount) <= AMOUNT_EPS && e.transactionDate <= end && Math.abs(dayDiff(e.day, iday)) <= DATE_WINDOW_DAYS)
        .map((e) => ({ e, refHit: !!ref && String(e.reference || "").trim().toLowerCase() === ref, gap: Math.abs(dayDiff(e.day, iday)) }))
        .sort((a, b) => Number(b.refHit) - Number(a.refHit) || a.gap - b.gap);
      if (!cands.length) continue;
      // ambiguous (two equally good entries, no reference to tell them apart): left for a person to choose
      if (cands.length > 1 && !cands[0].refHit && cands[1].gap === cands[0].gap) continue;
      const pick = cands[0].e;
      used.add(pick.id);
      await prisma.bankStatementItem.update({ where: { id: it.id }, data: { isMatched: true, matchedTransactionId: pick.id } });
      await this.tick(s.id, pick.id, true);
      matched++;
    }
    await prisma.$executeRawUnsafe("UPDATE cashbook_reconciliation_statements SET last_auto_match_at = UTC_TIMESTAMP(3), last_auto_match_by_id = ? WHERE session_id = ?", userId, s.id);
    await AuditService.log({ userId, action: "UPDATE", entityType: "BankReconciliationAutoMatch", entityId: s.id, newValues: { matched, examined: items.length } }).catch(() => null);
    return { matched, examined: items.length, stillUnmatched: items.length - matched };
  }

  static async matchLine(sessionId: string, itemId: string, cashbookEntryId: string, userId: string) {
    const s = await this.draftSession(sessionId);
    const link = await this.link(s.id);
    const it = link && (await prisma.bankStatementItem.findUnique({ where: { id: itemId } }));
    if (!it || it.statementId !== link.bank_statement_id) throw fail("That statement line is not on this reconciliation.");
    if (it.isMatched) throw fail("That statement line is already matched; unmatch it first.");
    const e = await prisma.cashbookEntry.findUnique({ where: { id: cashbookEntryId } });
    if (!e || e.bankId !== s.bankId) throw fail("That entry is not on this bank account.");
    const credit = num(it.creditAmount), debit = num(it.debitAmount);
    const type = credit > 0 ? "RECEIPT" : "PAYMENT";
    if (e.type !== type) throw fail(`Money ${credit > 0 ? "in" : "out"} on the statement matches a ${type === "RECEIPT" ? "receipt" : "payment"} in the cashbook.`);
    if (Math.abs(num(e.amount) - (credit || debit)) > AMOUNT_EPS) throw fail(`The amounts differ (${(credit || debit).toFixed(2)} on the statement, ${num(e.amount).toFixed(2)} in the cashbook); correct the cashbook entry or book the difference.`);
    const other = await prisma.bankStatementItem.findFirst({ where: { statementId: link.bank_statement_id, matchedTransactionId: e.id } });
    if (other) throw fail("That cashbook entry is already matched to another statement line.");
    await this.tick(s.id, e.id, true);
    await prisma.bankStatementItem.update({ where: { id: it.id }, data: { isMatched: true, matchedTransactionId: e.id } });
    await AuditService.log({ userId, action: "UPDATE", entityType: "BankStatementItem", entityId: it.id, newValues: { matchedTransactionId: e.id, manual: true } }).catch(() => null);
  }

  static async unmatchLine(sessionId: string, itemId: string, userId: string) {
    const s = await this.draftSession(sessionId);
    const link = await this.link(s.id);
    const it = link && (await prisma.bankStatementItem.findUnique({ where: { id: itemId } }));
    if (!it || it.statementId !== link.bank_statement_id) throw fail("That statement line is not on this reconciliation.");
    if (!it.isMatched) return;
    await prisma.bankStatementItem.update({ where: { id: it.id }, data: { isMatched: false, matchedTransactionId: null } });
    if (it.matchedTransactionId) await this.tick(s.id, it.matchedTransactionId, false).catch(() => null);
    await AuditService.log({ userId, action: "UPDATE", entityType: "BankStatementItem", entityId: it.id, newValues: { unmatched: true } }).catch(() => null);
  }

  /** A bank line with no book entry (charges, interest, a direct debit): booked into the cashbook against a GL account, then matched. */
  static async bookLine(sessionId: string, itemId: string, params: { glAccountId: string; description?: string | null; userId: string }) {
    const s = await this.draftSession(sessionId);
    const link = await this.link(s.id);
    const it = link && (await prisma.bankStatementItem.findUnique({ where: { id: itemId } }));
    if (!it || it.statementId !== link.bank_statement_id) throw fail("That statement line is not on this reconciliation.");
    if (it.isMatched) throw fail("That statement line is already matched.");
    if (!params.glAccountId) throw fail("Choose the account the bank line is booked to (for example bank charges or interest income).");
    const credit = num(it.creditAmount), debit = num(it.debitAmount);
    const common = { bankId: s.bankId, transactionDate: it.transactionDate, description: (params.description || it.description || "Bank statement line").slice(0, 100), amount: credit || debit, reference: it.reference ? String(it.reference).slice(0, 50) : undefined, counterpartyType: "GL" as const, glAccountId: params.glAccountId, vatCode: "EXEMPT", createdById: params.userId, skipVatRateRefresh: true };
    const res: any = credit > 0 ? await CashbookService.createCashReceipt(common as any) : await CashbookService.createCashPayment(common as any);
    if (!res || !res.success || !res.transaction) throw fail(res?.message || res?.error || "The cashbook entry could not be created.");
    if (res.transaction.status !== "POSTED") throw fail("The cashbook entry was created but not posted, so it cannot be matched yet.");
    await this.matchLine(s.id, it.id, res.transaction.id, params.userId);
    return { cashbookEntryId: res.transaction.id };
  }

  /** Everything the workbench shows for one reconciliation. */
  static async workbench(sessionId: string) {
    const session = await CashbookReconciliationSessionService.getById(sessionId);
    if (!session) throw fail("Reconciliation not found", 404);
    const [bank, link] = await Promise.all([
      prisma.bank.findUnique({ where: { id: session.bankId }, select: { id: true, name: true, accountNumber: true, currency: { select: { code: true } } } }),
      this.link(sessionId),
    ]);
    const statement = link ? await prisma.bankStatement.findUnique({ where: { id: link.bank_statement_id }, include: { items: { orderBy: { transactionDate: "asc" }, include: { matchedTransaction: { select: { id: true, reference: true, description: true, transactionDate: true, amount: true, type: true } } } } } }) : null;
    // book side: unreconciled posted entries up to the statement date (draft) or the entries this reconciliation cleared (finished)
    const lineByEntry = new Map((session.lines || []).map((l: any) => [l.cashbookEntryId, l]));
    const entries = session.status === "DRAFT"
      ? await CashbookReconciliationSessionService.listCandidateEntries({ bankId: session.bankId, asOf: new Date(session.statementDate) })
      : (session.lines || []).filter((l: any) => l.selected).map((l: any) => l.entry);
    const rows = entries.map((e: any) => ({ ...e, ticked: !!(lineByEntry.get(e.id) && lineByEntry.get(e.id).selected) }));
    const ticked = rows.filter((e: any) => e.ticked);
    const receipts = r2(ticked.filter((e: any) => e.type === "RECEIPT").reduce((t: number, e: any) => t + e.amount, 0));
    const payments = r2(ticked.filter((e: any) => e.type === "PAYMENT").reduce((t: number, e: any) => t + e.amount, 0));
    const opening = session.openingBalance != null ? session.openingBalance : session.priorClosingBalanceFromLastFinalized;
    const cleared = opening != null ? r2(opening + receipts - payments) : null;
    const items = statement ? statement.items.map((i: any) => ({ id: i.id, date: i.transactionDate, description: i.description, reference: i.reference, debit: num(i.debitAmount), credit: num(i.creditAmount), matched: i.isMatched, entry: i.matchedTransaction ? { id: i.matchedTransaction.id, reference: i.matchedTransaction.reference, description: i.matchedTransaction.description, date: i.matchedTransaction.transactionDate, amount: num(i.matchedTransaction.amount), type: i.matchedTransaction.type } : null })) : [];
    const unmatched = items.filter((i: any) => !i.matched).length;
    const blockers: string[] = [];
    if (opening == null) blockers.push("Enter the opening balance of this first reconciliation.");
    if (statement && unmatched) blockers.push(`${unmatched} statement line(s) are not matched.`);
    if (!ticked.length) blockers.push("Tick at least one cashbook entry.");
    if (cleared != null && Math.abs(cleared - session.statementEndBalance) > 0.01) blockers.push(`The cleared balance differs from the statement by ${Math.abs(r2(session.statementEndBalance - cleared)).toFixed(2)}.`);
    return {
      session: { ...session, lines: undefined },
      bank,
      statement: statement ? { id: statement.id, fileName: link.file_name, openingBalance: num(statement.openingBalance), closingBalance: num(statement.closingBalance), totalDebits: num(statement.totalDebits), totalCredits: num(statement.totalCredits), importedAt: link.imported_at, lastAutoMatchAt: link.last_auto_match_at } : null,
      items,
      entries: rows,
      summary: {
        openingBalance: opening,
        tickedReceipts: receipts,
        tickedPayments: payments,
        clearedBalance: cleared,
        statementEndBalance: session.statementEndBalance,
        difference: cleared != null ? r2(session.statementEndBalance - cleared) : null,
        outstandingReceipts: r2(rows.filter((e: any) => !e.ticked && e.type === "RECEIPT").reduce((t: number, e: any) => t + e.amount, 0)),
        outstandingPayments: r2(rows.filter((e: any) => !e.ticked && e.type === "PAYMENT").reduce((t: number, e: any) => t + e.amount, 0)),
        statementLines: items.length,
        matchedLines: items.length - unmatched,
        canFinish: session.status === "DRAFT" && !blockers.length,
        blockers,
      },
    };
  }

  /** Reopen the latest finished reconciliation of a bank: its entries are unticked on the books and it returns to draft. */
  static async reopen(sessionId: string, userId: string, reason: string) {
    if (!reason || !String(reason).trim()) throw fail("Give the reason the reconciliation is reopened.");
    const s = await prisma.cashbookReconciliationSession.findUnique({ where: { id: sessionId } });
    if (!s) throw fail("Reconciliation not found", 404);
    if (s.status !== "FINALIZED") throw fail("Only a finished reconciliation can be reopened.");
    const latest = await prisma.cashbookReconciliationSession.findFirst({ where: { bankId: s.bankId, status: "FINALIZED" }, orderBy: [{ statementDate: "desc" }, { finishedAt: "desc" }] });
    if (!latest || latest.id !== s.id) throw fail("Only the latest finished reconciliation of an account can be reopened; reopen the later ones first.");
    const link = await this.link(s.id);
    await prisma.$transaction(async (tx) => {
      await tx.cashbookEntry.updateMany({ where: { cashbookReconciliationSessionId: s.id }, data: { isReconciled: false, reconciledAt: null, reconciledById: null, cashbookReconciliationSessionId: null } });
      await tx.cashbookReconciliationSession.update({ where: { id: s.id }, data: { status: "DRAFT", closingBalance: null, finishedAt: null, finishedById: null } });
      if (link) await tx.bankStatement.update({ where: { id: link.bank_statement_id }, data: { isReconciled: false, reconciledAt: null, reconciledById: null } });
    }, { maxWait: 60000, timeout: 120000 });
    await AuditService.log({ userId, action: "UPDATE", entityType: "CashbookReconciliationSession", entityId: s.id, oldValues: { status: "FINALIZED" }, newValues: { status: "DRAFT", reopened: true, reason: String(reason).slice(0, 500) } }).catch(() => null);
  }

  /** The last day reconciled for a bank (a finished reconciliation's statement date), or null. */
  static async reconciledThrough(bankId: string): Promise<Date | null> {
    const last = await prisma.cashbookReconciliationSession.findFirst({ where: { bankId, status: "FINALIZED" }, orderBy: { statementDate: "desc" }, select: { statementDate: true } });
    return last ? last.statementDate : null;
  }
}
