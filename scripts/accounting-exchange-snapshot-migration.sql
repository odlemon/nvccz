-- Manual reference / DBA runbook. Prefer the idempotent TypeScript runner:
--   npx ts-node scripts/run-accounting-exchange-snapshot-migration.ts
-- (skips columns and FKs that already exist.)

-- Snapshot: Zimrate USD/ZWG avg at transaction time
-- recorded_currency_id: currency the business row was recorded in (where applicable)

ALTER TABLE `journal_entries`
  ADD COLUMN `usd_zwg_rate_snapshot` DECIMAL(18, 6) NULL COMMENT 'USD/ZWG avg from Zimrate at transaction time';

ALTER TABLE `expenses`
  ADD COLUMN `usd_zwg_rate_snapshot` DECIMAL(18, 6) NULL COMMENT 'USD/ZWG avg from Zimrate at transaction time';

ALTER TABLE `revenues`
  ADD COLUMN `usd_zwg_rate_snapshot` DECIMAL(18, 6) NULL COMMENT 'USD/ZWG avg from Zimrate at transaction time';

ALTER TABLE `invoices`
  ADD COLUMN `usd_zwg_rate_snapshot` DECIMAL(18, 6) NULL COMMENT 'USD/ZWG avg from Zimrate at transaction time';

ALTER TABLE `purchase_invoices`
  ADD COLUMN `usd_zwg_rate_snapshot` DECIMAL(18, 6) NULL COMMENT 'USD/ZWG avg from Zimrate at transaction time';

ALTER TABLE `procurement_invoices`
  ADD COLUMN `usd_zwg_rate_snapshot` DECIMAL(18, 6) NULL COMMENT 'USD/ZWG avg from Zimrate at transaction time';

ALTER TABLE `credit_notes`
  ADD COLUMN `usd_zwg_rate_snapshot` DECIMAL(18, 6) NULL COMMENT 'USD/ZWG avg from Zimrate at transaction time';

ALTER TABLE `cashbook_entries`
  ADD COLUMN `recorded_currency_id` VARCHAR(191) NULL COMMENT 'Currency the row was recorded in (denormalized at creation)',
  ADD COLUMN `usd_zwg_rate_snapshot` DECIMAL(18, 6) NULL COMMENT 'USD/ZWG avg from Zimrate at transaction time',
  ADD CONSTRAINT `cashbook_entries_recorded_currency_id_fkey` FOREIGN KEY (`recorded_currency_id`) REFERENCES `currencies` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `assets`
  ADD COLUMN `recorded_currency_id` VARCHAR(191) NULL COMMENT 'Currency the row was recorded in (denormalized at creation)',
  ADD COLUMN `usd_zwg_rate_snapshot` DECIMAL(18, 6) NULL COMMENT 'USD/ZWG avg from Zimrate at transaction time',
  ADD CONSTRAINT `assets_recorded_currency_id_fkey` FOREIGN KEY (`recorded_currency_id`) REFERENCES `currencies` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `stock_movements`
  ADD COLUMN `recorded_currency_id` VARCHAR(191) NULL COMMENT 'Currency the row was recorded in (denormalized at creation)',
  ADD COLUMN `usd_zwg_rate_snapshot` DECIMAL(18, 6) NULL COMMENT 'USD/ZWG avg from Zimrate at transaction time',
  ADD CONSTRAINT `stock_movements_recorded_currency_id_fkey` FOREIGN KEY (`recorded_currency_id`) REFERENCES `currencies` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `inventory_items`
  ADD COLUMN `recorded_currency_id` VARCHAR(191) NULL COMMENT 'Currency the row was recorded in (denormalized at creation)',
  ADD COLUMN `usd_zwg_rate_snapshot` DECIMAL(18, 6) NULL COMMENT 'USD/ZWG avg from Zimrate at transaction time',
  ADD CONSTRAINT `inventory_items_recorded_currency_id_fkey` FOREIGN KEY (`recorded_currency_id`) REFERENCES `currencies` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `depreciation_records`
  ADD COLUMN `recorded_currency_id` VARCHAR(191) NULL COMMENT 'Currency the row was recorded in (denormalized at creation)',
  ADD COLUMN `usd_zwg_rate_snapshot` DECIMAL(18, 6) NULL COMMENT 'USD/ZWG avg from Zimrate at transaction time',
  ADD CONSTRAINT `depreciation_records_recorded_currency_id_fkey` FOREIGN KEY (`recorded_currency_id`) REFERENCES `currencies` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `asset_disposal_records`
  ADD COLUMN `recorded_currency_id` VARCHAR(191) NULL COMMENT 'Currency the row was recorded in (denormalized at creation)',
  ADD COLUMN `usd_zwg_rate_snapshot` DECIMAL(18, 6) NULL COMMENT 'USD/ZWG avg from Zimrate at transaction time',
  ADD CONSTRAINT `asset_disposal_records_recorded_currency_id_fkey` FOREIGN KEY (`recorded_currency_id`) REFERENCES `currencies` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
