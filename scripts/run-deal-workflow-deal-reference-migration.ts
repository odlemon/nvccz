/**
 * UAT deal workflow: sequential dealReference, assigned analyst, screening score, counters table,
 * and stage renames (SCREENING_PENDING, SCREENING, ACTIVE_DD, REJECTED_SCREENING, AUTO_REJECTED).
 *
 * Run: npm run db:migrate:deal-workflow-deal-reference
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

import { DealReferenceService } from "../src/services/DealReferenceService";

const prisma = new PrismaClient();

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    name
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
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

async function main() {
  const counters = "deal_reference_counters";
  const apps = "applications";

  if (!(await tableExists(counters))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`${counters}\` (
        \`year\` INT NOT NULL,
        \`last_value\` BIGINT NOT NULL DEFAULT 0,
        PRIMARY KEY (\`year\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] deal_reference_counters");
  } else {
    console.log("[skip] deal_reference_counters exists");
  }

  if (!(await columnExists(apps, "dealReference"))) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`${apps}\` ADD COLUMN \`dealReference\` VARCHAR(191) NULL
    `);
    console.log("[ok] applications.dealReference");
  } else {
    console.log("[skip] applications.dealReference exists");
  }

  if (!(await columnExists(apps, "assignedAnalystId"))) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`${apps}\` ADD COLUMN \`assignedAnalystId\` VARCHAR(191) NULL
    `);
    console.log("[ok] applications.assignedAnalystId");
  } else {
    console.log("[skip] applications.assignedAnalystId exists");
  }

  if (!(await columnExists(apps, "screeningScore"))) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`${apps}\` ADD COLUMN \`screeningScore\` DECIMAL(5, 2) NULL
    `);
    console.log("[ok] applications.screeningScore");
  } else {
    console.log("[skip] applications.screeningScore exists");
  }

  // Stage renames (idempotent — only replaces legacy values)
  const stageMap: Array<[string, string]> = [
    ["PENDING_SHORTLISTING", "SCREENING_PENDING"],
    ["SHORTLISTED", "SCREENING"],
    ["UNDER_DUE_DILIGENCE", "ACTIVE_DD"],
    ["REJECTED", "REJECTED_SCREENING"]
  ];
  for (const [from, to] of stageMap) {
    const r = await prisma.$executeRawUnsafe(
      `UPDATE \`${apps}\` SET \`currentStage\` = ? WHERE \`currentStage\` = ?`,
      to,
      from
    );
    console.log(`[info] stage ${from} -> ${to}, affected rows (driver-dependent):`, r);
  }

  // Backfill dealReference for existing applications (sequential per calendar year)
  const missing = await prisma.application.findMany({
    where: { dealReference: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, createdAt: true }
  });

  const fallbackYear = new Date().getFullYear();
  for (const row of missing) {
    const y = row.createdAt ? new Date(row.createdAt).getFullYear() : fallbackYear;
    await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRawUnsafe<Array<{ last_value: bigint }>>(
        `SELECT \`last_value\` FROM \`${counters}\` WHERE \`year\` = ? FOR UPDATE`,
        y
      );
      let nextSeq: number;
      if (rows.length === 0) {
        await tx.$executeRawUnsafe(
          `INSERT INTO \`${counters}\` (\`year\`, \`last_value\`) VALUES (?, 1)`,
          y
        );
        nextSeq = 1;
      } else {
        nextSeq = Number(rows[0].last_value) + 1;
        await tx.$executeRawUnsafe(
          `UPDATE \`${counters}\` SET \`last_value\` = ? WHERE \`year\` = ?`,
          nextSeq,
          y
        );
      }
      const ref = DealReferenceService.formatRef(y, nextSeq);
      await tx.application.update({
        where: { id: row.id },
        data: { dealReference: ref }
      });
    });
  }
  if (missing.length) {
    console.log(`[ok] backfilled dealReference for ${missing.length} application(s)`);
  } else {
    console.log("[skip] no applications missing dealReference");
  }

  if (!(await indexExists(apps, "applications_dealReference_key"))) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`${apps}\` ADD UNIQUE INDEX \`applications_dealReference_key\` (\`dealReference\`)
    `);
    console.log("[ok] unique index dealReference");
  } else {
    console.log("[skip] unique index dealReference exists");
  }

  console.log("\nDeal workflow deal reference migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
