import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  const { prisma } = await import("../src/utils/database");

  // Find all DEP journal entries and trace each one
  const allDepJes = await (prisma as any).journalEntry.findMany({
    where: { referenceNumber: { startsWith: "DEP-" } },
    orderBy: { createdAt: "asc" },
    include: {
      journalEntryLines: { include: { chartOfAccount: { select: { accountName: true, accountNo: true } } } }
    }
  });

  console.log(`Total DEP journal entries: ${allDepJes.length}\n`);

  // Check schema - does depreciationRecord have journalEntryId?
  const sampleRec = await (prisma as any).depreciationRecord.findFirst();
  console.log("Sample dep record keys:", sampleRec ? Object.keys(sampleRec).join(", ") : "none");

  for (const je of allDepJes) {
    console.log(`\n--- JE: ${je.referenceNumber}`);
    console.log(`  id:          ${je.id}`);
    console.log(`  date:        ${je.transactionDate?.toISOString().slice(0,10)}`);
    console.log(`  amount:      ${Number(je.totalAmount)}`);
    console.log(`  status:      ${je.status}`);
    console.log(`  description: ${je.description}`);
    console.log(`  createdAt:   ${je.createdAt?.toISOString().slice(0,16)}`);

    for (const l of je.journalEntryLines) {
      console.log(`  Line: ${l.chartOfAccount?.accountNo} ${l.chartOfAccount?.accountName} | Dr:${Number(l.debitAmount)} Cr:${Number(l.creditAmount)} | ${l.description}`);
    }

    // Try to find a dep record linked to this JE by matching reference suffix
    // Reference format: DEP-YYYY-MM-last8ofDepRecordId
    const parts = je.referenceNumber.split("-");
    // DEP-2024-09-ihwebqq6 => parts = ["DEP","2024","09","ihwebqq6"]
    if (parts.length === 4) {
      const suffix = parts[3];
      const depRec = await (prisma as any).depreciationRecord.findFirst({
        where: { id: { endsWith: suffix } },
        include: { asset: { select: { assetName: true } } }
      });
      console.log(`  Linked depRec: ${depRec ? `${depRec.asset?.assetName} | period: ${depRec.period} | posted: ${depRec.isPosted}` : "NOT FOUND — potential orphan"}`);
    } else {
      console.log(`  Reference format non-standard (${parts.length} parts) — likely orphan`);
      // Check if any dep record references this JE
      const byPeriod = parts.length >= 3 ? `${parts[1]}-${String(parts[2]).padStart(2,'0')}` : null;
      if (byPeriod) {
        const depRecs = await (prisma as any).depreciationRecord.findMany({ where: { period: byPeriod } });
        console.log(`  DepRecords for period ${byPeriod}: ${depRecs.length}`);
      }
    }
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
