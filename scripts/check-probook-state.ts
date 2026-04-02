import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  const { prisma } = await import("../src/utils/database");
  const assetId = "cmktdefvk002vkth4vbz3h73r";

  const asset = await (prisma as any).asset.findUnique({ where: { id: assetId } });
  console.log("Asset:", asset?.assetName);
  console.log("bookValue:", Number(asset?.currentBookValue), "| cost:", Number(asset?.cost));

  const recs = await (prisma as any).depreciationRecord.findMany({ where: { assetId }, orderBy: { period: "asc" } });
  console.log("\nDep records created:", recs.length);
  recs.forEach((r: any) => console.log(`  ${r.period} | $${Number(r.depreciationAmount)} | posted:${r.isPosted}`));

  const jes = await (prisma as any).journalEntry.findMany({
    where: { referenceNumber: { startsWith: "DEP-" }, description: { contains: "HP Probook" } },
    orderBy: { referenceNumber: "asc" }
  });
  console.log("\nJEs created:", jes.length);
  jes.forEach((je: any) => console.log(`  ${je.referenceNumber} | $${Number(je.totalAmount)} | status:${je.status}`));

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
