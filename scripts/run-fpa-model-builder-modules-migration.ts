/**
 * FP&A Model Builder — modules, line-item module link, publish metadata.
 * Idempotent. Run: npm run db:migrate:fpa-model-builder-modules
 */
import "dotenv/config";
import { randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function cuid(): string {
  return `c${Date.now().toString(36)}${randomBytes(8).toString("hex")}`.slice(0, 25);
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

async function tableExists(table: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    table
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function addColumnIfMissing(table: string, column: string, definition: string) {
  if (await columnExists(table, column)) {
    console.log(`[skip] ${table}.${column}`);
    return;
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  console.log(`[ok] ${table}.${column}`);
}

async function addIndexIfMissing(table: string, indexName: string, ddl: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    table,
    indexName
  );
  if (Number(rows[0]?.c ?? 0) > 0) {
    console.log(`[skip] index ${indexName}`);
    return;
  }
  await prisma.$executeRawUnsafe(ddl);
  console.log(`[ok] index ${indexName}`);
}

function titleFromCategory(cat: string): string {
  const c = String(cat || "GENERAL").trim() || "GENERAL";
  if (c.toUpperCase() === "GENERAL") return "General";
  return c
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function codeFromCategory(cat: string): string {
  return String(cat || "GENERAL")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 64) || "GENERAL";
}

async function backfillModules() {
  const models = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM planning_models`
  );
  for (const m of models) {
    const cats = await prisma.$queryRawUnsafe<Array<{ category: string }>>(
      `SELECT DISTINCT category FROM planning_line_items WHERE model_id = ?`,
      m.id
    );
    const categories = cats.length ? cats.map((c) => c.category || "GENERAL") : ["GENERAL"];
    const unique = [...new Set(categories.map((c) => String(c || "GENERAL")))];

    for (let i = 0; i < unique.length; i++) {
      const cat = unique[i];
      const code = codeFromCategory(cat);
      const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT id FROM planning_modules WHERE model_id = ? AND code = ? LIMIT 1`,
        m.id,
        code
      );
      let moduleId = existing[0]?.id;
      if (!moduleId) {
        moduleId = cuid();
        await prisma.$executeRawUnsafe(
          `INSERT INTO planning_modules (id, model_id, code, name, description, parent_id, calc_order, sort_order, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, 'DRAFT', NOW(3), NOW(3))`,
          moduleId,
          m.id,
          code,
          titleFromCategory(cat),
          i,
          i
        );
        console.log(`[ok] module ${code} for model ${m.id}`);
      }
      await prisma.$executeRawUnsafe(
        `UPDATE planning_line_items SET module_id = ? WHERE model_id = ? AND (category = ? OR (? = 'GENERAL' AND (category IS NULL OR category = ''))) AND module_id IS NULL`,
        moduleId,
        m.id,
        cat,
        code
      );
    }
  }
}

async function main() {
  if (!(await tableExists("planning_modules"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`planning_modules\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`model_id\` VARCHAR(191) NOT NULL,
        \`code\` VARCHAR(64) NOT NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`description\` TEXT NULL,
        \`parent_id\` VARCHAR(191) NULL,
        \`calc_order\` INT NOT NULL DEFAULT 0,
        \`sort_order\` INT NOT NULL DEFAULT 0,
        \`status\` VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`planning_modules_model_code_key\` (\`model_id\`, \`code\`),
        INDEX \`planning_modules_model_idx\` (\`model_id\`),
        INDEX \`planning_modules_parent_idx\` (\`parent_id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] planning_modules");
  } else {
    console.log("[skip] planning_modules");
  }

  await addColumnIfMissing("planning_line_items", "module_id", "VARCHAR(191) NULL");
  await addColumnIfMissing("planning_line_items", "currency_code", "VARCHAR(3) NULL");
  await addColumnIfMissing("planning_line_items", "decimal_places", "INT NULL");
  await addColumnIfMissing("planning_line_items", "updated_by", "VARCHAR(191) NULL");
  await addIndexIfMissing(
    "planning_line_items",
    "planning_line_items_module_idx",
    "CREATE INDEX `planning_line_items_module_idx` ON `planning_line_items` (`module_id`)"
  );

  await addColumnIfMissing("planning_models", "published_at", "DATETIME(3) NULL");
  await addColumnIfMissing("planning_models", "published_by", "VARCHAR(191) NULL");

  await backfillModules();
  console.log("FP&A model builder modules migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
