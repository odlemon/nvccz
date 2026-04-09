/**
 * Removes duplicate portfolio valuation rows created by repeated ACCEPT (same amounts/date/notes),
 * keeps the newest row + journal entry, deletes older valuation rows and their JEs.
 *
 * Usage:
 *   npx ts-node scripts/dedupe-valuation-journal-entries.ts <portfolioCompanyId> [--dry-run]
 *   npx ts-node scripts/dedupe-valuation-journal-entries.ts --scan   # list companies with duplicate groups
 */

import { prisma } from "../src/utils/database";

/** Header descriptions for valuation JEs (Arcus wording + legacy). */
function valuationJournalDescriptionsForCompanyName(companyName: string): string[] {
  const n = companyName.trim();
  return [
    `Valuation adjustment for ${n}`,
    `Unrealized Gain on ${n} Valuation Adjustment.`,
    `Unrealized Loss on ${n} Valuation Adjustment.`,
  ];
}

function fingerprint(row: {
  valuationDate: Date | string;
  previousAmount: unknown;
  newAmount: unknown;
  difference: unknown;
  notes: string | null;
}) {
  const d =
    row.valuationDate instanceof Date
      ? row.valuationDate.toISOString().split("T")[0]
      : String(row.valuationDate).slice(0, 10);
  const prev = Number(row.previousAmount).toFixed(2);
  const next = Number(row.newAmount).toFixed(2);
  const diff = Number(row.difference).toFixed(2);
  const notes = row.notes ?? "";
  return `${d}|${prev}|${next}|${diff}|${notes}`;
}

async function pruneFinancialKpisValuationHistory(
  portfolioCompanyId: string,
  keepJournalEntryIds: Set<string>
) {
  const company = await prisma.portfolioCompany.findUnique({
    where: { id: portfolioCompanyId },
    select: { financialKpis: true },
  });
  if (!company?.financialKpis || typeof company.financialKpis !== "object") {
    return;
  }
  const snap: any = { ...(company.financialKpis as object) };
  const hist = Array.isArray(snap.valuationHistory) ? snap.valuationHistory : [];
  snap.valuationHistory = hist.filter(
    (h: any) => h?.journalEntryId && keepJournalEntryIds.has(String(h.journalEntryId))
  );

  const vals: { journalEntryId: string | null; newAmount: unknown; difference: unknown; valuationDate: Date }[] =
    await prisma.$queryRawUnsafe(
      `SELECT journalEntryId, newAmount, difference, valuationDate
       FROM portfolio_company_valuations
       WHERE portfolioCompanyId = ?
       ORDER BY createdAt DESC
       LIMIT 1`,
      portfolioCompanyId
    );
  const latest = vals[0];
  if (latest?.journalEntryId) {
    const vd =
      latest.valuationDate instanceof Date
        ? latest.valuationDate.toISOString().split("T")[0]
        : String(latest.valuationDate).slice(0, 10);
    snap.latestValuation = {
      valuationDate: vd,
      amount: Number(latest.newAmount),
      difference: Number(latest.difference),
      journalEntryId: latest.journalEntryId,
    };
    snap.lastValuationAt = vd;
  }

  await prisma.portfolioCompany.update({
    where: { id: portfolioCompanyId },
    data: { financialKpis: snap },
  });
}

async function scanDuplicates() {
  const rows: any[] = await prisma.$queryRawUnsafe(`
    SELECT portfolioCompanyId, COUNT(*) AS c
    FROM portfolio_company_valuations
    GROUP BY portfolioCompanyId
    HAVING c > 1
  `);
  console.log("Companies with more than one valuation row (may or may not be duplicates):");
  for (const r of rows) {
    console.log(`  ${r.portfolioCompanyId}  (${r.c} rows)`);
  }
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--dry-run");
  const dryRun = process.argv.includes("--dry-run");

  if (args[0] === "--scan") {
    await scanDuplicates();
    return;
  }

  const portfolioCompanyId = args[0];
  if (!portfolioCompanyId) {
    console.error(
      "Usage: npx ts-node scripts/dedupe-valuation-journal-entries.ts <portfolioCompanyId> [--dry-run]\n" +
        "       npx ts-node scripts/dedupe-valuation-journal-entries.ts --scan"
    );
    process.exit(1);
  }

  const all: any[] = await prisma.$queryRawUnsafe(
    `SELECT id, portfolioCompanyId, previousAmount, newAmount, difference, valuationDate, notes, journalEntryId, createdAt
     FROM portfolio_company_valuations
     WHERE portfolioCompanyId = ?
     ORDER BY createdAt ASC`,
    portfolioCompanyId
  );

  const byFp = new Map<string, any[]>();
  for (const row of all) {
    const fp = fingerprint(row);
    if (!byFp.has(fp)) byFp.set(fp, []);
    byFp.get(fp)!.push(row);
  }

  const toRemove: any[] = [];
  for (const [, group] of byFp) {
    if (group.length < 2) continue;
    group.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const [, ...older] = group;
    toRemove.push(...older);
  }

  if (toRemove.length === 0) {
    console.log("No duplicate valuation groups (same date/amounts/notes) found for this company.");
    return;
  }

  const jeIds = [...new Set(toRemove.map((r) => r.journalEntryId).filter(Boolean) as string[])];
  console.log(
    dryRun ? "[dry-run] Would remove valuation rows:" : "Removing valuation rows:",
    toRemove.map((r) => r.id).join(", ")
  );
  console.log(
    dryRun ? "[dry-run] Would delete journal entries (from removed rows):" : "Deleting journal entries (from removed rows):",
    jeIds.join(", ")
  );

  if (dryRun) {
    const company = await prisma.portfolioCompany.findUnique({
      where: { id: portfolioCompanyId },
      select: { name: true },
    });
    const descs = company?.name ? valuationJournalDescriptionsForCompanyName(company.name) : [];
    if (descs.length > 0) {
      const linked: { journalEntryId: string }[] = await prisma.$queryRawUnsafe(
        `SELECT journalEntryId FROM portfolio_company_valuations
         WHERE portfolioCompanyId = ? AND journalEntryId IS NOT NULL`,
        portfolioCompanyId
      );
      const keepJe = new Set(linked.map((r) => String(r.journalEntryId)));
      const ph = descs.map(() => "?").join(",");
      const orphans: { id: string }[] = await prisma.$queryRawUnsafe(
        `SELECT id FROM journal_entries WHERE description IN (${ph})`,
        ...descs
      );
      const orphanIds = orphans.map((o) => o.id).filter((id) => !keepJe.has(id));
      if (orphanIds.length > 0) {
        console.log(
          "[dry-run] Would also delete orphan valuation JEs (not linked to any valuation row):",
          orphanIds.join(", ")
        );
      }
    }
    return;
  }

  const removeIds = toRemove.map((r) => r.id);
  const placeholders = removeIds.map(() => "?").join(",");
  await prisma.$executeRawUnsafe(
    `DELETE FROM portfolio_company_valuations WHERE id IN (${placeholders})`,
    ...removeIds
  );

  for (const jeId of jeIds) {
    try {
      await prisma.journalEntry.delete({ where: { id: jeId } });
      console.log(`Deleted journal entry ${jeId}`);
    } catch (e: any) {
      console.error(`Failed to delete JE ${jeId}:`, e?.message || e);
    }
  }

  const company = await prisma.portfolioCompany.findUnique({
    where: { id: portfolioCompanyId },
    select: { name: true },
  });
  const descs = company?.name ? valuationJournalDescriptionsForCompanyName(company.name) : [];
  if (descs.length > 0) {
    const linked: { journalEntryId: string }[] = await prisma.$queryRawUnsafe(
      `SELECT journalEntryId FROM portfolio_company_valuations
       WHERE portfolioCompanyId = ? AND journalEntryId IS NOT NULL`,
      portfolioCompanyId
    );
    const keepJe = new Set(linked.map((r) => String(r.journalEntryId)));
    const ph = descs.map(() => "?").join(",");
    const orphans: { id: string }[] = await prisma.$queryRawUnsafe(
      `SELECT id FROM journal_entries WHERE description IN (${ph})`,
      ...descs
    );
    for (const id of orphans.map((o) => o.id).filter((jid) => !keepJe.has(jid))) {
      try {
        await prisma.journalEntry.delete({ where: { id } });
        console.log(`Deleted orphan valuation JE ${id}`);
      } catch (e: any) {
        console.error(`Failed to delete orphan JE ${id}:`, e?.message || e);
      }
    }
  }

  const kept: any[] = await prisma.$queryRawUnsafe(
    `SELECT journalEntryId FROM portfolio_company_valuations WHERE portfolioCompanyId = ?`,
    portfolioCompanyId
  );
  const keepSet = new Set(kept.map((r) => String(r.journalEntryId)).filter(Boolean));
  await pruneFinancialKpisValuationHistory(portfolioCompanyId, keepSet);

  console.log("Done. Kept one valuation per duplicate group (newest). Pruned financialKpis valuationHistory.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
