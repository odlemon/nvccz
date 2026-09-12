-- Vendor bill duplicate prevention: supplier invoice number per vendor.
-- Run after deploying code that uses `vendorInvoiceReference` / `vendor_invoice_reference`.
-- MySQL (matches prisma/schema.prisma PurchaseInvoice).

ALTER TABLE `purchase_invoices`
  ADD COLUMN `vendor_invoice_reference` VARCHAR(191) NULL
  COMMENT 'Supplier invoice number; unique per vendor when set'
  AFTER `invoice_number`;

CREATE UNIQUE INDEX `purchase_invoices_vendor_vendor_invoice_ref_key`
  ON `purchase_invoices` (`vendor_id`, `vendor_invoice_reference`);
