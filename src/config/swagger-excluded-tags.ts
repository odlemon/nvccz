/**
 * Swagger UI trims: hide heavy legacy sections from the published OpenAPI spec.
 * API routes remain active — only documentation is pruned.
 */

import { PHASE_TWO_SCORECARD_EDITING_TAG } from './phase-two-scorecard-editing-swagger-paths';
import { PHASE_TWO_PDF_UPLOADS_TAG } from './phase-two-pdf-uploads-swagger-paths';
import { FORECASTING_ENGINE_TAG } from './forecasting-engine-swagger-paths';
import { PAYROLL_EMPLOYMENT_TRAINING_TAG } from './payroll-employment-training-swagger-paths';
import { FUND_PERFORMANCE_REPORTING_TAG } from './fund-performance-reporting-swagger-paths';
import { LP_PORTAL_TAG } from './lp-portal-swagger-paths';
import { INVESTMENT_MEMO_EDITING_TAG } from './investment-memo-editing-swagger-paths';

/** Tags whose operations are removed unless the operation also carries a protected tag. */
export const SWAGGER_EXCLUDED_TAGS = new Set([
  'Performance collaboration and notifications',
  'Performance UAT (Tasks & board)',
  'Performance UAT (Balanced Scorecard)',
  'Performance Config',
  'Performance Goals',
  'performance-kpis',
  'Inventory Management',
  'Asset Management',
  'Bank Reconciliation',
  'Credit Notes',
  'Multi-Currency',
  'Statement of Accounts',
  'Balance Sheet',
  'Income Statement',
  'Cash Flow Statement',
  'Trial Balance',
  'General Ledger Reports',
  'Accounting - Balance Sheet',
  'Accounting - Income Statement',
  'Hardcoded Roles',
  '🔄 Stage 5: Data Synchronization',
  '📋 Task Management Integration',
  '💰 Accounting Integration',
  'Task assignment',
  '📊 Hardcoded KPIs',
  '📈 Roll-up Calculations',
  '📈 Stage 3: Roll-up Calculation',
  '📊 Performance Analytics',
  '🏢 Portfolio Management',
  '🏢 Stage 6: Portfolio Management',
  'Cashbook',
  'Cashbook Transfers',
  'Newsletters',
  'Newsletter Subscription',
  'Accounting - Currencies',
  'Accounting - Vendors',
  'Accounting - Expenses',
  'Accounting - Invoices',
  'Accounting - Customers',
  'Open Items',
  'Open Item Matching',
  'Transaction Reversal',
  'Entry Types Management',
  'Contra Entries',
  '📝 Stage 1: Application Submission',
  '📝 Stage 0: Shortlist',
  '🔍 Stage 2: Due Diligence',
  'Term Sheets',
  '📋 Stage 4: Term Sheet',
  '💼 Stage 5: Investment Implementation',
  'Investment Implementation',
  '📊 Performance Scorecards',
  'Performance Scorecards',
  '🎯 Stage 1: Goal Setting',
  '📊 Stage 2: Progress Tracking',
  '🏢 Hardcoded Departments',
  'Control Account Integration',
  'Reviews UAT (Review cycles & independent evaluation)',
  '🗳️ Voting Process',
  'Updated investment flow'
]);

/** Operations with any of these tags are kept even when they also match an excluded tag. */
export const SWAGGER_PROTECTED_TAGS = new Set([
  PHASE_TWO_SCORECARD_EDITING_TAG,
  PHASE_TWO_PDF_UPLOADS_TAG,
  FORECASTING_ENGINE_TAG,
  PAYROLL_EMPLOYMENT_TRAINING_TAG,
  FUND_PERFORMANCE_REPORTING_TAG,
  LP_PORTAL_TAG,
  INVESTMENT_MEMO_EDITING_TAG,
  'Updated performance'
]);

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head']);

function operationTags(op: unknown): string[] {
  if (!op || typeof op !== 'object') return [];
  const tags = (op as { tags?: unknown }).tags;
  return Array.isArray(tags) ? tags.filter((t): t is string => typeof t === 'string') : [];
}

function collectTagsFromPaths(paths: Record<string, unknown>): Set<string> {
  const tagsUsed = new Set<string>();
  for (const pathItem of Object.values(paths ?? {})) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const [key, op] of Object.entries(pathItem as Record<string, unknown>)) {
      if (!HTTP_METHODS.has(key)) continue;
      for (const t of operationTags(op)) tagsUsed.add(t);
    }
  }
  return tagsUsed;
}

export interface ProtectedSwaggerModule {
  paths: Record<string, unknown>;
  tagName: string;
  tagDefinition?: { name: string; description?: string };
}

/**
 * Re-merge protected module paths after prune so /api-docs always lists them in production
 * (same guarantee as vendor master Suite 01 last-merge in swagger.ts).
 */
export function applyProtectedSwaggerModules<T extends { paths?: Record<string, unknown>; tags?: unknown[] }>(
  spec: T,
  modules: ProtectedSwaggerModule[]
): T {
  const mergedPaths: Record<string, unknown> = { ...(spec.paths ?? {}) };
  for (const mod of modules) {
    Object.assign(mergedPaths, mod.paths);
  }

  const tagDefs: Array<{ name: string; description?: string }> = Array.isArray(spec.tags)
    ? [...(spec.tags as Array<{ name: string; description?: string }>)]
    : [];
  const existingTagNames = new Set(tagDefs.map((t) => t.name));

  for (const mod of modules) {
    if (mod.tagDefinition && !existingTagNames.has(mod.tagName)) {
      tagDefs.push(mod.tagDefinition);
      existingTagNames.add(mod.tagName);
    }
  }

  // If tag defs were pruned but paths remain, restore from module tagDefinition.
  const tagsUsed = collectTagsFromPaths(mergedPaths);
  for (const mod of modules) {
    if (tagsUsed.has(mod.tagName) && mod.tagDefinition && !existingTagNames.has(mod.tagName)) {
      tagDefs.push(mod.tagDefinition);
      existingTagNames.add(mod.tagName);
    }
  }

  return {
    ...spec,
    paths: mergedPaths,
    tags: tagDefs,
  };
}

function shouldRemoveOperation(op: unknown): boolean {
  const tags = operationTags(op);
  if (!tags.length) return false;
  if (tags.some((t) => SWAGGER_PROTECTED_TAGS.has(t))) return false;
  return tags.some((t) => SWAGGER_EXCLUDED_TAGS.has(t));
}

export function pruneSwaggerSpecByExcludedTags<T extends { paths?: Record<string, unknown>; tags?: unknown[] }>(
  spec: T
): T {
  const paths = spec.paths ?? {};
  const prunedPaths: Record<string, unknown> = {};
  const tagsUsed = new Set<string>();

  for (const [pathKey, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    const nextPathItem: Record<string, unknown> = {};
    let hasOp = false;

    for (const [key, value] of Object.entries(pathItem as Record<string, unknown>)) {
      if (!HTTP_METHODS.has(key)) {
        nextPathItem[key] = value;
        continue;
      }
      if (shouldRemoveOperation(value)) continue;
      nextPathItem[key] = value;
      hasOp = true;
      for (const t of operationTags(value)) tagsUsed.add(t);
    }

    const opCount = Object.keys(nextPathItem).filter((k) => HTTP_METHODS.has(k)).length;
    if (opCount > 0) {
      prunedPaths[pathKey] = nextPathItem;
    }
  }

  const prunedTagDefs = Array.isArray(spec.tags)
    ? spec.tags.filter((tag: any) => {
        const name = tag?.name;
        return typeof name === 'string' && tagsUsed.has(name);
      })
    : spec.tags;

  return {
    ...spec,
    paths: prunedPaths,
    tags: prunedTagDefs
  };
}
