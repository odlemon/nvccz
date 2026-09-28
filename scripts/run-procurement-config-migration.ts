/**
 * SRD §34-§40: notifications, dashboards, search, reports, currency, numbering and statuses.
 *
 * procurement_settings          : tender / grn / invoice / quotation number formats (the requisition, RFQ and PO formats already
 *                                 exist); reporting_currency_code, fx_source (TABLE | URL), fx_source_url, fx_max_age_days.
 * exchange_rates                : source (TABLE | URL | MANUAL), so every converted figure can say where its rate came from.
 * goods_received_notes          : currency_id (a receipt carries its own currency, taken from its purchase order).
 * currency back-fill            : requisitions, purchase orders, invoices and receipts written before currency was required on
 *                                 every transaction get the currency of the record they came from (a receipt from its order; the
 *                                 others from the default currency), so no financial record is left without one.
 * procurement_status_history    : every accepted status move on a requisition, sourcing event or purchase order (who, when).
 * procurement_notification_log  : every notification the dispatcher decides on, per recipient and channel, with what happened to it.
 *
 * Idempotent. Run: npm run db:migrate:procurement-config   then: npx prisma generate
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function one(sql: string, ...args: any[]) {
  const rows = await prisma.$queryRawUnsafe<any[]>(sql, ...args);
  return rows[0];
}
const columnExists = async (t: string, c: string) =>
  Number((await one(`SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, t, c))?.c ?? 0) > 0;
const tableExists = async (t: string) =>
  Number((await one(`SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, t))?.c ?? 0) > 0;

async function addColumn(table: string, column: string, ddl: string) {
  if (await columnExists(table, column)) return console.log(`[skip] ${table}.${column}`);
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${ddl}`);
  console.log(`[ok] added ${table}.${column}`);
}
async function createTable(name: string, ddl: string) {
  if (await tableExists(name)) return console.log(`[skip] table ${name}`);
  await prisma.$executeRawUnsafe(`${ddl} DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  console.log(`[ok] created ${name}`);
}

async function main() {
  // ---- settings
  await addColumn("procurement_settings", "tender_number_format", "VARCHAR(64) NULL");
  await addColumn("procurement_settings", "grn_number_format", "VARCHAR(64) NULL");
  await addColumn("procurement_settings", "invoice_number_format", "VARCHAR(64) NULL");
  await addColumn("procurement_settings", "quotation_number_format", "VARCHAR(64) NULL");
  await addColumn("procurement_settings", "reporting_currency_code", "VARCHAR(8) NULL");
  await addColumn("procurement_settings", "fx_source", "VARCHAR(16) NOT NULL DEFAULT 'TABLE'");
  await addColumn("procurement_settings", "fx_source_url", "VARCHAR(255) NULL");
  await addColumn("procurement_settings", "fx_max_age_days", "INT NOT NULL DEFAULT 30");
  await addColumn("exchange_rates", "source", "VARCHAR(16) NULL");
  await addColumn("goods_received_notes", "currency_id", "VARCHAR(191) NULL");

  // ---- currency on every financial transaction (legacy rows only; new writes must state their currency)
  const def = await one("SELECT id, code FROM currencies WHERE isDefault = 1 LIMIT 1").catch(() => null) ?? (await one("SELECT id, code FROM currencies WHERE code = 'USD' LIMIT 1").catch(() => null));
  if (def) {
    for (const [table, col] of [["purchase_requisitions", "currencyId"], ["purchase_orders", "currencyId"], ["procurement_invoices", "currencyId"]] as const) {
      if (!(await columnExists(table, col))) continue;
      const r: any = await prisma.$executeRawUnsafe(`UPDATE \`${table}\` SET \`${col}\` = ? WHERE \`${col}\` IS NULL`, def.id);
      console.log(`[ok] ${table}.${col}: ${r} row(s) with no currency given the default currency (${def.code})`);
    }
    const g: any = await prisma.$executeRawUnsafe(
      `UPDATE goods_received_notes g JOIN purchase_orders p ON p.id = g.purchaseOrderId SET g.currency_id = COALESCE(p.currencyId, ?) WHERE g.currency_id IS NULL`,
      def.id,
    );
    console.log(`[ok] goods_received_notes.currency_id: ${g} receipt(s) given their order's currency`);
  } else console.log("[warn] no default currency found: currency back-fill skipped");

  // ---- status history
  await createTable(
    "procurement_status_history",
    `CREATE TABLE procurement_status_history (
      id          VARCHAR(191) NOT NULL,
      entity_type VARCHAR(48)  NOT NULL,
      entity_id   VARCHAR(191) NOT NULL,
      entity_ref  VARCHAR(191) NULL,
      from_status VARCHAR(48)  NULL,
      to_status   VARCHAR(48)  NOT NULL,
      actor_id    VARCHAR(191) NULL,
      created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      KEY procurement_status_history_entity_idx (entity_type, entity_id, created_at)
    )`,
  );

  // ---- notification log
  await createTable(
    "procurement_notification_log",
    `CREATE TABLE procurement_notification_log (
      id            VARCHAR(191) NOT NULL,
      event_key     VARCHAR(64)  NOT NULL,
      recipient_id  VARCHAR(191) NULL,
      recipient_email VARCHAR(255) NULL,
      channel       VARCHAR(16)  NOT NULL,
      status        VARCHAR(16)  NOT NULL,
      reason        VARCHAR(255) NULL,
      entity_type   VARCHAR(48)  NULL,
      entity_id     VARCHAR(191) NULL,
      title         VARCHAR(255) NULL,
      created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (id),
      KEY procurement_notification_log_event_idx (event_key, created_at),
      KEY procurement_notification_log_recipient_idx (recipient_id, created_at)
    )`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
