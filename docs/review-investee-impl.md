# Review: Investee Reporting & Accounting Changes

## Blocking
- FinancialReportService’s post-approval automations still call `PortfolioCompanyAccountingService.recordValuationAdjustment/recordDividend` **without** `authToken`, but the service now requires it and will throw “Missing auth token for accounting posting” before creating JEs. Outcome: accepted reports that include mapping will fail to post accounting entries. File: `src/services/FinancialReportService.ts` (runPostApprovalAutomations) → `PortfolioCompanyAccountingService` now demands `authToken`.  

## High
- Reporting reminder cron emails every portfolio company that lacks a PENDING/ACCEPTED row for the given reportingPeriod, regardless of status (“Active”), open requests, or due-date phase. It conflates “gentle”, “overdue”, and “manual nudge” into one generic call; T-3/T+1 timing, manual nudge trigger, notification logging, and read-receipt updates from the spec are not implemented. Files: `src/services/ReportingReminderService.ts`, `src/controllers/ReportingRemindersCronController.ts`, `src/routes/cronRoutes.ts`.
- Filename enforcement in `FinancialReportService.createReport` now **throws** unless the uploaded filename already matches `[YYYY-MM]_[CompanyName]_[DocType]_vNN.ext`. Current UI doesn’t rename files, so user uploads with natural names will fail at upload. This was a guideline, not previously enforced; impacts all submissions.
- AccountingApiController creates JEs via internal service but does not enforce account-type semantics or prevent use of reporting-bucket accounts; combined with caller changes, this endpoint could accept invalid postings if bypassed from elsewhere. (Type rule enforcement was expected per spec.)

## Medium
- Accounting posting for dividends now requires a bank with a linked GL and rejects accountNo 1000; however controller passes optional `bankId` but does not validate presence. If no active bank exists, posting throws; error is user-facing.
- Submit validation groups selected reportIds by reportingPeriod and enforces all required categories. If a user submits only one doc at a time (common UX), submission fails with “missing required categories”; we don’t stage partial bundles per period before submit.
- Reporting reminders select all portfolio companies (no filter on status or fund) and may email non-active or uninitialized companies.

## Low / Observations
- New accounting API (`/accounting/api/post_journal_entry`) balances totals and checks accountCode is active, but does not enforce account-type semantics; relies on caller to respect double-entry type rules.
- Pagination added to applicant/company report listings is good; defaults (page=1, limit=20) are reasonable.
- Valuation guard now blocks valuationDate ≤ lastReportDate—aligned with requirements.

## Not Implemented (from spec, for visibility)
- Notification timeline with T-3 reminder, T+1 overdue, manual nudge logging, and read-receipt status.
- Reporting request status transition to “Reporting Open” on trigger isn’t wired into the cron/reminder flow.
- Dashboard highlighting of overdue reports and per-request audit log not present in code changes.
