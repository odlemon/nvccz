// @ts-nocheck
/**
 * Zero-Balance Suppression – Trial Balance with "Hide Zero Balances" checked
 *
 * Requirement: Generate a Trial Balance with "Hide Zero Balances" checked.
 * Expected: Accounts with no transactions and zero balance are omitted from the view to reduce clutter.
 *
 * Run: npx ts-node scripts/test-trial-balance-hide-zero-balances.ts
 */
import { TrialBalanceService } from "../src/services/TrialBalanceService";

const failures: string[] = [];
const TOLERANCE = 0.01;

function assert(condition: boolean, msg: string) {
  if (!condition) failures.push(msg);
}

async function main() {
  console.log("=== Trial Balance – Hide Zero Balances (zero-balance suppression) ===\n");

  const asOf = new Date();
  asOf.setHours(23, 59, 59, 999);

  const full = await TrialBalanceService.generateTrialBalance(asOf, undefined, undefined, false);
  const suppressed = await TrialBalanceService.generateTrialBalance(asOf, undefined, undefined, true);

  assert(Array.isArray(full.accounts) && Array.isArray(suppressed.accounts), "Both runs must return accounts arrays");
  assert(
    suppressed.accounts.length <= full.accounts.length,
    "With hideZeroBalances=true, account count must be less than or equal to full"
  );

  const zeroBalanceInFull = full.accounts.filter(
    (a) => (a.debitBalance || 0) < TOLERANCE && (a.creditBalance || 0) < TOLERANCE
  );
  for (const acc of suppressed.accounts) {
    const hasBalance = (acc.debitBalance || 0) >= TOLERANCE || (acc.creditBalance || 0) >= TOLERANCE;
    assert(hasBalance, `Suppressed view must not include zero-balance accounts; found ${acc.accountNo} ${acc.accountName}`);
  }

  assert(
    suppressed.totals && typeof suppressed.totals.totalDebits === "number" && typeof suppressed.totals.totalCredits === "number",
    "Totals must still be present when hiding zero balances"
  );

  console.log("Full trial balance accounts:", full.accounts.length);
  console.log("Zero-balance accounts in full:", zeroBalanceInFull.length);
  console.log("Suppressed (hide zero) accounts:", suppressed.accounts.length);
  console.log("Totals (suppressed): debits", suppressed.totals.totalDebits, "credits", suppressed.totals.totalCredits, "balanced:", suppressed.totals.isBalanced);

  if (failures.length > 0) {
    console.error("\n❌ FAILED:");
    failures.forEach((f) => console.error("  -", f));
    process.exit(1);
  }

  console.log("\n✅ PASSED: Trial Balance with Hide Zero Balances omits zero-balance accounts from the view.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
