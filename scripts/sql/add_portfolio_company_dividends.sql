-- Create portfolio_company_dividends table for dividend tracking
-- Run manually (do not use prisma migrate)

CREATE TABLE IF NOT EXISTS portfolio_company_dividends (
  id VARCHAR(191) COLLATE utf8mb4_unicode_ci PRIMARY KEY,
  portfolioCompanyId VARCHAR(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  dividendDate DATE NOT NULL,
  approvedById VARCHAR(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  journalEntryId VARCHAR(191) COLLATE utf8mb4_unicode_ci,
  notes TEXT COLLATE utf8mb4_unicode_ci,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_pcdividends_company FOREIGN KEY (portfolioCompanyId) REFERENCES portfolio_companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_pcdividends_user FOREIGN KEY (approvedById) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_pcdividends_journal FOREIGN KEY (journalEntryId) REFERENCES journal_entries(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_pcdividends_company ON portfolio_company_dividends(portfolioCompanyId, dividendDate DESC);
