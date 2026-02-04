-- Add new fields to financial_reports table for manual KPI values
-- Run this directly against the database (do not use prisma migrate)
-- Note: If columns already exist, you'll get an error - that's OK, just ignore it

ALTER TABLE financial_reports
ADD COLUMN totalRevenue DECIMAL(19,2) NULL,
ADD COLUMN netProfit DECIMAL(19,2) NULL,
ADD COLUMN cashFlowNet DECIMAL(19,2) NULL;

-- Add index for faster queries by period (will fail if index already exists - that's OK)
CREATE INDEX idx_financial_reports_period ON financial_reports(portfolioCompanyId, periodEnd, status);
