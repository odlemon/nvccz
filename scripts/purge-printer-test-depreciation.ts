/**
 * Removes the test depreciation records + journal entries created for:
 *   HP Colour LaserJet Pro MFP 4303DW Printer (cmmajmogf007fktuz16rxek5t)
 * Resets asset.currentBookValue back to original cost.
 *
 * Run: npm run db:cleanup:printer-test-dep
 */
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const ASSET_ID = "cmmajmogf007fktuz16rxek5t";

async function main() {
  const { prisma } = await import("../src/utils/database");

  const asset = await (prisma as any).asset.findUnique({ where: { id: ASSET_ID } });
  if (!asset) {
    console.log("Asset not found — nothing to do.");
    await prisma.$disconnect();
    return;
  }
  console.log(`Asset: ${asset.assetName}`);
  console.log(`Current book value: ${Number(asset.currentBookValue)} | Cost: ${Number(asset.cost)}\n`);

  // ── 1. Find all dep records for this asset ────────────────────────────────
  const depRecs = await (prisma as any).depreciationRecord.findMany({
    where: { assetId: ASSET_ID },
    orderBy: { period: "asc" },
  });
  console.log(`Dep records to delete: ${depRecs.length}`);
  depRecs.forEach((r: any) => console.log(`  ${r.period} | $${Number(r.depreciationAmount)} | posted:${r.isPosted}`));

  // ── 2. Find all JEs linked to these dep records (match by description + DEP- prefix) ──
  const allDepJes = await (prisma as any).journalEntry.findMany({
    where: {
      referenceNumber: { startsWith: "DEP-" },
      description: { contains: asset.assetName },
    },
  });
  console.log(`\nJournal entries to delete: ${allDepJes.length}`);
  allDepJes.forEach((je: any) => console.log(`  ${je.referenceNumber} | date:${je.transactionDate?.toISOString().slice(0,10)} | $${Number(je.totalAmount)}`));

  const jeIds = allDepJes.map((je: any) => je.id);

  // ── 3. Delete journal entry lines ──────────────────────────────────────────
  const delLines = await (prisma as any).journalEntryLine.deleteMany({
    where: { journalEntryId: { in: jeIds } },
  });
  console.log(`\n✓ Deleted ${delLines.count} journal entry lines`);

  // ── 4. Delete journal entries ──────────────────────────────────────────────
  const delJes = await (prisma as any).journalEntry.deleteMany({
    where: { id: { in: jeIds } },
  });
  console.log(`✓ Deleted ${delJes.count} journal entries`);

  // ── 5. Delete depreciation records ────────────────────────────────────────
  const delRecs = await (prisma as any).depreciationRecord.deleteMany({
    where: { assetId: ASSET_ID },
  });
  console.log(`✓ Deleted ${delRecs.count} depreciation records`);

  // ── 6. Reset asset book value to original cost ────────────────────────────
  await (prisma as any).asset.update({
    where: { id: ASSET_ID },
    data: { currentBookValue: asset.cost },
  });
  console.log(`✓ Reset book value: ${Number(asset.currentBookValue)} → ${Number(asset.cost)} (original cost)`);

  // ── 7. Verify ─────────────────────────────────────────────────────────────
  const remaining = await (prisma as any).depreciationRecord.count({ where: { assetId: ASSET_ID } });
  const remainingJes = await (prisma as any).journalEntry.count({
    where: { referenceNumber: { startsWith: "DEP-" }, description: { contains: asset.assetName } },
  });
  const finalAsset = await (prisma as any).asset.findUnique({ where: { id: ASSET_ID } });

  console.log(`\n--- Verification ---`);
  console.log(`Dep records remaining:  ${remaining}`);
  console.log(`JEs remaining:          ${remainingJes}`);
  console.log(`Asset book value now:   ${Number(finalAsset.currentBookValue)}`);

  if (remaining === 0 && remainingJes === 0 && Math.abs(Number(finalAsset.currentBookValue) - Number(asset.cost)) < 0.01) {
    console.log("\n✅ Clean — all test depreciation removed, book value restored.");
  } else {
    console.log("\n⚠ Something may still remain — check above.");
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
