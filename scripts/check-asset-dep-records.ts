import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  const { prisma } = await import("../src/utils/database");
  const assetId = "cmmajmogf007fktuz16rxek5t";

  const asset = await (prisma as any).asset.findUnique({ where: { id: assetId } });
  console.log("Asset:", asset?.assetName, "| bookValue:", Number(asset?.currentBookValue), "| purchaseDate:", asset?.purchaseDate?.toISOString().slice(0,10));

  const recs = await (prisma as any).depreciationRecord.findMany({
    where: { assetId },
    orderBy: { period: "asc" }
  });
  console.log("\nDepreciation records:", recs.length);
  for (const r of recs) {
    console.log(`  ${r.period} | amount: ${Number(r.depreciationAmount)} | accumulated: ${Number(r.accumulatedDepreciation)} | bookValue: ${Number(r.bookValue)} | posted: ${r.isPosted}`);
  }

  const jes = await (prisma as any).journalEntry.findMany({
    where: { referenceNumber: { startsWith: "DEP-2024" } },
    orderBy: { transactionDate: "asc" },
    take: 30
  });
  console.log("\nJournal entries (DEP-2024*):", jes.length);
  for (const je of jes) {
    console.log(`  ${je.referenceNumber} | date: ${je.transactionDate?.toISOString().slice(0,10)} | amount: ${Number(je.totalAmount)} | status: ${je.status}`);
  }

  // Also check how many DEP entries exist total
  const total = await (prisma as any).journalEntry.count({ where: { referenceNumber: { startsWith: "DEP-" } } });
  console.log("\nTotal DEP journal entries in DB:", total);

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
