// A12 — remediation, not a schema change: 13 POSTED "VR-PAYROLL-…" reversal journals are themselves unbalanced
// (created by voidJournalEntry mirroring 13 already-broken PAYROLL test-run journals from before the payroll posting
// fix — the void correctly marked the originals VOID, but its reversal-creation path had no balance check and posted
// an equally-unbalanced mirror image, doubling the trial-balance break the J-06 void was meant to remove instead of
// fixing it). voidJournalEntry now refuses to auto-post an unbalanced reversal (see JournalEntryService.ts); this
// script voids the 13 that already slipped through, through the normal service path (audit trail, D20: never deleted).
// Idempotent: skips anything not currently POSTED-and-unbalanced. Run: npx ts-node --transpile-only -r dotenv/config
// scripts/run-accounting-broken-reversal-cleanup.ts --by=<email> [--check]
import { prisma } from "../src/utils/database";
import { JournalEntryService } from "../src/services/JournalEntryService";

async function main() {
  const check = process.argv.includes("--check");
  const byArg = process.argv.find((a) => a.startsWith("--by="));
  const byEmail = byArg ? byArg.slice(5) : null;
  const actor = byEmail ? await prisma.user.findFirst({ where: { email: byEmail }, select: { id: true, email: true } }) : null;
  if (!check && !actor) throw new Error("Pass --by=<email> of the accounting user running this (or --check to only report).");

  const journals = await prisma.journalEntry.findMany({
    where: { status: "POSTED", referenceNumber: { startsWith: "VR-PAYROLL-" } },
    include: { journalEntryLines: { select: { debitAmount: true, creditAmount: true } } },
  });
  const broken = journals.filter((j) => Math.abs(j.journalEntryLines.reduce((s, l) => s + Number(l.debitAmount) - Number(l.creditAmount), 0)) > 0.01);
  console.log(`[found] ${broken.length} POSTED VR-PAYROLL- reversal journal(s) that do not balance on their own lines`);
  for (const j of broken) {
    const diff = j.journalEntryLines.reduce((s, l) => s + Number(l.debitAmount) - Number(l.creditAmount), 0);
    console.log(`  ${j.referenceNumber}  diff=${Math.round(diff * 100) / 100}`);
  }
  if (check || !broken.length) { console.log(check ? "[check] nothing applied" : "[skip] nothing to do"); return; }

  for (const j of broken) {
    await JournalEntryService.voidJournalEntry(j.id, actor!.id, {
      reason: "A12 remediation: this reversal was itself unbalanced (it mirrored an already-broken payroll test journal from before the payroll posting fix); voided rather than left posted, per D18/D20.",
    });
    console.log(`[voided] ${j.referenceNumber}`);
  }
  console.log(`[ok] voided ${broken.length} broken reversal journal(s), by ${actor!.email}`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
