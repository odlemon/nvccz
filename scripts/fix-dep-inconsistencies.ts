/**
 * Fixes two classes of depreciation inconsistencies found by the audit:
 *  1. Dep records marked isPosted=true but their JE no longer exists → reset to isPosted=false
 *  2. Asset.currentBookValue doesn't match the last dep record's bookValue → correct it
 *
 * Safe/idempotent — only touches records that are actually broken.
 */
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  const { prisma } = await import("../src/utils/database");

  // Load all dep records and all DEP JEs
  const [allDepRecs, allDepJes, allAssets] = await Promise.all([
    (prisma as any).depreciationRecord.findMany({ orderBy: [{ assetId: "asc" }, { period: "asc" }] }),
    (prisma as any).journalEntry.findMany({ where: { referenceNumber: { startsWith: "DEP-" } }, select: { id: true, referenceNumber: true } }),
    (prisma as any).asset.findMany(),
  ]);

  // Build set of dep record suffixes that have a JE
  const jeLinkedSuffixes = new Set<string>();
  for (const je of allDepJes) {
    const parts = je.referenceNumber.split("-");
    if (parts.length === 4) jeLinkedSuffixes.add(parts[3]);
  }

  // ── Fix 1: Reset isPosted=true records that have no JE ──────────────────────
  console.log("=== Fix 1: Reset ghost-posted dep records ===");
  const ghostPosted = allDepRecs.filter(
    (r: any) => r.isPosted === true && !jeLinkedSuffixes.has(r.id.slice(-8))
  );
  console.log(`Found ${ghostPosted.length} dep records marked posted but no matching JE`);

  if (ghostPosted.length > 0) {
    const assetGroups = new Map<string, string[]>();
    for (const r of ghostPosted) {
      if (!assetGroups.has(r.assetId)) assetGroups.set(r.assetId, []);
      assetGroups.get(r.assetId)!.push(r.period);
    }
    for (const [assetId, periods] of assetGroups) {
      const asset = allAssets.find((a: any) => a.id === assetId);
      console.log(`  ${asset?.assetName} (${assetId.slice(-8)}): resetting ${periods.length} periods — ${periods.join(", ")}`);
    }

    await (prisma as any).depreciationRecord.updateMany({
      where: { id: { in: ghostPosted.map((r: any) => r.id) } },
      data: { isPosted: false, postedAt: null },
    });
    console.log(`✓ Reset ${ghostPosted.length} records to isPosted=false\n`);
  }

  // ── Fix 2: Correct asset.currentBookValue from last dep record ───────────────
  console.log("=== Fix 2: Correct asset book values ===");
  // Reload dep records after fix 1
  const freshRecs = await (prisma as any).depreciationRecord.findMany({ orderBy: [{ assetId: "asc" }, { period: "asc" }] });

  let bookValueFixed = 0;
  for (const asset of allAssets) {
    const recs = freshRecs.filter((r: any) => r.assetId === asset.id);
    if (recs.length === 0) continue;

    const lastRec = recs[recs.length - 1];
    const diff = Math.abs(Number(lastRec.bookValue) - Number(asset.currentBookValue));
    if (diff > 0.01) {
      console.log(`  ${asset.assetName} (${asset.id.slice(-8)}): ${Number(asset.currentBookValue)} → ${Number(lastRec.bookValue)} (last period: ${lastRec.period})`);
      await (prisma as any).asset.update({
        where: { id: asset.id },
        data: { currentBookValue: lastRec.bookValue },
      });
      bookValueFixed++;
    }
  }
  if (bookValueFixed === 0) console.log("  All book values already correct.");
  else console.log(`✓ Corrected book value for ${bookValueFixed} assets\n`);

  // ── Re-run audit summary ──────────────────────────────────────────────────────
  console.log("=== Post-fix audit ===");
  const finalRecs = await (prisma as any).depreciationRecord.findMany({ orderBy: [{ assetId: "asc" }, { period: "asc" }] });
  const finalJes = await (prisma as any).journalEntry.findMany({ where: { referenceNumber: { startsWith: "DEP-" } }, select: { id: true, referenceNumber: true } });
  const finalAssets = await (prisma as any).asset.findMany();

  const finalSuffixes = new Set(finalJes.map((je: any) => je.referenceNumber.split("-")[3]).filter(Boolean));

  let issueCount = 0;
  const assetRecMap = new Map<string, any[]>();
  for (const r of finalRecs) {
    if (!assetRecMap.has(r.assetId)) assetRecMap.set(r.assetId, []);
    assetRecMap.get(r.assetId)!.push(r);
  }

  for (const asset of finalAssets) {
    const recs = assetRecMap.get(asset.id) ?? [];
    if (recs.length === 0) continue;

    const periodCounts = new Map<string, number>();
    for (const r of recs) periodCounts.set(r.period, (periodCounts.get(r.period) ?? 0) + 1);
    const dups = [...periodCounts.entries()].filter(([, c]) => c > 1);
    const unposted = recs.filter((r: any) => !r.isPosted);
    const ghostPosted = recs.filter((r: any) => r.isPosted && !finalSuffixes.has(r.id.slice(-8)));
    const lastRec = recs[recs.length - 1];
    const bookMismatch = Math.abs(Number(lastRec?.bookValue) - Number(asset.currentBookValue)) > 0.01;

    const hasIssue = dups.length > 0 || ghostPosted.length > 0 || bookMismatch;
    if (hasIssue) {
      issueCount++;
      console.log(`  ⚠ ${asset.assetName}: dups=${dups.length} ghostPosted=${ghostPosted.length} unposted=${unposted.length} bookMismatch=${bookMismatch}`);
    } else if (unposted.length > 0) {
      console.log(`  ℹ ${asset.assetName}: ${unposted.length} unposted records (need backfill posting) — ${unposted.map((r: any) => r.period).join(", ")}`);
    }
  }

  console.log(`\nTotal DEP JEs:      ${finalJes.length}`);
  console.log(`Total dep records:  ${finalRecs.length}`);
  console.log(`Critical issues:    ${issueCount}`);

  if (issueCount === 0) {
    console.log("\n✅ All clean — no orphans, no ghost-posted records, no book value mismatches.");
    console.log("   (Unposted records above are calculated but not yet posted — run backfill to post them.)");
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
