/**
 * Fetches a sample of journal entries with API ordering (transactionDate desc, createdAt desc)
 * and verifies the sequence is non-increasing. Requires DATABASE_URL (.env).
 *
 *   npx ts-node --transpile-only scripts/fetch-je-sort-sample.ts
 *   npx ts-node --transpile-only scripts/fetch-je-sort-sample.ts 50
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const take = Math.min(Math.max(1, parseInt(process.argv[2] || "30", 10) || 30), 200);
  const rows = await prisma.journalEntry.findMany({
    where: {
      status: { in: ["POSTED", "PENDING"] },
      referenceNumber: { not: { startsWith: "VR-" } },
      AND: [{ referenceNumber: { not: { startsWith: "REV-" } } }],
    },
    select: {
      id: true,
      referenceNumber: true,
      transactionDate: true,
      createdAt: true,
    },
    orderBy: [{ transactionDate: "desc" }, { createdAt: "desc" }],
    take,
  });

  console.log(`Rows: ${rows.length} (limit ${take})\n`);
  let prevTd = Infinity;
  let prevCreated = Infinity;
  let ok = true;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const td = new Date(r.transactionDate).getTime();
    const ca = new Date(r.createdAt).getTime();
    const line = `${i + 1}. ${r.transactionDate.toISOString().slice(0, 10)} | created ${r.createdAt.toISOString().slice(0, 19)} | ${r.referenceNumber}`;
    console.log(line);
    if (i > 0) {
      if (td > prevTd) {
        console.error(`  ERROR: transactionDate went up vs row above (sort broken)`);
        ok = false;
      } else if (td === prevTd && ca > prevCreated) {
        console.error(`  ERROR: same transactionDate but createdAt went up vs row above`);
        ok = false;
      }
    }
    prevTd = td;
    prevCreated = ca;
  }
  console.log(
    ok
      ? "\nOK: newest transactionDate first; ties broken by newest createdAt."
      : "\nFAILED sort check."
  );
  await prisma.$disconnect();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
