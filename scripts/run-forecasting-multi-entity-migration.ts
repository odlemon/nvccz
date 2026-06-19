/**
 * Forecasting Engine — Multi-Entity support (MySQL). Idempotent.
 *
 * What this script does:
 *  1. Creates `forecast_entities` and `entity_chart_of_accounts` tables.
 *  2. Seeds a default ForecastEntity from the singleton CompanyProfile.
 *  3. Clones the global ChartOfAccounts into EntityChartOfAccount for the default entity
 *     (two-pass: insert rows with sourceAccountId, then wire parentId via source-id lookup).
 *  4. Backfills forecast_scenarios.entity_id and forecast_cells.entity_id to default entity id.
 *  5. Remaps forecast_cells.account_id from global ChartOfAccounts ids to cloned EntityChartOfAccount ids.
 *  6. Recomputes natural_key_hash for all existing cells (entity_id + account_id changed).
 *
 * Run: npm run db:migrate:forecasting-multi-entity
 */
import "dotenv/config";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

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

function buildCellNaturalKeyHash(coords: {
  scenarioId: string;
  periodKey: string;
  accountId: string;
  entityId: string;
  fundId?: string | null;
  portfolioCompanyId?: string | null;
  analyticalTag?: string | null;
}): string {
  const norm = (v: string | null | undefined) => (v ?? "").trim();
  const canonical = [
    coords.scenarioId,
    coords.periodKey,
    coords.accountId,
    coords.entityId,
    norm(coords.fundId),
    norm(coords.portfolioCompanyId),
    norm(coords.analyticalTag)
  ].join("|");
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

async function main() {
  console.log("=== Forecasting Multi-Entity Migration ===\n");

  // ─── 1. Create forecast_entities table ───────────────────────────────────────
  if (!(await tableExists("forecast_entities"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`forecast_entities\` (
        \`id\`                  VARCHAR(191)  NOT NULL,
        \`name\`                VARCHAR(512)  NOT NULL,
        \`entity_type\`         VARCHAR(32)   NOT NULL,
        \`base_currency\`       VARCHAR(3)    NULL,
        \`registration_number\` VARCHAR(255)  NULL,
        \`is_active\`           TINYINT(1)    NOT NULL DEFAULT 1,
        \`is_default\`          TINYINT(1)    NOT NULL DEFAULT 0,
        \`company_profile_id\`  VARCHAR(191)  NULL,
        \`portfolio_company_id\` VARCHAR(191) NULL,
        \`created_by_id\`       VARCHAR(191)  NOT NULL,
        \`created_at\`          DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`          DATETIME(3)   NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`forecast_entities_is_default_idx\` (\`is_default\`),
        INDEX \`forecast_entities_type_active_idx\` (\`entity_type\`, \`is_active\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created forecast_entities");
  } else {
    console.log("[skip] forecast_entities already exists");
  }

  // ─── 2. Create entity_chart_of_accounts table ─────────────────────────────────
  if (!(await tableExists("entity_chart_of_accounts"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`entity_chart_of_accounts\` (
        \`id\`                  VARCHAR(191)  NOT NULL,
        \`entity_id\`           VARCHAR(191)  NOT NULL,
        \`account_no\`          VARCHAR(64)   NOT NULL,
        \`account_name\`        VARCHAR(512)  NOT NULL,
        \`account_type\`        VARCHAR(128)  NOT NULL,
        \`natural_balance\`     VARCHAR(8)    NOT NULL DEFAULT 'DEBIT',
        \`financial_statement\` VARCHAR(255)  NOT NULL,
        \`notes\`               TEXT          NULL,
        \`parent_id\`           VARCHAR(191)  NULL,
        \`is_active\`           TINYINT(1)    NOT NULL DEFAULT 1,
        \`source_account_id\`   VARCHAR(191)  NULL,
        \`created_at\`          DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`          DATETIME(3)   NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`entity_coa_entity_account_no_key\` (\`entity_id\`, \`account_no\`),
        INDEX \`entity_coa_entity_type_idx\` (\`entity_id\`, \`account_type\`),
        INDEX \`entity_coa_entity_active_idx\` (\`entity_id\`, \`is_active\`),
        INDEX \`entity_coa_source_account_idx\` (\`source_account_id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created entity_chart_of_accounts");
  } else {
    console.log("[skip] entity_chart_of_accounts already exists");
  }

  // ─── 3. Seed default ForecastEntity from singleton CompanyProfile ─────────────
  const defaultEntityRows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM forecast_entities WHERE is_default = 1 LIMIT 1`
  );
  let defaultEntityId: string;

  if (defaultEntityRows.length > 0) {
    defaultEntityId = defaultEntityRows[0].id;
    console.log("[skip] default entity already exists:", defaultEntityId);
  } else {
    const companyRows = await prisma.$queryRawUnsafe<
      Array<{ id: string; legal_name: string | null; base_currency?: string | null }>
    >(`SELECT id, legal_name FROM company_profile LIMIT 1`);

    if (!companyRows.length) {
      throw new Error("No CompanyProfile found — run company setup first.");
    }
    const company = companyRows[0];

    const userRows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM users ORDER BY createdAt ASC LIMIT 1`
    );
    if (!userRows.length) throw new Error("No users found.");
    const createdById = userRows[0].id;

    const newId = generateCuid();
    const now = new Date();
    await prisma.$executeRawUnsafe(
      `INSERT INTO forecast_entities
        (id, name, entity_type, is_active, is_default, company_profile_id, created_by_id, created_at, updated_at)
       VALUES (?, ?, 'INTERNAL_SUBSIDIARY', 1, 1, ?, ?, ?, ?)`,
      newId,
      company.legal_name ?? "Default Entity",
      company.id,
      createdById,
      now,
      now
    );
    defaultEntityId = newId;
    console.log("[ok] seeded default entity:", defaultEntityId);
  }

  // ─── 4. Clone global ChartOfAccounts for default entity (two-pass) ────────────
  const existingClones = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM entity_chart_of_accounts WHERE entity_id = ?`,
    defaultEntityId
  );
  const cloneCount = Number(existingClones[0]?.c ?? 0);

  if (cloneCount > 0) {
    console.log(`[skip] entity COA already cloned (${cloneCount} rows)`);
  } else {
    // Note: chart_of_accounts uses camelCase column names (no @map in schema)
    const globalAccounts = await prisma.$queryRawUnsafe<
      Array<{
        id: string;
        accountNo: string;
        accountName: string;
        accountType: string;
        naturalBalance: string;
        financialStatement: string;
        notes: string | null;
        parentId: string | null;
        isActive: boolean | number;
      }>
    >(
      `SELECT id, accountNo, accountName, accountType, naturalBalance,
              financialStatement, notes, parentId, isActive
       FROM chart_of_accounts ORDER BY COALESCE(parentId, '') ASC, accountNo ASC`
    );

    // Pass 1 — insert all rows without parentId (resolve parentId in pass 2)
    const sourceToCloneId = new Map<string, string>();
    const now = new Date();
    for (const acct of globalAccounts) {
      const cloneId = generateCuid();
      sourceToCloneId.set(acct.id, cloneId);
      await prisma.$executeRawUnsafe(
        `INSERT INTO entity_chart_of_accounts
          (id, entity_id, account_no, account_name, account_type, natural_balance,
           financial_statement, notes, is_active, source_account_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        cloneId,
        defaultEntityId,
        acct.accountNo,
        acct.accountName,
        acct.accountType,
        acct.naturalBalance,
        acct.financialStatement,
        acct.notes ?? null,
        acct.isActive ? 1 : 0,
        acct.id,
        now,
        now
      );
    }

    // Pass 2 — wire parent_id using sourceToCloneId mapping
    for (const acct of globalAccounts) {
      if (!acct.parentId) continue;
      const cloneId = sourceToCloneId.get(acct.id);
      const cloneParentId = sourceToCloneId.get(acct.parentId);
      if (cloneId && cloneParentId) {
        await prisma.$executeRawUnsafe(
          `UPDATE entity_chart_of_accounts SET parent_id = ? WHERE id = ?`,
          cloneParentId,
          cloneId
        );
      }
    }

    console.log(`[ok] cloned ${globalAccounts.length} accounts for default entity`);
  }

  // ─── 5. Backfill forecast_scenarios.entity_id ─────────────────────────────────
  // The column already exists (was used for companyProfileId before); update all rows
  // where entity_id still holds the old CompanyProfile id (not a ForecastEntity id).
  const scenariosMismatched = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM forecast_scenarios
     WHERE entity_id NOT IN (SELECT id FROM forecast_entities)`
  );
  const mismatchedCount = Number(scenariosMismatched[0]?.c ?? 0);
  if (mismatchedCount > 0) {
    await prisma.$executeRawUnsafe(
      `UPDATE forecast_scenarios SET entity_id = ? WHERE entity_id NOT IN (SELECT id FROM forecast_entities)`,
      defaultEntityId
    );
    console.log(`[ok] backfilled ${mismatchedCount} forecast_scenarios.entity_id`);
  } else {
    console.log("[skip] forecast_scenarios.entity_id already up-to-date");
  }

  // ─── 6. Backfill forecast_cells.entity_id ─────────────────────────────────────
  const cellsMismatched = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM forecast_cells
     WHERE entity_id NOT IN (SELECT id FROM forecast_entities)`
  );
  const cellsMismatchedCount = Number(cellsMismatched[0]?.c ?? 0);
  if (cellsMismatchedCount > 0) {
    await prisma.$executeRawUnsafe(
      `UPDATE forecast_cells SET entity_id = ? WHERE entity_id NOT IN (SELECT id FROM forecast_entities)`,
      defaultEntityId
    );
    console.log(`[ok] backfilled ${cellsMismatchedCount} forecast_cells.entity_id`);
  } else {
    console.log("[skip] forecast_cells.entity_id already up-to-date");
  }

  // ─── 7. Remap forecast_cells.account_id to entity clone ids ──────────────────
  // Cells currently reference global chart_of_accounts ids.
  // After clone, they must reference entity_chart_of_accounts ids.
  const cellsWithGlobalAccountId = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM forecast_cells
     WHERE account_id IN (SELECT id FROM chart_of_accounts)`
  );
  const cellsToRemap = Number(cellsWithGlobalAccountId[0]?.c ?? 0);

  if (cellsToRemap === 0) {
    console.log("[skip] forecast_cells.account_id already remapped");
  } else {
    console.log(`[...] remapping ${cellsToRemap} forecast_cells.account_id ...`);
    // Bulk remap via JOIN update
    await prisma.$executeRawUnsafe(
      `UPDATE forecast_cells fc
         INNER JOIN entity_chart_of_accounts ecoa
           ON ecoa.source_account_id = fc.account_id
          AND ecoa.entity_id = fc.entity_id
       SET fc.account_id = ecoa.id`
    );
    console.log("[ok] remapped forecast_cells.account_id");
  }

  // ─── 8. Recompute natural_key_hash for all cells ─────────────────────────────
  // Hash components: scenarioId|periodKey|accountId|entityId|fundId|portfolioCompanyId|analyticalTag
  // Both entity_id and account_id may have changed above — recompute all.
  const allCells = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      scenario_id: string;
      period_key: string;
      account_id: string;
      entity_id: string;
      fund_id: string;
      portfolio_company_id: string;
      analytical_tag: string;
      natural_key_hash: string;
    }>
  >(`SELECT id, scenario_id, period_key, account_id, entity_id,
            fund_id, portfolio_company_id, analytical_tag, natural_key_hash
     FROM forecast_cells`);

  let hashUpdated = 0;
  for (const cell of allCells) {
    const newHash = buildCellNaturalKeyHash({
      scenarioId: cell.scenario_id,
      periodKey: cell.period_key,
      accountId: cell.account_id,
      entityId: cell.entity_id,
      fundId: cell.fund_id || null,
      portfolioCompanyId: cell.portfolio_company_id || null,
      analyticalTag: cell.analytical_tag || null
    });
    if (newHash !== cell.natural_key_hash) {
      await prisma.$executeRawUnsafe(
        `UPDATE forecast_cells SET natural_key_hash = ? WHERE id = ?`,
        newHash,
        cell.id
      );
      hashUpdated++;
    }
  }
  if (hashUpdated > 0) {
    console.log(`[ok] recomputed natural_key_hash for ${hashUpdated}/${allCells.length} cells`);
  } else {
    console.log(`[skip] all ${allCells.length} cell hashes already current`);
  }

  console.log("\n=== Migration complete ===");
}

// ─── Minimal CUID generator (no external dep) ────────────────────────────────
function generateCuid(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(10).toString("base64url").substring(0, 14);
  return `c${timestamp}${random}`;
}

main()
  .catch((e) => {
    console.error("[error]", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
