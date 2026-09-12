/**
 * Read-only: counts depreciation_records and depreciation-style journal entries.
 * Loads `.env` from repo root before Prisma (static imports would run too early).
 *
 * Usage: npx ts-node --transpile-only scripts/check-depreciation-purge-leftovers.ts
 */
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../.env") });

async function main() {
  const { prisma } = await import("../src/utils/database");
  try {
  const [recordCount, depJeByRef, depJeByDesc, linesForDepJe] = await Promise.all([
    prisma.depreciationRecord.count(),
    prisma.journalEntry.count({
      where: { referenceNumber: { startsWith: "DEP-" } }
    }),
    prisma.journalEntry.count({
      where: { description: { startsWith: "Depreciation for " } }
    }),
    prisma.journalEntryLine.count({
      where: {
        journalEntry: {
          OR: [
            { referenceNumber: { startsWith: "DEP-" } },
            { description: { startsWith: "Depreciation for " } }
          ]
        }
      }
    })
  ]);

  const sampleRecords =
    recordCount > 0
      ? await prisma.depreciationRecord.findMany({
          take: 5,
          orderBy: { createdAt: "desc" },
          select: { id: true, period: true, assetId: true, isPosted: true }
        })
      : [];

  const sampleJes =
    depJeByRef > 0 || depJeByDesc > 0
      ? await prisma.journalEntry.findMany({
          where: {
            OR: [
              { referenceNumber: { startsWith: "DEP-" } },
              { description: { startsWith: "Depreciation for " } }
            ]
          },
          take: 8,
          orderBy: { createdAt: "desc" },
          select: { id: true, referenceNumber: true, description: true, transactionDate: true }
        })
      : [];

  const clean =
    recordCount === 0 && depJeByRef === 0 && depJeByDesc === 0 && linesForDepJe === 0;

  console.log(
    JSON.stringify(
      {
        clean,
        counts: {
          depreciation_records: recordCount,
          journal_entries_ref_DEP_dash: depJeByRef,
          journal_entries_desc_Depreciation_for: depJeByDesc,
          journal_entry_lines_linked_to_those_JEs: linesForDepJe
        },
        sampleDepreciationRecords: sampleRecords,
        sampleDepreciationJournalEntries: sampleJes,
        interpretation: clean
          ? "No depreciation subledger rows and no DEP-/Depreciation-for journals found."
          : "Leftovers remain — re-run db:purge:depreciation-records-and-journals (stop npm run dev first)."
      },
      null,
      2
    )
  );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
