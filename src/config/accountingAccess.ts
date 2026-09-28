// @ts-nocheck
/**
 * Accounting access: which permission each Accounting / Cashbook route needs. One table, applied by
 * `middleware/accountingAccessGuard.ts` in front of every Accounting router, so a route added later is covered by default
 * rather than left open (304 of 420 routes were login-only; login also admits LP, investee and applicant accounts).
 *
 * Keys (held on `roles.permissions`; the tiers that hold them are written by scripts/run-accounting-rbac-migration.ts):
 *   view_accounting / manage_accounting   read / prepare accounting records (preparers: accountants, officers, assistants)
 *   view_ledger / manage_ledger            read the ledger / post, void and reverse journals, run postings (approvers)
 *   view_financial_reports                 statements, trial balance, dashboards
 *   bank_reconciliation                    reconcile bank accounts
 *   accounting.period_lock.*               periods and locks (view, manage, audit_view, override)
 *   accounting.treasury.manage             short-term investments: set up, rate changes, liquidation
 *   accounting.treasury.approve            short-term investments: approve accruals, posting mode (CFO), void
 *   accounting.access.manage               accounting role administration
 * Model and decisions: nvccz-new/design-refs/accounting-sweep/RBAC.md.
 */
export const ACC = {
  VIEW: "view_accounting",
  MANAGE: "manage_accounting",
  LEDGER_VIEW: "view_ledger",
  LEDGER_POST: "manage_ledger",
  REPORTS: "view_financial_reports",
  BANK_REC: "bank_reconciliation",
  PERIOD_VIEW: "accounting.period_lock.view",
  PERIOD_MANAGE: "accounting.period_lock.manage",
  PERIOD_AUDIT: "accounting.period_lock.audit_view",
  PERIOD_OVERRIDE: "accounting.period_lock.override",
  TREASURY: "accounting.treasury.manage",
  TREASURY_APPROVE: "accounting.treasury.approve",
  ACCESS: "accounting.access.manage",
} as const;

const READ_ANY = [ACC.VIEW, ACC.MANAGE, ACC.LEDGER_VIEW, ACC.LEDGER_POST, ACC.REPORTS];
const REPORTS_READ = [ACC.REPORTS, ACC.VIEW, ACC.LEDGER_VIEW, ACC.MANAGE];

export type AccessRule = { read?: string[]; write?: string[]; any?: string[] };
/**
 * Rules by path (after the mount, e.g. "/api/accounting/journal-entries/x/post"), first match wins; "write" means any
 * method other than GET/HEAD/OPTIONS. A rule with `any` applies to every method. `exempt` routes keep only their own
 * router's checks (they are guarded there already, or authenticated by a shared secret).
 */
export const ACCOUNTING_EXEMPT: RegExp[] = [
  // what accounting keys the signed-in user holds, so the UI can gate itself — needed precisely by someone who
  // holds only a narrow key (e.g. accounting.timesheets.view) and so could never reach it if it required a general
  // one first (found live: a timesheets-only employee couldn't even learn they hold accounting.timesheets.view,
  // because GET /accounting/me itself demanded a general key). No side effects; the router excludes portal users itself
  /^\/api\/accounting\/me(\/|$)/,
  /^\/api\/accounting\/vendors(\/|$)/, // supplier master: procurement.vendors.* on the router (and public self-registration)
  /^\/api\/accounting\/timesheets(\/|$)/, // accounting.timesheets.* on the router
  /^\/api\/accounting\/projects(\/|$)/, // accounting.timesheets.* on the router
  /^\/api\/accounting\/claims(\/|$)/, // employee expense claims: every staff member's own; each approval step checked in ExpenseClaimService
  /^\/api\/accounting\/v1(\/|$)/, // portfolio / PE integration: role list on the router
  /^\/api\/accounting\/assets\/depreciation\/cron\//, // scheduled run: shared secret
];

export const ACCOUNTING_RULES: Array<[RegExp, AccessRule]> = [
  // ledger postings: approvers only (maker-checker is enforced again in the service: never one's own entry)
  [/^\/api\/accounting\/journal-entries\/[^/]+\/(post|void|reverse|reversal|approve|reject)(\/|$)/, { any: [ACC.LEDGER_POST] }],
  [/^\/api\/accounting\/journal-entries\/(bulk-post|post-all|approve)/, { any: [ACC.LEDGER_POST] }],
  [/^\/api\/accounting\/recurring-journal-templates\/(run-due|[^/]+\/run|[^/]+\/active)(\/|$)/, { any: [ACC.LEDGER_POST] }],
  // voiding a cashbook entry reverses its posting: approvers only (SRD ACC-CB-15, the "Cashbook Void" permission)
  [/^\/api\/cashbook\/(transactions|reversals|entries)\/.*(revers|void)/, { any: [ACC.LEDGER_POST] }],
  [/^\/api\/cashbook\/(transactions|reversals)(\/|$)/, { read: READ_ANY, write: [ACC.LEDGER_POST] }],
  // receivables: voiding a sent invoice reverses its posted journal, and sending a credit note posts one: approvers
  [/^\/api\/accounting\/invoices\/[^/]+\/void(\/|$)/, { any: [ACC.LEDGER_POST] }],
  [/^\/api\/accounting\/credit-notes\/[^/]+\/(send|approve|post)(\/|$)/, { any: [ACC.LEDGER_POST] }],
  // periods and locks (the date check every posting makes stays open to preparers)
  [/^\/api\/cashbook\/periods\/validate-date\/?$/, { any: [...READ_ANY, ACC.MANAGE] }],
  [/^\/api\/cashbook\/periods(\/|$)/, { read: [ACC.PERIOD_VIEW, ACC.PERIOD_MANAGE, ACC.VIEW], write: [ACC.PERIOD_MANAGE] }],
  [/^\/api\/accounting\/fiscal-calendar(\/|$)/, { read: [ACC.PERIOD_VIEW, ACC.PERIOD_MANAGE, ACC.VIEW, ACC.REPORTS], write: [ACC.PERIOD_MANAGE] }],
  // bank reconciliation
  [/^\/api\/accounting\/bank-reconciliation(\/|$)/, { read: READ_ANY, write: [ACC.BANK_REC] }],
  [/^\/api\/cashbook\/reconciliation(\/|$)/, { read: READ_ANY, write: [ACC.BANK_REC] }],
  // allocating a customer receipt to invoices is receivables work (preparers), not bank reconciliation
  [/^\/api\/cashbook\/open-items(\/|$)/, { read: READ_ANY, write: [ACC.MANAGE] }],
  // payment runs: approving and settling one pays suppliers, so approvers only (preparers create, submit, cancel)
  [/^\/api\/accounting\/payment-runs\/[^/]+\/(approve|settle)(\/|$)/, { any: [ACC.LEDGER_POST] }],
  // a count adjustment writes stock up or off (SRD ACC-INV-06 count variance approval)
  [/^\/api\/accounting\/inventory\/adjustments(\/|$)/, { any: [ACC.LEDGER_POST] }],
  // bank accounts are master data that moves cash: set up and changed by approvers. The list is also read by
  // procurement staff choosing the account a supplier payment is made from (first match wins, so one rule holds both)
  [/^\/api\/cashbook\/banks\/?$/, { read: [...READ_ANY, "procurement.invoices.view", "procurement.invoices.manage"], write: [ACC.LEDGER_POST] }],
  [/^\/api\/cashbook\/banks(\/|$)/, { read: READ_ANY, write: [ACC.LEDGER_POST] }],
  // short-term investments (treasury)
  [/^\/api\/accounting\/short-term-investments\/(settings|config|posting-mode|accruals\/[^/]+\/approve|accruals\/approve-all|instruments\/[^/]+\/accruals\/approve|instruments\/[^/]+\/void)/, { read: READ_ANY, write: [ACC.TREASURY_APPROVE] }],
  [/^\/api\/accounting\/short-term-investments\/instruments\/[^/]+\/?$/, { read: READ_ANY, write: [ACC.TREASURY] }],
  [/^\/api\/accounting\/short-term-investments(\/|$)/, { read: READ_ANY, write: [ACC.TREASURY] }],
  // postings made by a run: depreciation, FX revaluation
  [/^\/api\/accounting\/assets\/depreciation(\/|$)/, { read: READ_ANY, write: [ACC.LEDGER_POST] }],
  [/^\/api\/accounting\/assets\/[^/]+\/(depreciation|depreciate|backfill|dispose|disposal|impair|revalue)/, { read: READ_ANY, write: [ACC.LEDGER_POST] }],
  // the month-end revaluation (/revaluation) is prepared by a preparer as a draft an approver posts; the older direct
  // postings stay with approvers
  [/^\/api\/accounting\/multi-currency\/(banks\/[^/]+\/revalu|post-forex-gain-loss)/, { read: READ_ANY, write: [ACC.LEDGER_POST] }],
  // scheduled jobs: readers see them; running one now or switching it is for people who may post to the ledger
  [/^\/api\/accounting\/jobs(\/|$)/, { read: READ_ANY, write: [ACC.LEDGER_POST] }],
  // statements and reports
  [/^\/api\/accounting\/(income-statement|cash-flow|balance-sheet|statement-of-equity|trial-balance|gl-ledger-detail|consolidation|dashboard|statements)(\/|$)/, { any: REPORTS_READ }], // "generate" is a POST that only reads
  [/^\/api\/vat(\/|$)/, { read: REPORTS_READ, write: [ACC.MANAGE] }],
];
export const ACCOUNTING_DEFAULT: AccessRule = { read: READ_ANY, write: [ACC.MANAGE] };
