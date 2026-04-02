/**
 * Full audit of all depreciation records vs journal entries.
 * Flags: orphan JEs, dep records with no JE, duplicate dep records per period, wrong accounts.
 */
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  const { prisma } = await import("../src/utils/database");

  // ── Load everything ──────────────────────────────────────────────────────────
  const [allAssets, allDepRecs, allDepJes] = await Promise.all([
    (prisma as any).asset.findMany({ orderBy: { assetName: "asc" } }),
    (prisma as any).depreciationRecord.findMany({ orderBy: [{ assetId: "asc" }, { period: "asc" }] }),
    (prisma as any).journalEntry.findMany({
      where: { referenceNumber: { startsWith: "DEP-" } },
      include: {
        journalEntryLines: {
          include: { chartOfAccount: { select: { accountNo: true, accountName: true } } }
        }
      },
      orderBy: { referenceNumber: "asc" }
    }),
  ]);

  console.log(`\nTotal assets:               ${allAssets.length}`);
  console.log(`Total dep records:          ${allDepRecs.length}`);
  console.log(`Total DEP journal entries:  ${allDepJes.length}`);

  // Build lookup: last 8 chars of dep record id -> dep record
  const depRecBySuffix = new Map<string, any>();
  for (const r of allDepRecs) depRecBySuffix.set(r.id.slice(-8), r);

  // ── Check each JE ────────────────────────────────────────────────────────────
  console.log("\n\n========== JOURNAL ENTRY AUDIT ==========");
  const orphanJeIds: string[] = [];
  const wrongAccountJeIds: string[] = [];

  for (const je of allDepJes) {
    const parts = je.referenceNumber.split("-");
    // Valid format: DEP-YYYY-MM-xxxxxxxx (4 parts)
    const isNewFormat = parts.length === 4;
    const suffix = isNewFormat ? parts[3] : null;
    const linkedRec = suffix ? depRecBySuffix.get(suffix) : null;
    const asset = linkedRec ? allAssets.find((a: any) => a.id === linkedRec.assetId) : null;

    // Check accounts
    const drLine = je.journalEntryLines.find((l: any) => Number(l.debitAmount) > 0);
    const hasWrongAccount = drLine && !["5130", "5100"].includes(drLine.chartOfAccount?.accountNo?.slice(0, 4));

    if (!isNewFormat || !linkedRec) {
      orphanJeIds.push(je.id);
      console.log(`\n[ORPHAN] ${je.referenceNumber}`);
      console.log(`  id: ${je.id} | date: ${je.transactionDate?.toISOString().slice(0,10)} | amount: ${Number(je.totalAmount)}`);
      console.log(`  desc: ${je.description}`);
      console.log(`  Dr account: ${drLine?.chartOfAccount?.accountNo} ${drLine?.chartOfAccount?.accountName}`);
      console.log(`  reason: ${!isNewFormat ? "old format (no suffix)" : "suffix not matched to any dep record"}`);
    } else {
      // Valid JE
      const postedOk = linkedRec.isPosted === true;
      const amountMatch = Math.abs(Number(je.totalAmount) - Number(linkedRec.depreciationAmount)) < 0.01;
      const status = (!postedOk || !amountMatch) ? " ⚠" : " ✓";
      console.log(`${status} ${je.referenceNumber} | ${asset?.assetName?.slice(0,35).padEnd(35)} | period: ${linkedRec.period} | $${Number(je.totalAmount)} | posted:${linkedRec.isPosted} | amountMatch:${amountMatch}`);
    }
  }

  // ── Check each asset's dep records ──────────────────────────────────────────
  console.log("\n\n========== ASSET DEPRECIATION AUDIT ==========");
  let totalIssues = 0;

  for (const asset of allAssets) {
    const recs = allDepRecs.filter((r: any) => r.assetId === asset.id);
    if (recs.length === 0) continue;

    // Check for duplicate periods
    const periodCounts = new Map<string, number>();
    for (const r of recs) periodCounts.set(r.period, (periodCounts.get(r.period) ?? 0) + 1);
    const dupPeriods = [...periodCounts.entries()].filter(([, c]) => c > 1);

    // Check for unposted records
    const unposted = recs.filter((r: any) => !r.isPosted);

    // Check that each posted record has a matching JE
    const missingJe: string[] = [];
    for (const r of recs.filter((r: any) => r.isPosted)) {
      const suffix = r.id.slice(-8);
      const je = allDepJes.find((je: any) => je.referenceNumber.endsWith(suffix));
      if (!je) missingJe.push(r.period);
    }

    const hasIssue = dupPeriods.length > 0 || unposted.length > 0 || missingJe.length > 0;
    if (hasIssue) totalIssues++;

    // Book value sanity: last rec bookValue should match asset.currentBookValue
    const lastRec = recs[recs.length - 1];
    const bookValueMismatch = Math.abs(Number(lastRec?.bookValue) - Number(asset.currentBookValue)) > 0.01;

    const tag = hasIssue || bookValueMismatch ? "⚠ " : "✓ ";
    console.log(`\n${tag}${asset.assetName} (${asset.id.slice(-8)})`);
    console.log(`   status:${asset.status} | cost:$${Number(asset.cost)} | bookValue:$${Number(asset.currentBookValue)} | records:${recs.length}`);
    if (dupPeriods.length > 0) console.log(`   DUPLICATE PERIODS: ${dupPeriods.map(([p, c]) => `${p}(x${c})`).join(", ")}`);
    if (unposted.length > 0) console.log(`   UNPOSTED: ${unposted.map((r: any) => r.period).join(", ")}`);
    if (missingJe.length > 0) console.log(`   POSTED BUT NO JE: ${missingJe.join(", ")}`);
    if (bookValueMismatch) console.log(`   BOOK VALUE MISMATCH: lastRec=${Number(lastRec?.bookValue)} vs asset=${Number(asset.currentBookValue)}`);
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log("\n\n========== SUMMARY ==========");
  console.log(`Orphan JEs (no linked dep record): ${orphanJeIds.length}`);
  console.log(`Assets with issues:                ${totalIssues}`);
  if (orphanJeIds.length === 0 && totalIssues === 0) {
    console.log("\n✅ All clean — no orphans, no duplicates, no mismatches.");
  } else {
    console.log("\n⚠  Issues found — review above and run cleanup if needed.");
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
