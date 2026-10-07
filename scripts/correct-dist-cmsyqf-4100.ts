/**
 * One-off correction for FINDING-ACC-001's underlying data: the real distribution
 * DIST-cmsyqf-1789500971837 (LP distribution — Arcus Growth Fund V, DIVIDEND, 2026-08-31,
 * $2,000,000 gross) was posted by DistributionService.create() *before* the
 * fix/accounting-distribution-gl-treatment change, using the old logic that debited the
 * source revenue account (4100 Dividend Income) directly at declaration. That is exactly
 * the pattern the fix removes: a distribution declaration is a balance-sheet event, not an
 * income-statement one, so the debit belongs on 3100 Retained Earnings, never on a revenue
 * account.
 *
 * The General Ledger Explorer page states journals "cannot be edited or deleted" — correctly,
 * that's an integrity guarantee, not a bug to route around. This script does NOT touch the
 * original journal entry or its lines. It posts a new, ordinary correcting/reclassifying
 * journal entry through the same helper the rest of the app uses
 * (createJournalEntryWithAuditSequence, matching the precedent in
 * scripts/fix-investment-asset-gl.ts), dated the same day as the original distribution so it
 * lands in the same reporting period:
 *
 *   Dr 3100 Retained Earnings   $2,000,000.00
 *   Cr 4100 Dividend Income     $2,000,000.00
 *
 * Net effect: 4100 Dividend Income returns to its true position for August 2026 (nothing else
 * has ever posted to it, so $0 is the honest number), and the $2,000,000 previously
 * misclassified as a debit against revenue now sits against retained earnings, where a
 * distribution of already-implied profit belongs. This does not invent a transaction: the
 * distribution and its $2,000,000 gross amount are real; only the GL account it landed against
 * is being corrected, via a new entry, not a rewrite.
 *
 * Idempotent: skips if a JE with referenceNumber RECLASS-DIST-cmsyqf-1789500971837 already exists.
 *
 * Run with: docker exec arcus-dev-api-1 npx ts-node --transpile-only scripts/correct-dist-cmsyqf-4100.ts
 */
import { prisma } from "../src/utils/database";
import { createJournalEntryWithAuditSequence } from "../src/services/AuditTrailSequenceService";

async function main() {
  const ORIGINAL_REF = "DIST-cmsyqf-1789500971837";
  const CORRECTING_REF = `RECLASS-${ORIGINAL_REF}`;

  const existing = await prisma.journalEntry.findFirst({ where: { referenceNumber: CORRECTING_REF } });
  if (existing) {
    console.log(`SKIPPED — correcting JE already exists (id=${existing.id}, status=${existing.status})`);
    return;
  }

  const original = await prisma.journalEntry.findFirst({
    where: { referenceNumber: ORIGINAL_REF },
    include: { journalEntryLines: { include: { chartOfAccount: true } } },
  });
  if (!original) throw new Error(`Original journal entry ${ORIGINAL_REF} not found`);

  const line4100 = original.journalEntryLines.find((l) => l.chartOfAccount.accountNo === "4100");
  if (!line4100) throw new Error("Expected a 4100 Dividend Income line on the original entry — none found, aborting");
  const amount = Number(line4100.debitAmount.toString());
  if (!(amount > 0)) throw new Error(`Original 4100 line has no debit amount (${line4100.debitAmount}) — aborting`);
  console.log(`Original entry ${original.id} (${ORIGINAL_REF}): 4100 line debited ${amount}`);

  const admin = await prisma.user.findFirst({ where: { email: "admin@nts.com" }, select: { id: true } });
  if (!admin) throw new Error("admin@nts.com not found");

  const retainedEarnings = await prisma.chartOfAccounts.findFirst({ where: { accountNo: "3100", isActive: true }, select: { id: true } });
  const dividendIncome = await prisma.chartOfAccounts.findFirst({ where: { accountNo: "4100", isActive: true }, select: { id: true } });
  if (!retainedEarnings) throw new Error("Account 3100 not found");
  if (!dividendIncome) throw new Error("Account 4100 not found");

  const description = `FINDING-ACC-001 fix: reclass ${ORIGINAL_REF} off 4100 onto 3100 Retained Earnings (pre-fix distribution debited revenue).`;

  const je = await createJournalEntryWithAuditSequence({
    transactionDate: original.transactionDate,
    referenceNumber: CORRECTING_REF,
    description,
    totalAmount: amount,
    currencyId: original.currencyId,
    status: "POSTED",
    createdById: admin.id,
  } as any);

  await prisma.journalEntryLine.create({
    data: {
      journalEntryId: je.id,
      chartOfAccountId: retainedEarnings.id,
      debitAmount: amount,
      creditAmount: 0,
      description: `3100 — Correct distribution ${ORIGINAL_REF}: retained earnings absorbs the declaration, not revenue`,
    },
  });
  await prisma.journalEntryLine.create({
    data: {
      journalEntryId: je.id,
      chartOfAccountId: dividendIncome.id,
      debitAmount: 0,
      creditAmount: amount,
      description: `4100 — Reverse erroneous debit from distribution ${ORIGINAL_REF}`,
    },
  });

  console.log(`DONE — correcting JE posted: id=${je.id}, ref=${CORRECTING_REF}`);
  console.log(`  DR 3100 Retained Earnings  $${amount.toLocaleString()}`);
  console.log(`  CR 4100 Dividend Income    $${amount.toLocaleString()}`);
}

main()
  .catch((e) => {
    console.error("[failed]", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
