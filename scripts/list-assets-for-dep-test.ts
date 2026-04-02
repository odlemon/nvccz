import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  const { prisma } = await import("../src/utils/database");

  const assets = await (prisma as any).asset.findMany({
    include: {
      depreciationRecords: { orderBy: { period: "desc" }, take: 1 }
    },
    orderBy: { purchaseDate: "asc" },
    take: 20
  });

  console.log(`\nTotal assets found: ${assets.length}\n`);
  for (const a of assets) {
    const lastPeriod = a.depreciationRecords?.[0]?.period ?? "NONE";
    console.log(
      `ID: ${a.id}\n` +
      `  Name:        ${a.assetName}\n` +
      `  Status:      ${a.status}\n` +
      `  PurchaseDate:${a.purchaseDate?.toISOString().slice(0, 10)}\n` +
      `  Method:      ${a.depreciationMethod}\n` +
      `  Cost:        ${Number(a.cost)}\n` +
      `  BookValue:   ${Number(a.currentBookValue)}\n` +
      `  LastPeriod:  ${lastPeriod}\n`
    );
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
