/**
 * Multi-entity GL tagging for Group Consolidation reporting.
 * Adds `forecast_entity_id` (nullable FK -> forecast_entities) and `is_elimination_entry`
 * (manual inter-entity elimination flag) to `journal_entries`, then backfills every existing
 * row onto the default ForecastEntity so nothing is left orphaned.
 *
 * Idempotent — safe to re-run (column/constraint/index existence checked before each DDL step).
 * Pure ADD COLUMN (nullable) + a plain UPDATE backfill — no table rebuild, no data loss.
 * NEVER uses `prisma migrate` / `prisma db push`.
 *
 * Run: npm run db:migrate:journal-entry-forecast-entity
 *   or: npx ts-node --transpile-only -r dotenv/config scripts/run-journal-entry-forecast-entity-migration.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TABLE = "journal_entries";
const FK_NAME = "journal_entries_forecast_entity_id_fkey";
const IDX_NAME = "journal_entries_forecast_entity_id_idx";

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function constraintExists(table: string, constraintName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
    table,
    constraintName
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function indexExists(table: string, indexName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    table,
    indexName
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

/** Prefer an admin-role user for attribution on the system-created default entity; fall back to any user. */
async function findAdminUserId(): Promise<string> {
  const admin = await prisma.user.findFirst({
    where: { role: { name: { in: ["admin", "Admin", "System Administrator"] } } },
    select: { id: true },
  });
  if (admin) return admin.id;
  const any = await prisma.user.findFirst({ select: { id: true } });
  if (!any) throw new Error("No users in database — cannot create default ForecastEntity");
  return any.id;
}

async function main() {
  // ── 1) forecast_entity_id column ────────────────────────────────────────────
  if (!(await columnExists(TABLE, "forecast_entity_id"))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`${TABLE}\` ADD COLUMN \`forecast_entity_id\` VARCHAR(191) NULL`
    );
    console.log(`[ok] ${TABLE}.forecast_entity_id column added`);
  } else {
    console.log(`[skip] ${TABLE}.forecast_entity_id already exists`);
  }

  // ── 2) FK -> forecast_entities(id), ON DELETE SET NULL ──────────────────────
  // Never let a bad entity deletion cascade into deleting real journal entries.
  if (!(await constraintExists(TABLE, FK_NAME))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`${TABLE}\`
       ADD CONSTRAINT \`${FK_NAME}\`
       FOREIGN KEY (\`forecast_entity_id\`) REFERENCES \`forecast_entities\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE`
    );
    console.log(`[ok] ${FK_NAME} added`);
  } else {
    console.log(`[skip] ${FK_NAME} already exists`);
  }

  // ── 3) index on forecast_entity_id ──────────────────────────────────────────
  if (!(await indexExists(TABLE, IDX_NAME))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`${TABLE}\` ADD INDEX \`${IDX_NAME}\` (\`forecast_entity_id\`)`
    );
    console.log(`[ok] ${IDX_NAME} added`);
  } else {
    console.log(`[skip] ${IDX_NAME} already exists`);
  }

  // ── 4) is_elimination_entry column ──────────────────────────────────────────
  if (!(await columnExists(TABLE, "is_elimination_entry"))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`${TABLE}\` ADD COLUMN \`is_elimination_entry\` TINYINT(1) NOT NULL DEFAULT 0`
    );
    console.log(`[ok] ${TABLE}.is_elimination_entry column added`);
  } else {
    console.log(`[skip] ${TABLE}.is_elimination_entry already exists`);
  }

  // ── 5) Ensure a default ForecastEntity exists ───────────────────────────────
  let defaultEntity = await prisma.forecastEntity.findFirst({ where: { isDefault: true } });
  if (!defaultEntity) {
    const profile = await prisma.companyProfile.findFirst({ select: { id: true, legalName: true } });
    const name = profile?.legalName?.trim() || "Matanho Capital Partners";
    const adminUserId = await findAdminUserId();
    defaultEntity = await prisma.forecastEntity.create({
      data: {
        name,
        type: "INTERNAL_SUBSIDIARY",
        isDefault: true,
        isActive: true,
        companyProfileId: profile?.id ?? null,
        createdById: adminUserId,
      },
    });
    console.log(`[ok] created default ForecastEntity "${name}" (${defaultEntity.id})`);
  } else {
    console.log(`[skip] default ForecastEntity already exists: "${defaultEntity.name}" (${defaultEntity.id})`);
  }

  // ── 6) Backfill: every existing journal entry ends up tagged, none orphaned ─
  const before = await prisma.journalEntry.count();
  const untaggedBefore = await prisma.journalEntry.count({ where: { forecastEntityId: null } });

  if (untaggedBefore > 0) {
    const result = await prisma.journalEntry.updateMany({
      where: { forecastEntityId: null },
      data: { forecastEntityId: defaultEntity.id },
    });
    console.log(`[ok] backfilled forecast_entity_id on ${result.count} journal_entries -> ${defaultEntity.id}`);
  } else {
    console.log(`[skip] no untagged journal_entries to backfill`);
  }

  const after = await prisma.journalEntry.count();
  const untaggedAfter = await prisma.journalEntry.count({ where: { forecastEntityId: null } });

  console.log(
    `[verify] journal_entries count before=${before} after=${after} (row count unchanged: ${before === after})`
  );
  console.log(`[verify] untagged journal_entries before=${untaggedBefore} after=${untaggedAfter}`);
  if (after !== before) {
    throw new Error(`Row count changed during migration (before=${before}, after=${after}) — investigate before relying on this migration.`);
  }
  if (untaggedAfter > 0) {
    throw new Error(`${untaggedAfter} journal_entries are still untagged after backfill — investigate.`);
  }

  console.log("Journal entry forecast-entity migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
