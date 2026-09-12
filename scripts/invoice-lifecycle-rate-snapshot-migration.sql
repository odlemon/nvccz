-- Manual reference / DBA runbook for invoice send & paid USD/ZWG snapshots.
-- Idempotent runner (recommended):
--   npx ts-node scripts/run-invoice-lifecycle-rate-snapshot-migration.ts
--
-- Same semantics as exchangeRateAtCreation / usd_zwg_rate_snapshot: ZWG per 1 USD from Zimrate or stored fallback.

ALTER TABLE `invoices`
  ADD COLUMN `exchange_rate_at_sent` DECIMAL(15, 6) NULL COMMENT 'ZWG per USD when invoice sent',
  ADD COLUMN `usd_zwg_rate_snapshot_sent` DECIMAL(18, 6) NULL COMMENT 'USD/ZWG snapshot when invoice sent',
  ADD COLUMN `exchange_rate_at_paid` DECIMAL(15, 6) NULL COMMENT 'ZWG per USD when invoice marked paid',
  ADD COLUMN `usd_zwg_rate_snapshot_paid` DECIMAL(18, 6) NULL COMMENT 'USD/ZWG snapshot when invoice marked paid';
