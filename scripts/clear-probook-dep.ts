import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  const { prisma } = await import("../src/utils/database");
  const assetId = "cmktdefvk002vkth4vbz3h73r";

  const asset = await (prisma as any).asset.findUnique({ where: { id: assetId } });
  console.log("Asset:", asset?.assetName, "| current bookValue:", Number(asset?.currentBookValue));

  const jes = await (prisma as any).journalEntry.findMany({
    where: { referenceNumber: { startsWith: "DEP-" }, description: { contains: "HP Probook" } },
    select: { id: true, referenceNumber: true }
  });
  const jeIds = jes.map((j: any) => j.id);
  console.log("JEs to delete:", jes.map((j: any) => j.referenceNumber).join(", ") || "none");

  const lines = await (prisma as any).journalEntryLine.deleteMany({ where: { journalEntryId: { in: jeIds } } });
  const delJes = await (prisma as any).journalEntry.deleteMany({ where: { id: { in: jeIds } } });
  const delRecs = await (prisma as any).depreciationRecord.deleteMany({ where: { assetId } });
  await (prisma as any).asset.update({ where: { id: assetId }, data: { currentBookValue: asset.cost } });

  console.log("\n✓ JE lines deleted:", lines.count);
  console.log("✓ JEs deleted:", delJes.count);
  console.log("✓ Dep records deleted:", delRecs.count);
  console.log("✓ Book value reset to:", Number(asset.cost));

  // Verify
  const remaining = await (prisma as any).depreciationRecord.count({ where: { assetId } });
  const finalAsset = await (prisma as any).asset.findUnique({ where: { id: assetId } });
  console.log("\nVerification — dep records remaining:", remaining);
  console.log("Verification — book value now:", Number(finalAsset.currentBookValue));

  if (remaining === 0) console.log("\n✅ Clean.");

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
