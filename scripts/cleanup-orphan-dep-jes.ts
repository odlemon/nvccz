/**
 * Cleans up two sets of bad depreciation journal entries:
 *  1. 13 orphan JEs for "350L Fridge" — old format (DEP-YYYY-MM, no asset suffix),
 *     wrong account (5100 Office Rental), no matching dep record.
 *  2. Duplicate JEs for "2 in 1 Workstation Desk" — two backfill runs created
 *     duplicate dep records + JEs for the same periods.
 *
 * Run: npm run db:cleanup:orphan-dep-jes
 */
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  const { prisma } = await import("../src/utils/database");

  // ── 1. Orphan 350L Fridge JEs (old format, no suffix, wrong account) ────────
  const orphanIds = [
    "cmmki0p150009ktryg8rbbuys", // DEP-2024-12
    "cmmm15lk6001tktrybqhr4i90", // DEP-2025-01
    "cmmm15ygl0021ktry4pd2unmn", // DEP-2025-02
    "cmmm162b80029ktryf15zht9l", // DEP-2025-03
    "cmmm1680s002hktryyusfun82", // DEP-2025-04
    "cmmm16an8002pktrye6o1pff9", // DEP-2025-05
    "cmmm16ddd002xktry0yd39mkw", // DEP-2025-06
    "cmmm16fzo0035ktryczsxud1f", // DEP-2025-07
    "cmmm16iis003dktrys02qrlmv", // DEP-2025-08
    "cmmm16l6q003lktryt79laqc5", // DEP-2025-09
    "cmmm16nw4003tktrytvy3i3hx", // DEP-2025-10
    "cmmm16pv80041ktryhyrdku5u", // DEP-2025-11
    "cmmm16s5g0049ktryqvk5grg8", // DEP-2025-12
  ];

  console.log("=== Orphan 350L Fridge JEs ===");
  await (prisma as any).journalEntryLine.deleteMany({ where: { journalEntryId: { in: orphanIds } } });
  const del1 = await (prisma as any).journalEntry.deleteMany({ where: { id: { in: orphanIds } } });
  console.log(`✓ Deleted ${del1.count} orphan journal entries + their lines`);

  // ── 2. Duplicate "2 in 1 Workstation Desk" — two runs created double records ─
  console.log("\n=== 2 in 1 Workstation Desk duplicate check ===");

  // Find all dep records for this asset (there should only be one asset named this)
  const deskAssets = await (prisma as any).asset.findMany({
    where: { assetName: { contains: "2 in 1 Workstation Desk" } },
    select: { id: true, assetName: true, currentBookValue: true }
  });
  console.log("Assets found:", deskAssets.map((a: any) => `${a.id} | ${a.assetName} | bookValue: ${Number(a.currentBookValue)}`));

  for (const asset of deskAssets) {
    const recs = await (prisma as any).depreciationRecord.findMany({
      where: { assetId: asset.id },
      orderBy: [{ period: "asc" }, { createdAt: "asc" }]
    });

    // Group by period to find duplicates
    const byPeriod = new Map<string, any[]>();
    for (const r of recs) {
      if (!byPeriod.has(r.period)) byPeriod.set(r.period, []);
      byPeriod.get(r.period)!.push(r);
    }

    const dupPeriods = [...byPeriod.entries()].filter(([, v]) => v.length > 1);
    console.log(`\n  Asset ${asset.id}: ${recs.length} records, ${dupPeriods.length} duplicated periods`);

    if (dupPeriods.length === 0) continue;

    // For each duplicated period: keep the FIRST record (earliest createdAt), delete the rest
    const toDeleteDepRecIds: string[] = [];
    const toDeleteJeIds: string[] = [];

    for (const [period, records] of dupPeriods) {
      const sorted = records.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const keep = sorted[0];
      const remove = sorted.slice(1);
      console.log(`  Period ${period}: keeping ${keep.id} (${keep.createdAt?.toISOString().slice(0,16)}), removing ${remove.length}`);

      for (const r of remove) {
        toDeleteDepRecIds.push(r.id);
        // Find the JE for this dep record by suffix match
        const suffix = r.id.slice(-8);
        const je = await (prisma as any).journalEntry.findFirst({
          where: { referenceNumber: { endsWith: suffix } }
        });
        if (je) {
          toDeleteJeIds.push(je.id);
          console.log(`    -> will delete JE ${je.referenceNumber} (${je.id})`);
        } else {
          console.log(`    -> no JE found for dep record ${r.id}`);
        }
      }
    }

    if (toDeleteJeIds.length > 0) {
      await (prisma as any).journalEntryLine.deleteMany({ where: { journalEntryId: { in: toDeleteJeIds } } });
      await (prisma as any).journalEntry.deleteMany({ where: { id: { in: toDeleteJeIds } } });
      console.log(`  ✓ Deleted ${toDeleteJeIds.length} duplicate JEs`);
    }

    if (toDeleteDepRecIds.length > 0) {
      await (prisma as any).depreciationRecord.deleteMany({ where: { id: { in: toDeleteDepRecIds } } });
      console.log(`  ✓ Deleted ${toDeleteDepRecIds.length} duplicate dep records`);
    }

    // Recalculate correct book value from remaining records
    const remaining = await (prisma as any).depreciationRecord.findMany({
      where: { assetId: asset.id },
      orderBy: { period: "desc" },
      take: 1
    });
    if (remaining.length > 0) {
      await (prisma as any).asset.update({
        where: { id: asset.id },
        data: { currentBookValue: remaining[0].bookValue }
      });
      console.log(`  ✓ Corrected book value to ${Number(remaining[0].bookValue)} (from period ${remaining[0].period})`);
    }
  }

  // ── Final count ──────────────────────────────────────────────────────────────
  const totalRemaining = await (prisma as any).journalEntry.count({ where: { referenceNumber: { startsWith: "DEP-" } } });
  console.log(`\n✓ Done. DEP journal entries remaining: ${totalRemaining}`);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
