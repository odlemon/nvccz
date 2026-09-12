/**
 * FP&A: dedupe planning_cells + unique coord index (version/scenario/line/period/dim_key).
 * Idempotent. Run: npm run db:migrate:fpa-cell-canonical
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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

async function tableExists(table: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    table
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function main() {
  const db = (await prisma.$queryRawUnsafe<Array<{ d: string }>>(`SELECT DATABASE() AS d`))[0]?.d;
  console.log(`[fpa-cell-canonical] database=${db}`);

  if (!(await columnExists("planning_cells", "dim_key"))) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`planning_cells\`
      ADD COLUMN \`dim_key\` VARCHAR(96)
        GENERATED ALWAYS AS (
          CONCAT(
            IFNULL(\`entity_id\`, ''), '|',
            IFNULL(\`department_id\`, ''), '|',
            IFNULL(\`cost_centre_id\`, '')
          )
        ) STORED
    `);
    console.log("[ok] planning_cells.dim_key");
  } else {
    // Shrink if oversized (unique index needs key ≤ 3072 bytes under utf8mb4)
    const col = await prisma.$queryRawUnsafe<Array<{ COLUMN_TYPE: string }>>(
      `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'planning_cells' AND COLUMN_NAME = 'dim_key'`
    );
    if (col[0]?.COLUMN_TYPE && !/varchar\(96\)/i.test(col[0].COLUMN_TYPE)) {
      // MySQL cannot easily MODIFY generated column length — drop unique if present then recreate column
      if (await indexExists("planning_cells", "planning_cells_coord_key")) {
        await prisma.$executeRawUnsafe(`ALTER TABLE \`planning_cells\` DROP INDEX \`planning_cells_coord_key\``);
        console.log("[ok] dropped planning_cells_coord_key for dim_key resize");
      }
      await prisma.$executeRawUnsafe(`ALTER TABLE \`planning_cells\` DROP COLUMN \`dim_key\``);
      await prisma.$executeRawUnsafe(`
        ALTER TABLE \`planning_cells\`
        ADD COLUMN \`dim_key\` VARCHAR(96)
          GENERATED ALWAYS AS (
            CONCAT(
              IFNULL(\`entity_id\`, ''), '|',
              IFNULL(\`department_id\`, ''), '|',
              IFNULL(\`cost_centre_id\`, '')
            )
          ) STORED
      `);
      console.log("[ok] resized planning_cells.dim_key to VARCHAR(96)");
    } else {
      console.log("[skip] planning_cells.dim_key");
    }
  }

  // Set-based dedupe: keep best row per coord (non-null value, then newest updated_at, then id)
  console.log("[..] counting duplicate groups…");
  const dupCountRows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(`
    SELECT COUNT(*) AS c FROM (
      SELECT 1
      FROM planning_cells
      GROUP BY version_id, scenario_id, line_item_id, period_date, dim_key
      HAVING COUNT(*) > 1
    ) t
  `);
  const dupGroups = Number(dupCountRows[0]?.c ?? 0);
  console.log(`[..] duplicate groups=${dupGroups}`);

  if (dupGroups > 0) {
    // Prefer valued rows; reassign FKs in bulk then delete losers
    await prisma.$executeRawUnsafe(`
      CREATE TEMPORARY TABLE IF NOT EXISTS _fpa_cell_keepers AS
      SELECT keep_id FROM (
        SELECT
          SUBSTRING_INDEX(
            GROUP_CONCAT(id ORDER BY (value IS NOT NULL) DESC, updated_at DESC, id DESC),
            ',', 1
          ) AS keep_id,
          version_id, scenario_id, line_item_id, period_date, dim_key
        FROM planning_cells
        GROUP BY version_id, scenario_id, line_item_id, period_date, dim_key
        HAVING COUNT(*) > 1
      ) x
    `);

    if (await tableExists("planning_audit_logs")) {
      await prisma.$executeRawUnsafe(`
        UPDATE planning_audit_logs a
        INNER JOIN planning_cells loser
          ON a.cell_id = loser.id
        INNER JOIN (
          SELECT
            SUBSTRING_INDEX(
              GROUP_CONCAT(id ORDER BY (value IS NOT NULL) DESC, updated_at DESC, id DESC),
              ',', 1
            ) AS keep_id,
            version_id, scenario_id, line_item_id, period_date, dim_key
          FROM planning_cells
          GROUP BY version_id, scenario_id, line_item_id, period_date, dim_key
          HAVING COUNT(*) > 1
        ) k
          ON loser.version_id = k.version_id
         AND loser.scenario_id = k.scenario_id
         AND loser.line_item_id = k.line_item_id
         AND loser.period_date = k.period_date
         AND loser.dim_key = k.dim_key
        SET a.cell_id = k.keep_id
        WHERE loser.id <> k.keep_id
      `);
      console.log("[ok] reassigned audit cell_id FKs");
    }

    if (await tableExists("planning_comments")) {
      await prisma.$executeRawUnsafe(`
        UPDATE planning_comments c
        INNER JOIN planning_cells loser
          ON c.cell_id = loser.id
        INNER JOIN (
          SELECT
            SUBSTRING_INDEX(
              GROUP_CONCAT(id ORDER BY (value IS NOT NULL) DESC, updated_at DESC, id DESC),
              ',', 1
            ) AS keep_id,
            version_id, scenario_id, line_item_id, period_date, dim_key
          FROM planning_cells
          GROUP BY version_id, scenario_id, line_item_id, period_date, dim_key
          HAVING COUNT(*) > 1
        ) k
          ON loser.version_id = k.version_id
         AND loser.scenario_id = k.scenario_id
         AND loser.line_item_id = k.line_item_id
         AND loser.period_date = k.period_date
         AND loser.dim_key = k.dim_key
        SET c.cell_id = k.keep_id
        WHERE loser.id <> k.keep_id
      `);
      console.log("[ok] reassigned comment cell_id FKs");
    }

    const delResult = await prisma.$executeRawUnsafe(`
      DELETE loser FROM planning_cells loser
      INNER JOIN (
        SELECT
          SUBSTRING_INDEX(
            GROUP_CONCAT(id ORDER BY (value IS NOT NULL) DESC, updated_at DESC, id DESC),
            ',', 1
          ) AS keep_id,
          version_id, scenario_id, line_item_id, period_date, dim_key
        FROM planning_cells
        GROUP BY version_id, scenario_id, line_item_id, period_date, dim_key
        HAVING COUNT(*) > 1
      ) k
        ON loser.version_id = k.version_id
       AND loser.scenario_id = k.scenario_id
       AND loser.line_item_id = k.line_item_id
       AND loser.period_date = k.period_date
       AND loser.dim_key = k.dim_key
      WHERE loser.id <> k.keep_id
    `);
    console.log(`[ok] deduped deleted_rows≈${delResult}`);
    await prisma.$executeRawUnsafe(`DROP TEMPORARY TABLE IF EXISTS _fpa_cell_keepers`);
  } else {
    console.log("[skip] no duplicate cells");
  }

  if (!(await indexExists("planning_cells", "planning_cells_coord_key"))) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`planning_cells\`
      ADD UNIQUE INDEX \`planning_cells_coord_key\`
        (\`version_id\`, \`scenario_id\`, \`line_item_id\`, \`period_date\`, \`dim_key\`)
    `);
    console.log("[ok] unique planning_cells_coord_key");
  } else {
    console.log("[skip] unique planning_cells_coord_key");
  }

  console.log("[fpa-cell-canonical] done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
