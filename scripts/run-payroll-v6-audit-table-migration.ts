/**
 * Payroll V6 — create the payroll audit event table.
 *
 * The Audit Trail screen is a governance screen and it was rendering six
 * invented events, because payroll had no audit store at all: the runtime's
 * logEvent() wrote to an in-memory array that died with the page.
 *
 * There is an ActivityLog model, but it is performance/portfolio shaped
 * (goalId, taskId, kpiId) and payroll never wrote to it, so this gets its own
 * table rather than being bent into that one.
 *
 * Managed OUTSIDE Prisma deliberately, in line with how other
 * hand-managed tables are handled in this repo: no `prisma migrate`, no
 * `db push`. The service reads and writes it with $queryRaw/$executeRaw, so
 * schema.prisma needs no change and cannot drift.
 *
 * Idempotent: CREATE TABLE IF NOT EXISTS plus guarded index creation.
 *
 * Run: npm run db:migrate:payroll-v6-audit-table
 */
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

const TABLE = "payroll_audit_events"

async function indexExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ n: bigint | number }>>(
    `SELECT COUNT(1) AS n FROM information_schema.statistics
      WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
    TABLE,
    name,
  )
  return Number(rows?.[0]?.n ?? 0) > 0
}

async function main() {
  console.log(`Payroll V6 audit table migration\n`)

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      id            VARCHAR(191) NOT NULL,
      occurred_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      actor_user_id VARCHAR(191) NULL,
      actor_name    VARCHAR(255) NULL,
      actor_role    VARCHAR(255) NULL,
      action        VARCHAR(128) NOT NULL,
      event_class   VARCHAR(64)  NOT NULL DEFAULT 'Change',
      entity_type   VARCHAR(64)  NULL,
      entity_id     VARCHAR(191) NULL,
      entity_label  VARCHAR(255) NULL,
      detail        TEXT         NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  console.log(`  table ${TABLE} present`)

  const indexes: Array<[string, string]> = [
    ["idx_payroll_audit_occurred_at", "(occurred_at)"],
    ["idx_payroll_audit_entity", "(entity_type, entity_id)"],
    ["idx_payroll_audit_action", "(action)"],
  ]
  for (const [name, cols] of indexes) {
    if (await indexExists(name)) {
      console.log(`  index ${name} already present`)
      continue
    }
    await prisma.$executeRawUnsafe(`CREATE INDEX ${name} ON ${TABLE} ${cols}`)
    console.log(`  index ${name} created`)
  }

  const rows = await prisma.$queryRawUnsafe<Array<{ n: bigint | number }>>(
    `SELECT COUNT(1) AS n FROM ${TABLE}`,
  )
  console.log(`\nDone. ${Number(rows?.[0]?.n ?? 0)} audit event(s) on record.`)
}

main()
  .catch((e) => {
    console.error("Migration failed:", e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
