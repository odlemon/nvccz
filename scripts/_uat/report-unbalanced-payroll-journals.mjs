/**
 * Reports payroll journals that were posted unbalanced (FINDING-004).
 *
 * The code defect is fixed, so no new entry can be written unbalanced. These
 * are the ones already in the ledger. Correcting posted GL entries is an
 * accounting decision, not a code one -- a correcting journal and a
 * void-and-repost leave different audit trails -- so this REPORTS by default
 * and writes nothing.
 *
 * With --void it deletes the unbalanced entries and their lines, and clears the
 * run's journal_entry_id so the run can be reposted cleanly. Use only if that
 * is the decision taken; there is no undo.
 *
 * Run: node scripts/_uat/report-unbalanced-payroll-journals.mjs [--void]
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const VOID = process.argv.includes("--void");
const money = (v) => Number(v ?? 0);

(async () => {
  const runs = await prisma.payrollRun.findMany({
    where: { journalEntryId: { not: null } },
    select: { id: true, payPeriod: true, status: true, journalEntryId: true, totalGrossPay: true, totalNetPay: true },
    orderBy: { payPeriod: "asc" },
  });

  const broken = [];
  console.log(`Payroll journals on record: ${runs.length}\n`);

  for (const r of runs) {
    const lines = await prisma.$queryRawUnsafe(
      "SELECT description, debitAmount, creditAmount FROM journal_entry_lines WHERE journalEntryId = ?",
      r.journalEntryId,
    );
    const dr = lines.reduce((a, l) => a + money(l.debitAmount), 0);
    const cr = lines.reduce((a, l) => a + money(l.creditAmount), 0);
    const balanced = Math.abs(dr - cr) <= 0.01;
    const hasNet = lines.some((l) => String(l.description).includes("Net Wages"));

    console.log(
      `  ${r.payPeriod}  ${String(r.status).padEnd(10)} lines ${String(lines.length).padStart(2)}  ` +
        `dr ${dr.toFixed(2).padStart(11)}  cr ${cr.toFixed(2).padStart(11)}  ` +
        `${balanced ? "balanced" : `OUT BY ${(cr - dr).toFixed(2)}`}${hasNet ? "" : "  net-pay line MISSING"}`,
    );
    if (!balanced || !hasNet) broken.push({ ...r, dr, cr });
  }

  if (broken.length === 0) {
    console.log("\nAll payroll journals balance and carry a net-pay line.");
    await prisma.$disconnect();
    process.exit(0);
  }

  console.log(`\n${broken.length} journal(s) were posted unbalanced, total misstatement ` +
    `${broken.reduce((a, b) => a + (b.cr - b.dr), 0).toFixed(2)} on the credit side.`);

  if (!VOID) {
    console.log("\nNothing written. Two ways to correct these, and the choice is an");
    console.log("accounting one:");
    console.log("  a) post a correcting journal per period, leaving the original visible");
    console.log("  b) void and repost, which is cleaner but rewrites history");
    console.log("\nRe-run with --void to take option (b): the entries and their lines are");
    console.log("deleted and each run's journal_entry_id is cleared so it can be reposted.");
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log("\n--void given — removing the unbalanced entries");
  for (const b of broken) {
    await prisma.$executeRawUnsafe("DELETE FROM journal_entry_lines WHERE journalEntryId = ?", b.journalEntryId);
    await prisma.$executeRawUnsafe("DELETE FROM journal_entries WHERE id = ?", b.journalEntryId).catch(() => {});
    await prisma.payrollRun.update({ where: { id: b.id }, data: { journalEntryId: null } });
    console.log(`  voided ${b.payPeriod} (${b.journalEntryId}) and cleared the run's link`);
  }
  console.log("\nRuns can now be reposted. The code fix means the repost will balance or refuse.");
  await prisma.$disconnect();
  process.exit(0);
})().catch(async (e) => {
  console.error("failed:", e.message);
  await prisma.$disconnect();
  process.exit(1);
});
