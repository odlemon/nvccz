// @ts-nocheck
/**
 * Fundraising module cleanup (DESTRUCTIVE when applied).
 *
 * Preserves configuration / reference data:
 * - fundraising_settings
 * - fundraising_pipeline_templates
 * - fundraising_ddq_templates
 * - fundraising_ddq_answer_library
 * - fundraising_report_schedules
 * - users, funds, clients, chart_of_accounts
 *
 * Deletes all other fundraising transactional rows in FK-safe order, plus only
 * tasks where taskMetadata.sourceModule = "fundraising" and their activity_logs.
 *
 * Collects journal_entry_id from fundraising_pipeline_deals and fundraising_commitments,
 * unlinks them, then deletes linked journal lines/entries only when no other module
 * still references the entry.
 *
 * Default mode is DRY RUN (no deletes). Pass --apply to execute.
 *
 * Run:
 *   npx ts-node scripts/cleanup-fundraising-module-data.ts
 *   npx ts-node scripts/cleanup-fundraising-module-data.ts --apply
 *
 * Safety: hard-blocks client1_db; only nts or demo_env (from DATABASE_URL) allowed.
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";

type TableCount = { table: string; count: number; skipped?: boolean };

const KEEP_TABLES = [
  "fundraising_settings",
  "fundraising_pipeline_templates",
  "fundraising_ddq_templates",
  "fundraising_ddq_answer_library",
  "fundraising_report_schedules",
] as const;

const REFERENCE_TABLES = ["users", "funds", "clients", "chart_of_accounts"] as const;

/**
 * Leaf → parent order respecting FK constraints (NoAction / Restrict / self-references).
 * Optional tables are skipped when absent in information_schema.
 */
const DELETE_TABLES = [
  "fundraising_report_runs",
  "fundraising_report_jobs",
  "fundraising_approval_events",
  "fundraising_agreement_provider_artifacts",
  "fundraising_agreement_signatories",
  "fundraising_agreement_versions",
  "fundraising_agreements",
  "fundraising_deal_agreements",
  "fundraising_deal_checklist_items",
  "pipeline_interactions",
  "fundraising_commitment_checklist_items",
  "fundraising_placement_commission_ledger",
  "fundraising_placement_exclusions",
  "fundraising_placement_assignments",
  "fundraising_campaign_distribution_list_members",
  "fundraising_meeting_action_items",
  "fundraising_meeting_attendees",
  "fundraising_ddq_question_replies",
  "fundraising_ddq_questions",
  "fundraising_ddq_item_evidence",
  "fundraising_ddq_item_comments",
  "fundraising_ddq_items",
  "fundraising_document_versions",
  "fundraising_data_room_access_logs",
  "fundraising_opportunity_checklist_items",
  "opportunity_amount_history",
  "opportunity_stage_history",
  "fundraising_commercial_terms",
  "fundraising_closing_readiness_events",
  "fundraising_rfp_proposal_versions",
  "fundraising_commitments",
  "fundraising_meetings",
  "fundraising_ddq_cases",
  "fundraising_documents",
  "fundraising_data_room_access",
  "fundraising_data_room_documents",
  "fundraising_data_room_folders",
  "fundraising_data_rooms",
  "fundraising_closings",
  "fundraising_communications",
  "fundraising_kyc_cases",
  "fundraising_compliance_holds",
  "fundraising_rfps",
  "fundraising_mandates",
  "fundraising_campaign_material_versions",
  "fundraising_campaign_materials",
  "fundraising_campaign_events",
  "fundraising_campaign_templates",
  "fundraising_campaign_distribution_lists",
  "fundraising_forecast_scenarios",
  "fundraising_opportunities",
  "fundraising_pipeline_deals",
  "fundraising_placement_agents",
  "fundraising_stage_checklist_templates",
  "fundraising_campaign_gl_mappings",
  "fundraising_pipeline_stages",
  "fundraising_audit_logs",
  "fundraising_approval_requests",
  "fundraising_campaigns",
  "investor_contacts",
  "investor_organisations",
] as const;

const FUNDRAISING_JE_SOURCE_TABLES = [
  { table: "fundraising_pipeline_deals", column: "journal_entry_id" },
  { table: "fundraising_commitments", column: "journal_entry_id" },
] as const;

const JE_REFERENCE_SKIP_TABLES = new Set([
  "fundraising_pipeline_deals",
  "fundraising_commitments",
  "journal_entries",
  "journal_entry_lines",
]);

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function sanitizeDatabaseUrlForLog(databaseUrl: string | undefined) {
  if (!databaseUrl) return "(DATABASE_URL not set)";
  try {
    const u = new URL(databaseUrl);
    if (u.password) u.password = "****";
    return `${u.protocol}//${u.username ? `${u.username}@` : ""}${u.host}${u.pathname}${u.search}`;
  } catch {
    return "(DATABASE_URL set; unable to parse safely)";
  }
}

function resolveDatabaseName(databaseUrl: string): string {
  try {
    const pathname = new URL(databaseUrl).pathname || "";
    const name = pathname.replace(/^\//, "").split("/")[0]?.trim();
    if (name) return name.toLowerCase();
  } catch {
    /* fall through */
  }
  const slash = databaseUrl.match(/\/([^/?]+)(?:\?|$)/);
  return (slash?.[1] || "").toLowerCase();
}

function assertAllowedDatabase(databaseUrl: string) {
  const dbName = resolveDatabaseName(databaseUrl);
  if (!dbName) {
    throw new Error("Could not determine database name from DATABASE_URL.");
  }
  if (dbName === "client1_db") {
    throw new Error(
      "HARD BLOCK: refusing to run fundraising cleanup on client1_db (production). " +
        "Point DATABASE_URL at nts or demo_env only."
    );
  }
  if (dbName !== "nts" && dbName !== "demo_env") {
    throw new Error(
      `Refusing to run fundraising cleanup on "${dbName}". Only nts or demo_env are allowed.`
    );
  }
  return dbName;
}

async function tableExists(table: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    table
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

async function countRows(table: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM \`${table}\``
  );
  return Number(rows[0]?.c ?? 0);
}

async function countTable(table: string): Promise<TableCount> {
  if (!(await tableExists(table))) {
    return { table, count: 0, skipped: true };
  }
  return { table, count: await countRows(table) };
}

async function countMany(tables: readonly string[]): Promise<TableCount[]> {
  const out: TableCount[] = [];
  for (const table of tables) {
    out.push(await countTable(table));
  }
  return out;
}

function printCounts(label: string, rows: TableCount[]) {
  console.log(label);
  for (const row of rows) {
    if (row.skipped) {
      console.log(`  ${row.table.padEnd(48)} (table absent — skipped)`);
    } else {
      console.log(`  ${row.table.padEnd(48)} ${row.count}`);
    }
  }
  console.log("");
}

async function fetchFundraisingTaskIds(): Promise<string[]> {
  if (!(await tableExists("tasks"))) return [];
  if (!(await columnExists("tasks", "taskMetadata"))) return [];
  try {
    const rows = await prisma.task.findMany({
      where: { taskMetadata: { path: "$.sourceModule", equals: "fundraising" } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  } catch {
    const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM tasks
       WHERE JSON_UNQUOTE(JSON_EXTRACT(taskMetadata, '$.sourceModule')) = 'fundraising'`
    );
    return rows.map((r) => r.id);
  }
}

async function countFundraisingTasksAndLogs() {
  const taskIds = await fetchFundraisingTaskIds();
  let activityLogs = 0;
  if (taskIds.length > 0 && (await tableExists("activity_logs"))) {
    activityLogs = await prisma.activityLog.count({ where: { taskId: { in: taskIds } } });
  }
  return {
    fundraisingTasks: taskIds.length,
    fundraisingTaskActivityLogs: activityLogs,
    taskIds,
  };
}

async function collectFundraisingJournalEntryIds(): Promise<string[]> {
  const ids = new Set<string>();
  for (const { table, column } of FUNDRAISING_JE_SOURCE_TABLES) {
    if (!(await tableExists(table))) continue;
    if (!(await columnExists(table, column))) continue;
    const rows = await prisma.$queryRawUnsafe<Array<{ je: string | null }>>(
      `SELECT DISTINCT \`${column}\` AS je FROM \`${table}\` WHERE \`${column}\` IS NOT NULL`
    );
    for (const row of rows) {
      if (row.je) ids.add(row.je);
    }
  }
  return [...ids];
}

async function findJournalEntryReferenceColumns(): Promise<Array<{ table: string; column: string }>> {
  const rows = await prisma.$queryRawUnsafe<
    Array<{ TABLE_NAME: string; COLUMN_NAME: string }>
  >(
    `SELECT TABLE_NAME, COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND COLUMN_NAME IN (
         'journal_entry_id',
         'journalEntryId',
         'payment_journal_entry_id',
         'reversal_journal_entry_id',
         'matched_journal_entry_id',
         'liquidation_journal_entry_id'
       )
     ORDER BY TABLE_NAME, COLUMN_NAME`
  );
  return rows.map((r) => ({ table: r.TABLE_NAME, column: r.COLUMN_NAME }));
}

async function isJournalEntrySafeToDelete(
  journalEntryId: string,
  refColumns: Array<{ table: string; column: string }>
): Promise<{ safe: boolean; blocker?: string }> {
  for (const { table, column } of refColumns) {
    if (JE_REFERENCE_SKIP_TABLES.has(table)) continue;
    if (!(await tableExists(table))) continue;
    if (!(await columnExists(table, column))) continue;
    const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
      `SELECT COUNT(*) AS c FROM \`${table}\` WHERE \`${column}\` = ?`,
      journalEntryId
    );
    if (Number(rows[0]?.c ?? 0) > 0) {
      return { safe: false, blocker: `${table}.${column}` };
    }
  }
  return { safe: true };
}

async function unlinkFundraisingJournalEntries(apply: boolean): Promise<number> {
  let unlinked = 0;
  for (const { table, column } of FUNDRAISING_JE_SOURCE_TABLES) {
    if (!(await tableExists(table))) continue;
    if (!(await columnExists(table, column))) continue;
    const before = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
      `SELECT COUNT(*) AS c FROM \`${table}\` WHERE \`${column}\` IS NOT NULL`
    );
    const count = Number(before[0]?.c ?? 0);
    if (apply && count > 0) {
      await prisma.$executeRawUnsafe(
        `UPDATE \`${table}\` SET \`${column}\` = NULL WHERE \`${column}\` IS NOT NULL`
      );
    }
    unlinked += count;
  }
  return unlinked;
}

async function nullDataRoomFolderParents(apply: boolean): Promise<number> {
  const table = "fundraising_data_room_folders";
  if (!(await tableExists(table))) return 0;
  if (!(await columnExists(table, "parent_id"))) return 0;
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM \`${table}\` WHERE parent_id IS NOT NULL`
  );
  const count = Number(rows[0]?.c ?? 0);
  if (apply && count > 0) {
    await prisma.$executeRawUnsafe(
      `UPDATE \`${table}\` SET parent_id = NULL WHERE parent_id IS NOT NULL`
    );
  }
  return count;
}

async function deleteFundraisingTasksAndLogs(taskIds: string[], apply: boolean) {
  let activityLogsDeleted = 0;
  let tasksDeleted = 0;

  if (taskIds.length > 0 && (await tableExists("activity_logs"))) {
    if (apply) {
      const del = await prisma.activityLog.deleteMany({ where: { taskId: { in: taskIds } } });
      activityLogsDeleted = del.count;
    } else {
      activityLogsDeleted = await prisma.activityLog.count({
        where: { taskId: { in: taskIds } },
      });
    }
  }

  if (taskIds.length > 0 && (await tableExists("tasks"))) {
    if (apply) {
      const del = await prisma.task.deleteMany({ where: { id: { in: taskIds } } });
      tasksDeleted = del.count;
    } else {
      tasksDeleted = taskIds.length;
    }
  }

  return { activityLogsDeleted, tasksDeleted };
}

async function deleteSafeJournalEntries(
  journalEntryIds: string[],
  refColumns: Array<{ table: string; column: string }>,
  apply: boolean
) {
  const results = {
    candidates: journalEntryIds.length,
    deleted: 0,
    skippedUnsafe: 0,
    skippedMissing: 0,
    blockers: [] as string[],
  };

  for (const jeId of journalEntryIds) {
    if (!(await tableExists("journal_entries"))) {
      results.skippedMissing++;
      continue;
    }
    const exists = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
      `SELECT COUNT(*) AS c FROM journal_entries WHERE id = ?`,
      jeId
    );
    if (Number(exists[0]?.c ?? 0) === 0) {
      results.skippedMissing++;
      continue;
    }

    const safety = await isJournalEntrySafeToDelete(jeId, refColumns);
    if (!safety.safe) {
      results.skippedUnsafe++;
      if (results.blockers.length < 10) {
        results.blockers.push(`${jeId} ← ${safety.blocker}`);
      }
      continue;
    }

    if (apply) {
      if (await tableExists("journal_entry_lines")) {
        if (await columnExists("journal_entry_lines", "journal_entry_id")) {
          await prisma.$executeRawUnsafe(
            `DELETE FROM journal_entry_lines WHERE journal_entry_id = ?`,
            jeId
          );
        } else if (await columnExists("journal_entry_lines", "journalEntryId")) {
          await prisma.$executeRawUnsafe(
            `DELETE FROM journal_entry_lines WHERE journalEntryId = ?`,
            jeId
          );
        }
      }
      await prisma.$executeRawUnsafe(`DELETE FROM journal_entries WHERE id = ?`, jeId);
    }
    results.deleted++;
  }

  return results;
}

async function deleteTransactionalTables(apply: boolean) {
  const deletedByTable: Record<string, number> = {};
  for (const table of DELETE_TABLES) {
    if (!(await tableExists(table))) {
      deletedByTable[table] = -1;
      continue;
    }
    const before = await countRows(table);
    if (apply && before > 0) {
      await prisma.$executeRawUnsafe(`DELETE FROM \`${table}\``);
    }
    deletedByTable[table] = before;
  }
  return deletedByTable;
}

async function main() {
  const apply = hasFlag("--apply");
  const databaseUrl = process.env.DATABASE_URL || "";
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const dbName = assertAllowedDatabase(databaseUrl);
  const dbLabel = (
    await prisma.$queryRawUnsafe<Array<{ d: string | null }>>(`SELECT DATABASE() AS d`)
  )[0]?.d;

  console.log("============================================================");
  console.log("FUNDRAISING MODULE CLEANUP (TRANSACTIONAL DATA ONLY)");
  console.log("============================================================");
  console.log(`Mode: ${apply ? "APPLY (DESTRUCTIVE)" : "DRY RUN (no changes)"}`);
  console.log(`Database: ${sanitizeDatabaseUrlForLog(databaseUrl)}`);
  console.log(`Resolved DB: ${dbName}${dbLabel && dbLabel.toLowerCase() !== dbName ? ` (connected: ${dbLabel})` : ""}`);
  console.log("");
  console.log("KEEP:");
  console.log(`  ${[...KEEP_TABLES, ...REFERENCE_TABLES].join(", ")}`);
  console.log("");

  const [keepCounts, deleteCountsBefore, refCounts, taskCountsBefore, journalEntryIds] =
    await Promise.all([
      countMany(KEEP_TABLES),
      countMany(DELETE_TABLES),
      countMany(REFERENCE_TABLES),
      countFundraisingTasksAndLogs(),
      collectFundraisingJournalEntryIds(),
    ]);

  printCounts("--- Counts BEFORE: preserved fundraising config ---", keepCounts);
  printCounts("--- Counts BEFORE: preserved reference data ---", refCounts);
  printCounts("--- Counts BEFORE: transactional tables (target delete set) ---", deleteCountsBefore);

  console.log("--- Counts BEFORE: fundraising tasks / logs ---");
  console.log(`  fundraising tasks (sourceModule=fundraising)     ${taskCountsBefore.fundraisingTasks}`);
  console.log(`  activity_logs linked to those tasks                ${taskCountsBefore.fundraisingTaskActivityLogs}`);
  console.log(`  journal_entry_id candidates (deals+commitments)  ${journalEntryIds.length}`);
  console.log("");

  const deleteTotalBefore = deleteCountsBefore
    .filter((r) => !r.skipped)
    .reduce((sum, r) => sum + r.count, 0);

  if (!apply) {
    console.log("============================================================");
    console.log("DRY RUN SUMMARY");
    console.log("============================================================");
    console.log(`Would delete ~${deleteTotalBefore} fundraising transactional row(s) across ${DELETE_TABLES.length} tables.`);
    console.log(
      `Would delete ${taskCountsBefore.fundraisingTaskActivityLogs} activity_log(s) and ${taskCountsBefore.fundraisingTasks} task(s) tagged sourceModule=fundraising.`
    );
    console.log(
      `Would unlink ${journalEntryIds.length} journal_entry_id pointer(s) on deals/commitments; ` +
        "delete linked journal entries only when no other module still references them."
    );
    console.log("");
    console.log("No changes made. Re-run with --apply to execute deletes.");
    return;
  }

  console.log("============================================================");
  console.log("APPLY: executing deletes…");
  console.log("============================================================");

  const jeRefColumns = await findJournalEntryReferenceColumns();
  const unlinkedJePointers = await unlinkFundraisingJournalEntries(true);
  const nulledFolderParents = await nullDataRoomFolderParents(true);
  console.log(`Unlinked journal_entry_id pointers on deals/commitments: ${unlinkedJePointers}`);
  console.log(`Nulled data-room folder parent_id pointers: ${nulledFolderParents}`);
  console.log("");

  const deletedByTable = await deleteTransactionalTables(true);
  let deletedRows = 0;
  for (const table of DELETE_TABLES) {
    const n = deletedByTable[table];
    if (n === -1) {
      console.log(`  [skip] ${table} (absent)`);
    } else if (n > 0) {
      console.log(`  [deleted] ${table}: ${n}`);
      deletedRows += n;
    }
  }
  console.log("");

  const taskDeleteResult = await deleteFundraisingTasksAndLogs(taskCountsBefore.taskIds, true);
  console.log(`Deleted activity_logs (fundraising tasks): ${taskDeleteResult.activityLogsDeleted}`);
  console.log(`Deleted tasks (sourceModule=fundraising): ${taskDeleteResult.tasksDeleted}`);
  console.log("");

  const jeDeleteResult = await deleteSafeJournalEntries(journalEntryIds, jeRefColumns, true);
  console.log("Journal entry cleanup:");
  console.log(`  candidates: ${jeDeleteResult.candidates}`);
  console.log(`  deleted: ${jeDeleteResult.deleted}`);
  console.log(`  skipped (still referenced elsewhere): ${jeDeleteResult.skippedUnsafe}`);
  console.log(`  skipped (already absent): ${jeDeleteResult.skippedMissing}`);
  if (jeDeleteResult.blockers.length > 0) {
    console.log("  sample blockers:");
    for (const b of jeDeleteResult.blockers) console.log(`    - ${b}`);
  }
  console.log("");

  const [keepCountsAfter, deleteCountsAfter, refCountsAfter, taskCountsAfter] = await Promise.all([
    countMany(KEEP_TABLES),
    countMany(DELETE_TABLES),
    countMany(REFERENCE_TABLES),
    countFundraisingTasksAndLogs(),
  ]);

  printCounts("--- Counts AFTER: preserved fundraising config ---", keepCountsAfter);
  printCounts("--- Counts AFTER: preserved reference data ---", refCountsAfter);
  printCounts("--- Counts AFTER: transactional tables (should be 0) ---", deleteCountsAfter);

  console.log("--- Counts AFTER: fundraising tasks / logs ---");
  console.log(`  fundraising tasks (sourceModule=fundraising)     ${taskCountsAfter.fundraisingTasks}`);
  console.log(`  activity_logs linked to those tasks                ${taskCountsAfter.fundraisingTaskActivityLogs}`);
  console.log("");

  const remainingDeleteRows = deleteCountsAfter
    .filter((r) => !r.skipped)
    .reduce((sum, r) => sum + r.count, 0);

  console.log("============================================================");
  console.log("APPLY SUMMARY");
  console.log("============================================================");
  console.log(`Deleted ${deletedRows} fundraising transactional row(s).`);
  console.log(
    `Deleted ${taskDeleteResult.activityLogsDeleted} activity_log(s) and ${taskDeleteResult.tasksDeleted} fundraising task(s).`
  );
  console.log(
    `Journal entries deleted: ${jeDeleteResult.deleted} of ${jeDeleteResult.candidates} candidate(s).`
  );
  if (remainingDeleteRows > 0) {
    console.log(`WARNING: ${remainingDeleteRows} transactional row(s) remain in target tables.`);
    process.exitCode = 1;
  } else {
    console.log("All target transactional tables are empty (or absent).");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
