/**
 * FP&A data-mapping CRUD: notes column + unique (model_id, source_field_id).
 * Idempotent. Run: npm run db:migrate:fpa-data-mapping-crud
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

async function main() {
  const db = (await prisma.$queryRawUnsafe<Array<{ d: string }>>(`SELECT DATABASE() AS d`))[0]?.d;
  console.log(`[fpa-data-mapping-crud] database=${db}`);

  if (!(await columnExists("planning_line_item_mappings", "notes"))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`planning_line_item_mappings\` ADD COLUMN \`notes\` TEXT NULL`
    );
    console.log("[ok] planning_line_item_mappings.notes");
  } else {
    console.log("[skip] planning_line_item_mappings.notes");
  }

  if (!(await indexExists("planning_line_item_mappings", "planning_li_mappings_model_field_key"))) {
    // Deduplicate before unique index (keep newest)
    await prisma.$executeRawUnsafe(`
      DELETE m1 FROM planning_line_item_mappings m1
      INNER JOIN planning_line_item_mappings m2
        ON m1.model_id = m2.model_id
       AND m1.source_field_id = m2.source_field_id
       AND m1.created_at < m2.created_at
    `);
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`planning_line_item_mappings\`
      ADD UNIQUE INDEX \`planning_li_mappings_model_field_key\` (\`model_id\`, \`source_field_id\`)
    `);
    console.log("[ok] unique planning_li_mappings_model_field_key");
  } else {
    console.log("[skip] unique planning_li_mappings_model_field_key");
  }

  console.log("[fpa-data-mapping-crud] done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
