/**
 * Expense category **names** (must match `expense_categories.name` / `ExpenseService` `category` string)
 * that count toward **VC company** Customer Acquisition Cost (all-time marketing spend numerator).
 *
 * This is the source of truth — not `.env` defaults. Seeding / DB ensure uses the same list.
 * Optional extra names: set `VC_CAC_MARKETING_CATEGORY_NAMES_EXTRA` (comma‑separated) for environment-specific lines only.
 */
export const VC_CAC_MARKETING_EXPENSE_CATEGORY_NAMES: readonly string[] = [
  "Branding and Marketing", // primary seed from `scripts/seed-expense-categories.ts`
  "Marketing",
  "Marketing & Advertising",
  "Advertising"
];
