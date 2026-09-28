// @ts-nocheck
/**
 * Supplier payment runs (SRD ACC-AP-11, finding AP-01). A preparer gathers approved, unpaid supplier bills payable from
 * one bank account into a run; someone else approves it; the bank file (payee, bank, account, amount, reference) is
 * produced from the vendors' bank records; once the bank has made the payments the run is settled: each bill is paid
 * through the procurement payment step it would go through on its own (vendor approved, payee on record, match and
 * finance acceptance checked, journal and cashbook line posted), with the run's proof of payment. A bill that fails is
 * marked with its reason and the rest are paid. Every step is audited.
 *
 * DRAFT → SUBMITTED → APPROVED → SETTLED (or PARTLY_SETTLED); DRAFT / SUBMITTED / APPROVED can be cancelled.
 */
import crypto from "crypto";
import { prisma } from "../utils/database";
import AuditService from "./AuditService";

const fail = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const OPEN = ["DRAFT", "SUBMITTED", "APPROVED"];
const r2 = (x: number) => Math.round(x * 100) / 100;
const audit = (userId, action, id, values) => AuditService.log({ userId, action, entityType: "PaymentRun", entityId: id, newValues: values }).catch(() => null);

async function runRow(id: string) {
  const [r] = await prisma.$queryRawUnsafe<any[]>("SELECT * FROM payment_runs WHERE id = ?", id);
  if (!r) throw fail("Payment run not found", 404);
  return r;
}

/** Why a bill cannot be paid in a run now (null when it can). */
async function whyNot(inv: any, bank: any) {
  if (inv.status !== "APPROVED") return "not approved";
  if (inv.paymentStatus === "PAID") return "already paid";
  const cur = inv.currency?.code || null;
  if (cur && bank.currency?.code && cur !== bank.currency.code) return `in ${cur}, the bank account is ${bank.currency.code}`;
  try {
    const { InvoiceControlService } = await import("./p2p/InvoiceControlService");
    await InvoiceControlService.assertReadyToPay(inv.id);
    // the payment step refuses a bill whose three-way match has open exceptions (no receipt, price or quantity off)
    await InvoiceControlService.assertMatchAllows(inv.id, "PAY");
  } catch (e) { return e.message; }
  try {
    const { VendorGateService } = await import("./VendorGateService");
    await VendorGateService.assertTransactable(inv.vendorId, "PAY");
  } catch (e) { return e.message; }
  try {
    const { VendorBankService } = await import("./VendorBankService");
    await VendorBankService.requirePayee(inv.vendorId, cur);
  } catch (e) { return e.message; }
  return null;
}

export class PaymentRunService {
  /** Approved, unpaid bills that could go into a run from this bank account (and why the others cannot). */
  static async candidates(bankId: string) {
    const bank = await prisma.bank.findUnique({ where: { id: bankId }, include: { currency: true } });
    if (!bank) throw fail("Bank account not found", 404);
    const inRuns: any[] = await prisma.$queryRawUnsafe(`SELECT l.invoice_id FROM payment_run_lines l JOIN payment_runs r ON r.id = l.run_id WHERE r.status IN ('DRAFT','SUBMITTED','APPROVED')`);
    const taken = new Set(inRuns.map((x) => x.invoice_id));
    const invs = await prisma.procurementInvoice.findMany({ where: { status: "APPROVED", paymentStatus: { not: "PAID" } }, include: { vendor: { select: { id: true, name: true } }, currency: { select: { code: true } } }, orderBy: [{ dueDate: "asc" }, { invoiceDate: "asc" }], take: 300 });
    const out = [];
    for (const inv of invs) {
      const reason = taken.has(inv.id) ? "already in an open payment run" : await whyNot(inv, bank);
      out.push({ id: inv.id, invoiceNumber: inv.invoiceNumber, vendor: inv.vendor?.name, currency: inv.currency?.code || null, amount: Number(inv.totalAmount), dueDate: inv.dueDate, payable: !reason, reason });
    }
    return { bank: { id: bank.id, name: bank.name, currency: bank.currency?.code }, bills: out };
  }

  static async create(p: { bankId: string; paymentDate: string; invoiceIds: string[]; notes?: string }, userId: string) {
    if (!p.bankId) throw fail("Choose the bank account the run is paid from.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(p.paymentDate || ""))) throw fail("Give the payment date (YYYY-MM-DD).");
    const ids = [...new Set(p.invoiceIds || [])];
    if (!ids.length) throw fail("Choose at least one bill.");
    const c = await PaymentRunService.candidates(p.bankId);
    const byId = new Map(c.bills.map((b) => [b.id, b]));
    const bad = ids.map((id) => [id, byId.get(id)]).filter(([, b]) => !b || !b.payable);
    if (bad.length) throw fail(`Not payable in this run: ${bad.slice(0, 5).map(([id, b]) => (b ? `${b.invoiceNumber} (${b.reason})` : `${id} (not an approved unpaid bill)`)).join("; ")}.`, 409);
    const bills = ids.map((id) => byId.get(id));
    const total = r2(bills.reduce((s, b) => s + b.amount, 0));
    const id = crypto.randomUUID();
    const day = p.paymentDate.replace(/-/g, "");
    const [{ n }] = await prisma.$queryRawUnsafe<any[]>("SELECT COUNT(*) AS n FROM payment_runs WHERE reference LIKE ?", `PR-${day}-%`);
    const reference = `PR-${day}-${Number(n) + 1}`;
    const invs = await prisma.procurementInvoice.findMany({ where: { id: { in: ids } }, select: { id: true, vendorId: true } });
    const vendorOf = new Map(invs.map((i) => [i.id, i.vendorId]));
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("INSERT INTO payment_runs (id, reference, bank_id, currency_code, payment_date, status, total, notes, prepared_by_id, created_at) VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, UTC_TIMESTAMP(3))", id, reference, p.bankId, c.bank.currency || "", p.paymentDate, total, p.notes || null, userId);
      for (const b of bills) await tx.$executeRawUnsafe("INSERT INTO payment_run_lines (id, run_id, invoice_id, vendor_id, amount, status) VALUES (?, ?, ?, ?, ?, 'INCLUDED')", crypto.randomUUID(), id, b.id, vendorOf.get(b.id), b.amount);
    });
    await audit(userId, "CREATE", id, { reference, bank: c.bank.name, paymentDate: p.paymentDate, bills: bills.length, total });
    return PaymentRunService.get(id);
  }

  static async list() {
    const runs: any[] = await prisma.$queryRawUnsafe("SELECT r.*, (SELECT COUNT(*) FROM payment_run_lines l WHERE l.run_id = r.id) AS bills, (SELECT COUNT(*) FROM payment_run_lines l WHERE l.run_id = r.id AND l.status = 'PAID') AS paid FROM payment_runs r ORDER BY r.created_at DESC LIMIT 100");
    const users = await prisma.user.findMany({ where: { id: { in: [...new Set(runs.flatMap((r) => [r.prepared_by_id, r.approved_by_id, r.settled_by_id]).filter(Boolean))] } }, select: { id: true, firstName: true, lastName: true, email: true } });
    const nm = new Map(users.map((u) => [u.id, [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email]));
    const banks = await prisma.bank.findMany({ where: { id: { in: [...new Set(runs.map((r) => r.bank_id))] } }, select: { id: true, name: true } });
    const bn = new Map(banks.map((b) => [b.id, b.name]));
    return runs.map((r) => ({ id: r.id, reference: r.reference, bank: bn.get(r.bank_id) || r.bank_id, bankId: r.bank_id, currency: r.currency_code, paymentDate: r.payment_date, status: r.status, total: Number(r.total), bills: Number(r.bills), paid: Number(r.paid), preparedById: r.prepared_by_id, preparedBy: nm.get(r.prepared_by_id) || null, approvedBy: nm.get(r.approved_by_id) || null, approvedAt: r.approved_at, settledBy: nm.get(r.settled_by_id) || null, settledAt: r.settled_at, bankReference: r.bank_reference, notes: r.notes, cancelReason: r.cancel_reason, createdAt: r.created_at }));
  }

  static async get(id: string) {
    await runRow(id);
    const run = (await PaymentRunService.list()).find((r) => r.id === id);
    if (!run) throw fail("Payment run not found", 404);
    const lines: any[] = await prisma.$queryRawUnsafe("SELECT * FROM payment_run_lines WHERE run_id = ? ORDER BY amount DESC", id);
    const invs = await prisma.procurementInvoice.findMany({ where: { id: { in: lines.map((l) => l.invoice_id) } }, select: { id: true, invoiceNumber: true, dueDate: true, paymentStatus: true, vendor: { select: { name: true } } } });
    const byId = new Map(invs.map((i) => [i.id, i]));
    const jes = await prisma.journalEntry.findMany({ where: { id: { in: lines.map((l) => l.journal_entry_id).filter(Boolean) } }, select: { id: true, referenceNumber: true } });
    const je = new Map(jes.map((j) => [j.id, j.referenceNumber]));
    return { ...run, lines: lines.map((l) => { const i = byId.get(l.invoice_id); return { id: l.id, invoiceId: l.invoice_id, invoiceNumber: i?.invoiceNumber, vendor: i?.vendor?.name, dueDate: i?.dueDate, amount: Number(l.amount), status: l.status, error: l.error, journal: je.get(l.journal_entry_id) || null }; }) };
  }

  private static async move(id: string, from: string[], to: string, userId: string, extra: Record<string, any> = {}) {
    const r = await runRow(id);
    if (!from.includes(r.status)) throw fail(`The run is ${r.status.toLowerCase().replace("_", " ")}.`, 409);
    const sets = ["status = ?", ...Object.keys(extra).map((k) => `${k} = ?`)];
    const n = await prisma.$executeRawUnsafe(`UPDATE payment_runs SET ${sets.join(", ")} WHERE id = ? AND status = ?`, to, ...Object.values(extra), id, r.status);
    if (!n) throw fail("The run changed meanwhile; refresh and try again.", 409);
    return r;
  }

  static async submit(id: string, userId: string) {
    const r = await runRow(id);
    if (r.prepared_by_id !== userId) throw fail("The preparer submits the run.", 403);
    await PaymentRunService.move(id, ["DRAFT"], "SUBMITTED", userId, { submitted_at: new Date() });
    await audit(userId, "SUBMIT", id, { reference: r.reference });
    return PaymentRunService.get(id);
  }

  /** Approval by someone other than the preparer; the bills are checked again (anything may have changed since). */
  static async approve(id: string, userId: string) {
    const r = await runRow(id);
    if (r.prepared_by_id === userId) throw fail("A payment run is approved by someone other than the person who prepared it.", 403);
    const bank = await prisma.bank.findUnique({ where: { id: r.bank_id }, include: { currency: true } });
    const lines: any[] = await prisma.$queryRawUnsafe("SELECT invoice_id FROM payment_run_lines WHERE run_id = ?", id);
    const invs = await prisma.procurementInvoice.findMany({ where: { id: { in: lines.map((l) => l.invoice_id) } }, include: { currency: { select: { code: true } } } });
    const problems = [];
    for (const inv of invs) { const why = await whyNot(inv, bank); if (why) problems.push(`${inv.invoiceNumber} (${why})`); }
    if (problems.length) throw fail(`Not approved: ${problems.slice(0, 5).join("; ")}. Return it to the preparer to take those bills out.`, 409);
    await PaymentRunService.move(id, ["SUBMITTED"], "APPROVED", userId, { approved_by_id: userId, approved_at: new Date() });
    await audit(userId, "APPROVE", id, { reference: r.reference, total: Number(r.total) });
    return PaymentRunService.get(id);
  }

  static async cancel(id: string, userId: string, reason: string) {
    if (!String(reason || "").trim()) throw fail("Say why the run is cancelled.");
    const r = await PaymentRunService.move(id, OPEN, "CANCELLED", userId, { cancel_reason: String(reason).slice(0, 1000) });
    await audit(userId, "CANCEL", id, { reference: r.reference, reason });
    return PaymentRunService.get(id);
  }

  /** The bank file: one line per bill, to the vendor's bank account on record. The export is recorded. */
  static async bankFile(id: string, userId: string) {
    const r = await runRow(id);
    if (!["APPROVED", "SETTLED", "PARTLY_SETTLED"].includes(r.status)) throw fail("The bank file is produced once the run is approved.", 409);
    const run = await PaymentRunService.get(id);
    const { VendorBankService } = await import("./VendorBankService");
    const invs = await prisma.procurementInvoice.findMany({ where: { id: { in: run.lines.map((l) => l.invoiceId) } }, select: { id: true, vendorId: true, invoiceNumber: true, vendor: { select: { name: true } } } });
    const cell = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const rows = [["Payee", "Bank", "Branch code", "Account number", "SWIFT", "Currency", "Amount", "Reference"]];
    for (const l of run.lines) {
      const inv = invs.find((i) => i.id === l.invoiceId);
      const payee = await VendorBankService.requirePayee(inv.vendorId, run.currency);
      rows.push([payee.accountName || inv.vendor?.name, payee.bankName, payee.branchCode, payee.accountNumber, payee.swiftCode, run.currency, l.amount.toFixed(2), `${run.reference} ${inv.invoiceNumber}`]);
    }
    await AuditService.log({ userId, action: "EXPORT", entityType: "PaymentRun", entityId: id, newValues: { reference: r.reference, file: "bank file", lines: run.lines.length } }).catch(() => null);
    return { filename: `${r.reference}.csv`, csv: rows.map((x) => x.map(cell).join(",")).join("\r\n") };
  }

  /** The bank has paid: each bill is paid through the procurement payment step with the run's proof; failures are kept. */
  static async settle(id: string, userId: string, p: { bankReference?: string; proofPath: string }) {
    if (!p.proofPath) throw fail("Attach the bank's confirmation of the payments.");
    const r = await runRow(id);
    // an approved run, or one partly settled whose failed bills are tried again
    if (!["APPROVED", "PARTLY_SETTLED"].includes(r.status)) throw fail(`Only an approved run is settled (this one is ${r.status.toLowerCase().replace("_", " ")}).`, 409);
    const claimed = await prisma.$executeRawUnsafe("UPDATE payment_runs SET status = 'SETTLING' WHERE id = ? AND status = ?", id, r.status);
    if (!claimed) throw fail("The run is being settled already.", 409);
    const lines: any[] = await prisma.$queryRawUnsafe("SELECT * FROM payment_run_lines WHERE run_id = ? AND status <> 'PAID'", id);
    const { ProcurementService } = await import("./ProcurementService");
    let paid = 0;
    for (const l of lines) {
      try {
        const res = await ProcurementService.payProcurementInvoice(l.invoice_id, { paymentAmount: Number(l.amount), paymentDate: new Date(`${String(r.payment_date instanceof Date ? r.payment_date.toISOString().slice(0, 10) : r.payment_date).slice(0, 10)}T12:00:00Z`), paymentMethod: "BANK", bankAccountId: r.bank_id, paymentReference: [p.bankReference, r.reference].filter(Boolean).join(" / ").slice(0, 100), proofOfPaymentPath: p.proofPath, notes: `Payment run ${r.reference}` }, userId);
        await prisma.$executeRawUnsafe("UPDATE payment_run_lines SET status = 'PAID', error = NULL, journal_entry_id = ? WHERE id = ?", res?.journalEntry?.id || null, l.id);
        paid++;
      } catch (e) {
        await prisma.$executeRawUnsafe("UPDATE payment_run_lines SET status = 'FAILED', error = ? WHERE id = ?", String(e?.message || e).slice(0, 1000), l.id);
      }
    }
    const [{ open }] = await prisma.$queryRawUnsafe<any[]>("SELECT COUNT(*) AS open FROM payment_run_lines WHERE run_id = ? AND status <> 'PAID'", id);
    // nothing paid at all leaves it as it was (to try again); some paid is partly settled; all paid is settled
    const status = Number(open) ? (paid ? "PARTLY_SETTLED" : r.status) : "SETTLED";
    await prisma.$executeRawUnsafe("UPDATE payment_runs SET status = ?, settled_by_id = ?, settled_at = UTC_TIMESTAMP(3), bank_reference = ?, proof_path = ? WHERE id = ?", status, userId, p.bankReference || null, p.proofPath, id);
    await audit(userId, "SETTLE", id, { reference: r.reference, paid, failed: Number(open), status });
    return PaymentRunService.get(id);
  }
}

export default PaymentRunService;
