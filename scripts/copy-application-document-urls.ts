/**
 * Copy `fileUrl` values from one Application's documents to another Application's documents.
 *
 * Source:      Benson Tech
 * Destination: AC Motors
 *
 * Strategy:
 *   - Match documents by `documentType` (e.g. CR14 → CR14, BANK_LETTER → BANK_LETTER).
 *   - When the destination has multiple rows for the same documentType and the source
 *     has only one, every destination row receives the same `fileUrl`.
 *   - When the source has multiple rows for the same documentType, they are mapped in
 *     order to the destination rows of the same type; extras on either side are
 *     reported as unmatched.
 *   - Also mirrors `fileName` and `fileSize` so the UI shows the right metadata.
 *   - Dry-run by default. Pass `--apply` to actually write.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SOURCE_NAME = "Benson Tech";
const DEST_NAME = "AC Motors";

function norm(s: string | null | undefined): string {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

async function findApplicationByBusinessName(name: string) {
  const target = norm(name);
  const matches = await prisma.application.findMany({
    where: {
      businessName: { contains: name.split(" ")[0] },
    },
    select: { id: true, businessName: true, applicantName: true, dealReference: true },
  });
  const exact = matches.filter((m) => norm(m.businessName) === target);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) {
    throw new Error(
      `Multiple applications matched "${name}" exactly: ${exact.map((e) => `${e.id} (${e.businessName})`).join(", ")}`
    );
  }
  // Fall back to fuzzy contains match if no exact hit
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    throw new Error(`No application found matching "${name}"`);
  }
  throw new Error(
    `Multiple candidate applications for "${name}":\n  ${matches
      .map((m) => `${m.id} — ${m.businessName} (applicant: ${m.applicantName})`)
      .join("\n  ")}`
  );
}

async function main() {
  const apply = process.argv.includes("--apply");

  console.log(`Looking up source application: "${SOURCE_NAME}"`);
  const source = await findApplicationByBusinessName(SOURCE_NAME);
  console.log(`  → ${source.id}  ${source.businessName}  (${source.dealReference || "no deal ref"})`);

  console.log(`Looking up destination application: "${DEST_NAME}"`);
  const dest = await findApplicationByBusinessName(DEST_NAME);
  console.log(`  → ${dest.id}  ${dest.businessName}  (${dest.dealReference || "no deal ref"})`);

  const [sourceDocs, destDocs] = await Promise.all([
    prisma.applicationDocument.findMany({
      where: { applicationId: source.id },
      orderBy: [{ documentType: "asc" }, { uploadedAt: "asc" }],
    }),
    prisma.applicationDocument.findMany({
      where: { applicationId: dest.id },
      orderBy: [{ documentType: "asc" }, { uploadedAt: "asc" }],
    }),
  ]);

  console.log(`\nSource documents (${sourceDocs.length}):`);
  for (const d of sourceDocs) {
    console.log(
      `  - [${d.documentType}] ${d.fileName}  size=${d.fileSize}  url=${d.fileUrl}`
    );
  }
  console.log(`\nDestination documents (${destDocs.length}):`);
  for (const d of destDocs) {
    console.log(
      `  - [${d.documentType}] ${d.fileName}  size=${d.fileSize}  url=${d.fileUrl}`
    );
  }

  const byType = new Map<string, typeof sourceDocs>();
  for (const s of sourceDocs) {
    const k = String(s.documentType || "").toUpperCase();
    if (!byType.has(k)) byType.set(k, []);
    byType.get(k)!.push(s);
  }

  const plan: Array<{
    destId: string;
    destType: string;
    destFileName: string;
    destFileUrl: string;
    newFileName: string;
    newFileUrl: string;
    newFileSize: number;
  }> = [];
  const unmatchedDestTypes: string[] = [];
  const consumedIndex = new Map<string, number>();

  for (const d of destDocs) {
    const k = String(d.documentType || "").toUpperCase();
    const bucket = byType.get(k);
    if (!bucket || bucket.length === 0) {
      unmatchedDestTypes.push(d.documentType);
      continue;
    }
    const idx = consumedIndex.get(k) ?? 0;
    const src = bucket[idx] ?? bucket[bucket.length - 1];
    consumedIndex.set(k, Math.min(idx + 1, bucket.length - 1) + (idx + 1 >= bucket.length ? 0 : 0));
    plan.push({
      destId: d.id,
      destType: d.documentType,
      destFileName: d.fileName,
      destFileUrl: d.fileUrl,
      newFileName: src.fileName,
      newFileUrl: src.fileUrl,
      newFileSize: src.fileSize,
    });
  }

  const unusedSource: string[] = [];
  for (const [k, bucket] of byType) {
    const used = consumedIndex.get(k) ?? 0;
    if (used < bucket.length) {
      for (let i = used; i < bucket.length; i++) {
        unusedSource.push(`${bucket[i].documentType} → ${bucket[i].fileName}`);
      }
    }
  }

  console.log(`\nPlan (${plan.length} rows to update):`);
  for (const row of plan) {
    console.log(
      `  • dest[${row.destId}] type=${row.destType}\n    old: ${row.destFileName} (${row.destFileUrl})\n    new: ${row.newFileName} (${row.newFileUrl})`
    );
  }
  if (unmatchedDestTypes.length) {
    console.log(
      `\nDestination doc types with no source match (left untouched): ${unmatchedDestTypes.join(", ")}`
    );
  }
  if (unusedSource.length) {
    console.log(`\nSource docs not assigned anywhere (no matching destType):`);
    for (const s of unusedSource) console.log(`  · ${s}`);
  }

  if (!apply) {
    console.log("\n(dry-run) Re-run with --apply to write these changes to the database.");
    return;
  }

  console.log("\nApplying updates...");
  await prisma.$transaction(
    plan.map((row) =>
      prisma.applicationDocument.update({
        where: { id: row.destId },
        data: {
          fileName: row.newFileName,
          fileUrl: row.newFileUrl,
          fileSize: row.newFileSize,
        },
      })
    )
  );
  console.log(`✅ Updated ${plan.length} destination document(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
