/**
 * Performance module sweep: schema additions the UI-derived spec needs. Idempotent, raw SQL (no Prisma migrate).
 * Every step is labelled; the running list lives in design-refs/performance-sweep/MIGRATION_LOG.md (frontend repo).
 *
 * Run: npm run db:migrate:performance-sweep
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function columnExists(table: string, column: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  return Number(rows[0]?.c ?? 0) > 0;
}
async function tableExists(table: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    table
  );
  return Number(rows[0]?.c ?? 0) > 0;
}
async function addColumn(table: string, column: string, sql: string) {
  if (await columnExists(table, column)) return console.log(`[skip] ${table}.${column}`);
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN ${sql}`);
  console.log(`[ok]   ${table}.${column}`);
}
async function createTable(table: string, ddl: string) {
  if (await tableExists(table)) return console.log(`[skip] table ${table}`);
  await prisma.$executeRawUnsafe(ddl);
  console.log(`[ok]   table ${table}`);
}

async function main() {
  // S1 — strategic themes: owner and BSC perspective (the Themes page shows both).
  await addColumn("performance_themes", "ownerId", "`ownerId` VARCHAR(191) NULL");
  await addColumn("performance_themes", "perspective", "`perspective` VARCHAR(191) NULL");
  // S2 — corrective actions: root cause, resolution, source link, and a status/progress history (the recovery trend reads it).
  await addColumn("performance_corrective_actions", "root_cause", "`root_cause` VARCHAR(120) NULL");
  await addColumn("performance_corrective_actions", "resolution_notes", "`resolution_notes` TEXT NULL");
  await addColumn("performance_corrective_actions", "source_type", "`source_type` VARCHAR(32) NULL");
  await addColumn("performance_corrective_actions", "source_id", "`source_id` VARCHAR(64) NULL");
  await createTable(
    "performance_corrective_action_events",
    "CREATE TABLE `performance_corrective_action_events` (" +
      "`id` VARCHAR(191) NOT NULL, `action_id` VARCHAR(191) NOT NULL, `event_type` VARCHAR(32) NOT NULL, " +
      "`from_status` VARCHAR(32) NULL, `to_status` VARCHAR(32) NULL, `progress` INT NULL, `note` TEXT NULL, " +
      "`actor_id` VARCHAR(191) NULL, `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), " +
      "PRIMARY KEY (`id`), INDEX `pca_events_action_idx` (`action_id`), INDEX `pca_events_created_idx` (`created_at`)" +
      ") DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
  );

  // S3 — enterprise risk register: risks, treatment actions, and a score/status history (trend and audit).
  await createTable(
    "performance_risks",
    "CREATE TABLE `performance_risks` (" +
      "`id` VARCHAR(191) NOT NULL, `reference` VARCHAR(32) NOT NULL, `title` VARCHAR(255) NOT NULL, `description` TEXT NULL, " +
      "`category` VARCHAR(64) NOT NULL, `owner_id` VARCHAR(191) NULL, `department_id` VARCHAR(191) NULL, " +
      "`inherent_likelihood` INT NOT NULL, `inherent_impact` INT NOT NULL, `residual_likelihood` INT NULL, `residual_impact` INT NULL, " +
      "`appetite_limit` INT NOT NULL DEFAULT 10, `controls` TEXT NULL, `status` VARCHAR(32) NOT NULL DEFAULT 'identified', " +
      "`review_frequency_days` INT NOT NULL DEFAULT 90, `next_review_date` DATETIME(3) NULL, `last_reviewed_at` DATETIME(3) NULL, " +
      "`created_by_id` VARCHAR(191) NOT NULL, `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3), " +
      "PRIMARY KEY (`id`), UNIQUE INDEX `performance_risks_reference_key` (`reference`), INDEX `performance_risks_status_idx` (`status`), INDEX `performance_risks_owner_idx` (`owner_id`)" +
      ") DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
  );
  await createTable(
    "performance_risk_treatments",
    "CREATE TABLE `performance_risk_treatments` (" +
      "`id` VARCHAR(191) NOT NULL, `risk_id` VARCHAR(191) NOT NULL, `title` VARCHAR(255) NOT NULL, `description` TEXT NULL, `owner_id` VARCHAR(191) NULL, " +
      "`status` VARCHAR(32) NOT NULL DEFAULT 'open', `due_date` DATETIME(3) NOT NULL, `completed_at` DATETIME(3) NULL, `notes` TEXT NULL, " +
      "`created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3), " +
      "PRIMARY KEY (`id`), INDEX `performance_risk_treatments_risk_idx` (`risk_id`), INDEX `performance_risk_treatments_status_idx` (`status`)" +
      ") DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
  );
  await createTable(
    "performance_risk_history",
    "CREATE TABLE `performance_risk_history` (" +
      "`id` VARCHAR(191) NOT NULL, `risk_id` VARCHAR(191) NOT NULL, `event` VARCHAR(48) NOT NULL, `note` TEXT NULL, " +
      "`inherent_score` INT NULL, `residual_score` INT NULL, `status` VARCHAR(32) NULL, `actor_id` VARCHAR(191) NULL, " +
      "`created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (`id`), INDEX `performance_risk_history_risk_idx` (`risk_id`)" +
      ") DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
  );

  // S4 — alerts: rules (source, thresholds, three escalation windows, SLA, channels), rule link + SLA on alerts, alert history.
  await createTable(
    "performance_alert_rules",
    "CREATE TABLE `performance_alert_rules` (" +
      "`id` VARCHAR(191) NOT NULL, `code` VARCHAR(64) NOT NULL, `name` VARCHAR(160) NOT NULL, `description` TEXT NULL, `source` VARCHAR(48) NOT NULL, " +
      "`severity` VARCHAR(16) NOT NULL DEFAULT 'warning', `threshold` INT NOT NULL DEFAULT 0, `level1_minutes` INT NOT NULL DEFAULT 1440, `level2_minutes` INT NOT NULL DEFAULT 4320, `level3_minutes` INT NOT NULL DEFAULT 10080, " +
      "`resolve_within_minutes` INT NOT NULL DEFAULT 10080, `channels` VARCHAR(64) NOT NULL DEFAULT 'in_app', `is_active` TINYINT(1) NOT NULL DEFAULT 1, `created_by_id` VARCHAR(191) NULL, " +
      "`created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3), " +
      "PRIMARY KEY (`id`), UNIQUE INDEX `performance_alert_rules_code_key` (`code`)) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
  );
  await addColumn("performance_alerts", "rule_id", "`rule_id` VARCHAR(191) NULL");
  await addColumn("performance_alerts", "dedupe_key", "`dedupe_key` VARCHAR(191) NULL");
  await addColumn("performance_alerts", "sla_due_at", "`sla_due_at` DATETIME(3) NULL");
  await createTable(
    "performance_alert_events",
    "CREATE TABLE `performance_alert_events` (" +
      "`id` VARCHAR(191) NOT NULL, `alert_id` VARCHAR(191) NOT NULL, `event` VARCHAR(32) NOT NULL, `note` TEXT NULL, `actor_id` VARCHAR(191) NULL, " +
      "`created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (`id`), INDEX `performance_alert_events_alert_idx` (`alert_id`)) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
  );

  // S5 — document vault: retention class, audience, approval stamp, version history and event log.
  await addColumn("performance_documents", "retention_class", "`retention_class` VARCHAR(48) NULL");
  await addColumn("performance_documents", "audience", "`audience` VARCHAR(64) NULL");
  await addColumn("performance_documents", "approved_by_id", "`approved_by_id` VARCHAR(191) NULL");
  await addColumn("performance_documents", "approved_at", "`approved_at` DATETIME(3) NULL");
  await addColumn("performance_documents", "current_version_no", "`current_version_no` INT NOT NULL DEFAULT 1");
  await createTable(
    "performance_document_versions",
    "CREATE TABLE `performance_document_versions` (" +
      "`id` VARCHAR(191) NOT NULL, `document_id` VARCHAR(191) NOT NULL, `version_no` INT NOT NULL, `file_url` TEXT NOT NULL, `storage_path` VARCHAR(512) NULL, " +
      "`mime_type` VARCHAR(128) NULL, `file_size_bytes` INT NULL, `content` LONGTEXT NULL, `change_note` VARCHAR(500) NULL, `uploaded_by_id` VARCHAR(191) NULL, " +
      "`created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (`id`), UNIQUE INDEX `performance_document_versions_doc_no_key` (`document_id`, `version_no`)" +
      ") DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
  );
  await createTable(
    "performance_document_events",
    "CREATE TABLE `performance_document_events` (" +
      "`id` VARCHAR(191) NOT NULL, `document_id` VARCHAR(191) NOT NULL, `event` VARCHAR(32) NOT NULL, `note` TEXT NULL, `actor_id` VARCHAR(191) NULL, " +
      "`created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (`id`), INDEX `performance_document_events_doc_idx` (`document_id`)" +
      ") DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
  );

  // S6 — KPI registry governance: owner, source, cadence, target, thresholds, evidence rule, approval state.
  await addColumn("kpis", "owner_id", "`owner_id` VARCHAR(191) NULL");
  await addColumn("kpis", "source_system", "`source_system` VARCHAR(64) NULL");
  await addColumn("kpis", "update_method", "`update_method` VARCHAR(16) NULL");
  await addColumn("kpis", "frequency", "`frequency` VARCHAR(16) NULL");
  await addColumn("kpis", "target_value", "`target_value` DECIMAL(18,6) NULL");
  await addColumn("kpis", "amber_threshold", "`amber_threshold` DECIMAL(9,4) NULL");
  await addColumn("kpis", "red_threshold", "`red_threshold` DECIMAL(9,4) NULL");
  await addColumn("kpis", "evidence_rule", "`evidence_rule` VARCHAR(255) NULL");
  await addColumn("kpis", "approval_status", "`approval_status` VARCHAR(24) NOT NULL DEFAULT 'approved'");
  await addColumn("kpis", "approved_by_id", "`approved_by_id` VARCHAR(191) NULL");
  await addColumn("kpis", "approved_at", "`approved_at` DATETIME(3) NULL");
  await addColumn("kpis", "review_note", "`review_note` VARCHAR(1000) NULL");
  await addColumn("kpis", "created_by_id", "`created_by_id` VARCHAR(191) NULL");

  // S7 — objectives: confidence call on goals, note on progress events (check-ins).
  await addColumn("performance_goals", "confidence", "`confidence` VARCHAR(16) NULL");
  await addColumn("performance_goal_progress_events", "note", "`note` VARCHAR(500) NULL");

  // S8 — BSC pillar governance: executive owner and short name; weight proposals with approval and version numbers.
  await addColumn("scorecard_pillars", "owner_id", "`owner_id` VARCHAR(191) NULL");
  await addColumn("scorecard_pillars", "short_name", "`short_name` VARCHAR(40) NULL");
  await createTable(
    "performance_pillar_proposals",
    "CREATE TABLE `performance_pillar_proposals` (" +
      "`id` VARCHAR(191) NOT NULL, `weights` JSON NOT NULL, `previous_weights` JSON NULL, `reason` TEXT NOT NULL, `status` VARCHAR(16) NOT NULL DEFAULT 'pending', " +
      "`version_no` INT NULL, `proposed_by_id` VARCHAR(191) NOT NULL, `decided_by_id` VARCHAR(191) NULL, `decided_at` DATETIME(3) NULL, `decision_note` TEXT NULL, " +
      "`created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (`id`), INDEX `performance_pillar_proposals_status_idx` (`status`)" +
      ") DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
  );

  // S9 — performance contracts: version number, signatures per version, event log.
  await addColumn("performance_contracts", "versionNo", "`versionNo` INT NOT NULL DEFAULT 1");
  await createTable(
    "performance_contract_signatures",
    "CREATE TABLE `performance_contract_signatures` (" +
      "`id` VARCHAR(191) NOT NULL, `contract_id` VARCHAR(191) NOT NULL, `role` VARCHAR(16) NOT NULL, `user_id` VARCHAR(191) NOT NULL, `version_no` INT NOT NULL, `note` VARCHAR(500) NULL, " +
      "`signed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (`id`), INDEX `performance_contract_signatures_contract_idx` (`contract_id`)" +
      ") DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
  );
  await createTable(
    "performance_contract_events",
    "CREATE TABLE `performance_contract_events` (" +
      "`id` VARCHAR(191) NOT NULL, `contract_id` VARCHAR(191) NOT NULL, `event` VARCHAR(32) NOT NULL, `note` TEXT NULL, `actor_id` VARCHAR(191) NULL, " +
      "`created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (`id`), INDEX `performance_contract_events_contract_idx` (`contract_id`)" +
      ") DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
  );

  // S10 — performance projects: owner, goal, department, dates, description on projects; project link on tasks.
  await addColumn("projects", "owner_id", "`owner_id` VARCHAR(191) NULL");
  await addColumn("projects", "goal_id", "`goal_id` VARCHAR(191) NULL");
  await addColumn("projects", "department_name", "`department_name` VARCHAR(120) NULL");
  await addColumn("projects", "start_date", "`start_date` DATE NULL");
  await addColumn("projects", "end_date", "`end_date` DATE NULL");
  await addColumn("projects", "description", "`description` TEXT NULL");
  await addColumn("tasks", "project_id", "`project_id` VARCHAR(191) NULL");

  // S11 — timesheets: task on an entry, the reason a manager gives when returning a week.
  await addColumn("timesheet_entries", "task_id", "`task_id` VARCHAR(191) NULL");
  await addColumn("timesheets", "return_reason", "`return_reason` VARCHAR(500) NULL");

  // S12 — reports: definitions, runs (stored documents), schedules; compliance controls and their test history.
  await createTable("performance_report_definitions",
    "CREATE TABLE `performance_report_definitions` (`id` VARCHAR(191) NOT NULL, `reference` VARCHAR(32) NOT NULL, `name` VARCHAR(200) NOT NULL, `description` TEXT NULL, `type` VARCHAR(48) NOT NULL, `category` VARCHAR(32) NOT NULL, `format` VARCHAR(8) NOT NULL DEFAULT 'HTML', `filters` JSON NULL, `owner_id` VARCHAR(191) NULL, `status` VARCHAR(16) NOT NULL DEFAULT 'active', `created_by_id` VARCHAR(191) NOT NULL, `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3), PRIMARY KEY (`id`), UNIQUE INDEX `performance_report_definitions_reference_key` (`reference`)) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
  await createTable("performance_report_runs",
    "CREATE TABLE `performance_report_runs` (`id` VARCHAR(191) NOT NULL, `definition_id` VARCHAR(191) NOT NULL, `status` VARCHAR(24) NOT NULL, `format` VARCHAR(8) NOT NULL DEFAULT 'HTML', `trigger` VARCHAR(16) NOT NULL DEFAULT 'manual', `generated_by_id` VARCHAR(191) NULL, `generated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), `row_count` INT NOT NULL DEFAULT 0, `content_html` LONGTEXT NULL, `content_csv` LONGTEXT NULL, `checksum` VARCHAR(32) NULL, `error` TEXT NULL, `published_by_id` VARCHAR(191) NULL, `published_at` DATETIME(3) NULL, PRIMARY KEY (`id`), INDEX `performance_report_runs_definition_idx` (`definition_id`), INDEX `performance_report_runs_generated_idx` (`generated_at`)) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
  await createTable("performance_report_schedules",
    "CREATE TABLE `performance_report_schedules` (`id` VARCHAR(191) NOT NULL, `definition_id` VARCHAR(191) NOT NULL, `frequency` VARCHAR(16) NOT NULL, `recipient_ids` JSON NOT NULL, `next_run_at` DATETIME(3) NOT NULL, `last_run_at` DATETIME(3) NULL, `is_active` TINYINT(1) NOT NULL DEFAULT 1, `created_by_id` VARCHAR(191) NULL, `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (`id`), INDEX `performance_report_schedules_due_idx` (`is_active`, `next_run_at`)) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
  await createTable("performance_compliance_controls",
    "CREATE TABLE `performance_compliance_controls` (`id` VARCHAR(191) NOT NULL, `code` VARCHAR(48) NOT NULL, `name` VARCHAR(200) NOT NULL, `description` TEXT NULL, `control_type` VARCHAR(16) NOT NULL, `test_key` VARCHAR(48) NULL, `frequency` VARCHAR(16) NOT NULL DEFAULT 'monthly', `owner_id` VARCHAR(191) NULL, `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (`id`), UNIQUE INDEX `performance_compliance_controls_code_key` (`code`)) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
  await createTable("performance_compliance_tests",
    "CREATE TABLE `performance_compliance_tests` (`id` VARCHAR(191) NOT NULL, `control_id` VARCHAR(191) NOT NULL, `result` VARCHAR(8) NOT NULL, `exceptions` INT NOT NULL DEFAULT 0, `detail` TEXT NULL, `tested_by_id` VARCHAR(191) NULL, `tested_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (`id`), INDEX `performance_compliance_tests_control_idx` (`control_id`)) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

  // S13 — strategy hub: reviews, decisions and assumptions.
  await createTable("performance_strategy_reviews",
    "CREATE TABLE `performance_strategy_reviews` (`id` VARCHAR(191) NOT NULL, `strategy_id` VARCHAR(191) NULL, `title` VARCHAR(200) NOT NULL, `scope` VARCHAR(500) NULL, `scheduled_for` DATETIME(3) NOT NULL, `held_at` DATETIME(3) NULL, `status` VARCHAR(16) NOT NULL DEFAULT 'planned', `outcome` TEXT NULL, `created_by_id` VARCHAR(191) NULL, `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (`id`)) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
  await createTable("performance_strategy_decisions",
    "CREATE TABLE `performance_strategy_decisions` (`id` VARCHAR(191) NOT NULL, `review_id` VARCHAR(191) NULL, `title` VARCHAR(255) NOT NULL, `type` VARCHAR(24) NOT NULL DEFAULT 'other', `description` TEXT NULL, `rationale` TEXT NULL, `owner_id` VARCHAR(191) NULL, `proposed_by_id` VARCHAR(191) NULL, `status` VARCHAR(16) NOT NULL DEFAULT 'proposed', `decided_by_id` VARCHAR(191) NULL, `decided_at` DATETIME(3) NULL, `decision_note` TEXT NULL, `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (`id`), INDEX `performance_strategy_decisions_status_idx` (`status`)) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
  // S14 — Performance → GL posting outcome per progress event (posted / skipped / failed / reversed / voided), so a
  // failed or blocked posting is visible, notifiable and retryable instead of only logged.
  await addColumn("performance_goal_progress_events", "journal_status", "`journal_status` VARCHAR(16) NULL");
  await addColumn("performance_goal_progress_events", "journal_note", "`journal_note` VARCHAR(500) NULL");
  await addColumn("performance_goal_progress_events", "journal_attempts", "`journal_attempts` INT NOT NULL DEFAULT 0");
  await addColumn("performance_goal_progress_events", "journal_attempted_at", "`journal_attempted_at` DATETIME(3) NULL");
  // the signed amount the GL actually moved for the event (a correction larger than what was posted is capped)
  await addColumn("performance_goal_progress_events", "journal_amount", "`journal_amount` DECIMAL(15,2) NULL");
  await prisma.$executeRawUnsafe("CREATE INDEX `performance_goal_progress_events_journal_status_idx` ON `performance_goal_progress_events` (`journal_status`)").catch(() => undefined);

  await createTable("performance_strategy_assumptions",
    "CREATE TABLE `performance_strategy_assumptions` (`id` VARCHAR(191) NOT NULL, `statement` VARCHAR(1000) NOT NULL, `status` VARCHAR(16) NOT NULL DEFAULT 'valid', `owner_id` VARCHAR(191) NULL, `review_date` DATETIME(3) NULL, `evidence` VARCHAR(1000) NULL, `created_by_id` VARCHAR(191) NULL, `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (`id`)) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
