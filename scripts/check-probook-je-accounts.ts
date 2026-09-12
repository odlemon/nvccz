import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  const { prisma } = await import("../src/utils/database");

  // Also check what accounts the HP Probook asset is configured with
  const asset = await (prisma as any).asset.findUnique({
    where: { id: "cmktdefvk002vkth4vbz3h73r" },
    include: {
      depreciationExpenseAccount: true,
      accumulatedDepreciationAccount: true,
      assetAccount: true,
    }
  });

  console.log("=== Asset Account Config ===");
  console.log("Asset account:          ", asset.assetAccount?.accountNo, asset.assetAccount?.accountName);
  console.log("Depreciation expense:   ", asset.depreciationExpenseAccount?.accountNo, asset.depreciationExpenseAccount?.accountName);
  console.log("Accumulated depr:       ", asset.accumulatedDepreciationAccount?.accountNo, asset.accumulatedDepreciationAccount?.accountName);

  // Sample first and last JE to verify lines
  const jes = await (prisma as any).journalEntry.findMany({
    where: { referenceNumber: { startsWith: "DEP-" }, description: { contains: "HP Probook" } },
    include: {
      journalEntryLines: {
        include: { chartOfAccount: { select: { accountNo: true, accountName: true, accountType: true } } }
      }
    },
    orderBy: { referenceNumber: "asc" },
  });

  console.log(`\n=== JE Lines (sample: first + last of ${jes.length}) ===`);
  for (const je of [jes[0], jes[jes.length - 1]]) {
    console.log(`\nJE: ${je.referenceNumber} | date: ${je.transactionDate?.toISOString().slice(0,10)} | $${Number(je.totalAmount)}`);
    for (const l of je.journalEntryLines) {
      const side = Number(l.debitAmount) > 0 ? `Dr $${Number(l.debitAmount)}` : `Cr $${Number(l.creditAmount)}`;
      console.log(`  ${side}  →  ${l.chartOfAccount?.accountNo} ${l.chartOfAccount?.accountName} (${l.chartOfAccount?.accountType})`);
    }
  }

  // Validate all JEs have exactly 2 lines, balanced
  console.log("\n=== Validation ===");
  let allOk = true;
  for (const je of jes) {
    const lines = je.journalEntryLines;
    const totalDr = lines.reduce((s: number, l: any) => s + Number(l.debitAmount), 0);
    const totalCr = lines.reduce((s: number, l: any) => s + Number(l.creditAmount), 0);
    const balanced = Math.abs(totalDr - totalCr) < 0.01;
    const twoLines = lines.length === 2;
    if (!balanced || !twoLines) {
      console.log(`  ⚠ ${je.referenceNumber}: lines=${lines.length} Dr=${totalDr} Cr=${totalCr} balanced=${balanced}`);
      allOk = false;
    }
  }
  if (allOk) console.log(`  ✅ All ${jes.length} JEs have exactly 2 lines and are balanced (Dr = Cr)`);

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
