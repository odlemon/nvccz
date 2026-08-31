/**
 * DEV-only FP&A presentation reset.
 * Preserves shared users, departments, entities, CoA, journals, funds and company data.
 *
 * Run:
 *   $env:CONFIRM_FPA_DEV_RESET="1"
 *   npm run db:clear:fpa
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { assertDevDatabase } from "./lib/assert-dev-database";

const prisma = new PrismaClient();

/** Leaf → hub order (safe even if FKs appear later). */
const PLANNING_TABLES = [
  "planning_formula_dependencies",
  "planning_line_item_mappings",
  "planning_source_fields",
  "planning_data_sources",
  "planning_approvals",
  "planning_attachments",
  "planning_comments",
  "model_planning_cycle_owners",
  "planning_budget_cycle_owners",
  "model_planning_cycles",
  "planning_budget_cycles",
  "planning_tasks",
  "planning_workflows",
  "planning_variance_results",
  "planning_actuals_snapshots",
  "planning_cells",
  "planning_drivers",
  "planning_formulas",
  "planning_locks",
  "planning_ai_forecasts",
  "planning_import_jobs",
  "planning_export_jobs",
  "planning_audit_logs",
  "fpa_rolling_forecast_settings",
  "planning_line_items",
  "planning_modules",
  "planning_model_dimension_members",
  "planning_model_dimensions",
  "planning_model_entities",
  "planning_model_departments",
  "planning_model_accounts",
  "planning_versions",
  "planning_scenarios",
  "planning_models",
  "planning_dimension_members",
  "planning_dimensions",
];

async function tableExists(table: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    table
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function countRows(table: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM \`${table}\``
  );
  return Number(rows[0]?.c ?? 0);
}

function removeFileIfOwned(filePath: unknown, allowedRoot: string) {
  if (!filePath) return;
  const resolved = path.resolve(String(filePath));
  const root = path.resolve(allowedRoot);
  if (!resolved.startsWith(root + path.sep) || !fs.existsSync(resolved)) return;
  const stat = fs.statSync(resolved);
  if (stat.isFile()) {
    fs.unlinkSync(resolved);
    console.log(`[file] removed ${resolved}`);
  }
}

async function sharedMasterCounts() {
  const rows = await Promise.all([
    prisma.user.count(),
    prisma.department.count(),
    prisma.forecastEntity.count(),
    prisma.entityChartOfAccount.count(),
    prisma.chartOfAccounts.count(),
    prisma.journalEntry.count(),
  ]);
  return {
    users: rows[0],
    departments: rows[1],
    forecastEntities: rows[2],
    entityAccounts: rows[3],
    chartOfAccounts: rows[4],
    journalEntries: rows[5],
  };
}

async function main() {
  const database = await assertDevDatabase(prisma, "clear-fpa-presentation");
  if (database !== "nts" && database !== "arcus_dev") {
    throw new Error(`FP&A presentation reset is restricted to nts|arcus_dev; got ${database}`);
  }
  if (process.env.CONFIRM_FPA_DEV_RESET !== "1") {
    throw new Error(
      'Destructive DEV reset not confirmed. Set CONFIRM_FPA_DEV_RESET="1" and retry.'
    );
  }

  const mastersBefore = await sharedMasterCounts();
  const attachmentRoot = path.join(process.cwd(), "storage", "local-upload-mock", "fpa-attachments");
  const exportRoot = path.join(process.cwd(), "storage", "local-upload-mock", "fpa-exports");

  const [attachments, exportJobs, planningTasks, mpcCycles, budgetCycles] = await Promise.all([
    prisma.planningAttachment.findMany({ select: { storageKey: true } }),
    prisma.planningExportJob.findMany({ select: { payloadJson: true } }),
    prisma.planningTask.findMany({ select: { id: true } }),
    prisma.modelPlanningCycle.findMany({ select: { id: true } }),
    prisma.planningBudgetCycle.findMany({ select: { id: true } }),
  ]);
  const planningTaskIds = planningTasks.map((row) => row.id);
  const cycleIds = [...mpcCycles.map((row) => row.id), ...budgetCycles.map((row) => row.id)];
  const mirrored = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM tasks
     WHERE category = 'FPA_MODEL_PLANNING'
        OR JSON_UNQUOTE(JSON_EXTRACT(taskMetadata, '$.sourceModule')) = 'FPA_MODEL_PLANNING'`
  );
  const mirroredTaskIds = mirrored.map((row) => row.id);

  for (const row of attachments) removeFileIfOwned(row.storageKey, attachmentRoot);
  for (const row of exportJobs) {
    const payload = (row.payloadJson || {}) as any;
    removeFileIfOwned(payload.storagePath, exportRoot);
  }
  if (fs.existsSync(exportRoot)) {
    for (const name of fs.readdirSync(exportRoot)) {
      if (name.toLowerCase().endsWith(".xlsx")) {
        removeFileIfOwned(path.join(exportRoot, name), exportRoot);
      }
    }
  }

  if (mirroredTaskIds.length) {
    await prisma.activityLog.deleteMany({ where: { taskId: { in: mirroredTaskIds } } });
  }
  await prisma.notification.deleteMany({
    where: {
      OR: [
        { relatedEntity: { in: ["PlanningBudgetCycle", "PlanningTask", "ModelPlanningCycle"] } },
        ...(cycleIds.length ? [{ relatedEntityId: { in: cycleIds } }] : []),
        ...(planningTaskIds.length ? [{ relatedEntityId: { in: planningTaskIds } }] : []),
        ...(mirroredTaskIds.length
          ? [{ relatedEntity: "Task", relatedEntityId: { in: mirroredTaskIds } }]
          : []),
      ],
    },
  });
  if (mirroredTaskIds.length) {
    await prisma.task.deleteMany({ where: { id: { in: mirroredTaskIds } } });
  }

  await prisma.$executeRawUnsafe(`SET FOREIGN_KEY_CHECKS=0`);
  let wiped = 0;
  try {
    for (const table of PLANNING_TABLES) {
      if (!(await tableExists(table))) {
        console.log(`[skip] missing ${table}`);
        continue;
      }
      const before = await countRows(table);
      await prisma.$executeRawUnsafe(`DELETE FROM \`${table}\``);
      console.log(`[ok] ${table}: ${before} -> 0`);
      wiped += before;
    }
  } finally {
    await prisma.$executeRawUnsafe(`SET FOREIGN_KEY_CHECKS=1`);
  }

  if (await tableExists("fpa_settings")) {
    await prisma.$executeRawUnsafe(`DELETE FROM fpa_settings`);
    await prisma.$executeRawUnsafe(`
      INSERT INTO fpa_settings (id, variance_json, workflow_json, updated_at)
      VALUES (
        'default',
        JSON_OBJECT(
          'commentaryThresholdPct', 5,
          'enforceCommentary', TRUE,
          'blockSubmitWithoutCommentary', FALSE
        ),
        JSON_OBJECT(
          'path', 'LINEAR',
          'requireCfoSignature', TRUE,
          'allowRerunAfterReturn', TRUE
        ),
        NOW(3)
      )
    `);
  }
  if (await tableExists("fpa_sync_sources")) {
    await prisma.$executeRawUnsafe(`DELETE FROM fpa_sync_sources`);
    await prisma.$executeRawUnsafe(`
      INSERT INTO fpa_sync_sources (id, label, status, last_sync_at, last_error, config_json, updated_by, updated_at)
      VALUES ('netsuite', 'NetSuite', 'DISCONNECTED', NULL, NULL, NULL, NULL, NOW(3))
    `);
  }

  const mastersAfter = await sharedMasterCounts();
  if (JSON.stringify(mastersAfter) !== JSON.stringify(mastersBefore)) {
    throw new Error(
      `Shared master counts changed unexpectedly: before=${JSON.stringify(
        mastersBefore
      )} after=${JSON.stringify(mastersAfter)}`
    );
  }
  const manifestPath = path.join(process.cwd(), "storage", "fpa-presentation-reset-manifest.json");
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(
      {
        database: "nts",
        resetAt: new Date().toISOString(),
        rowsDeleted: wiped,
        sharedMasterCounts: mastersAfter,
      },
      null,
      2
    )
  );
  console.log(`[clear-fpa] shared masters preserved=${JSON.stringify(mastersAfter)}`);
  console.log(`[clear-fpa] done. rows deleted=${wiped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
