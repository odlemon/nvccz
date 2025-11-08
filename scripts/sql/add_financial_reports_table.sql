-- Manual schema update for financial reports
-- Run this against the database manually (do not use prisma migrate)

CREATE TABLE IF NOT EXISTS financial_reports (
  id VARCHAR(191) COLLATE utf8mb4_unicode_ci PRIMARY KEY,
  portfolioCompanyId VARCHAR(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  submittedById VARCHAR(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  reportType ENUM('BALANCE_SHEET', 'INCOME_STATEMENT', 'CASHFLOW_STATEMENT') NOT NULL,
  periodType ENUM('WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL') NOT NULL,
  periodStart DATE NOT NULL,
  periodEnd DATE NOT NULL,
  title VARCHAR(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  description TEXT COLLATE utf8mb4_unicode_ci,
  reportUrl TEXT COLLATE utf8mb4_unicode_ci NOT NULL,
  storagePath VARCHAR(512) COLLATE utf8mb4_unicode_ci NOT NULL,
  templateVersion VARCHAR(50) COLLATE utf8mb4_unicode_ci DEFAULT 'v1',
  mappingSnapshot JSON,
  parsedSnapshot JSON,
  status ENUM('PENDING', 'ACCEPTED', 'REJECTED', 'NEEDS_REVISION') NOT NULL DEFAULT 'PENDING',
  reviewerId VARCHAR(191) COLLATE utf8mb4_unicode_ci,
  reviewedAt DATETIME,
  reviewerComment TEXT COLLATE utf8mb4_unicode_ci,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_financial_reports_portfolio_company FOREIGN KEY (portfolioCompanyId) REFERENCES portfolio_companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_financial_reports_submitted_by FOREIGN KEY (submittedById) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_financial_reports_reviewer FOREIGN KEY (reviewerId) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_financial_reports_company ON financial_reports(portfolioCompanyId, periodEnd);
CREATE INDEX idx_financial_reports_status ON financial_reports(status);
