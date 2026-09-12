// @ts-nocheck
/** Run Trial Balance (12 months, includeTransactionDetails=false) and print elapsed ms. No seed. */
import { TrialBalanceService } from "../src/services/TrialBalanceService";

async function main() {
  const end = new Date();
  const start = new Date(end.getFullYear() - 1, end.getMonth(), 1, 0, 0, 0, 0);
  const endCap = new Date(end);
  endCap.setHours(23, 59, 59, 999);

  console.log("Running Trial Balance (12 months, includeTransactionDetails=false)...");
  const t0 = Date.now();
  const result = await TrialBalanceService.generateTrialBalance(endCap, start, endCap, false, false);
  const elapsed = Date.now() - t0;

  console.log("Accounts:", result.accounts.length);
  console.log("Totals - Debits:", result.totals.totalDebits, "Credits:", result.totals.totalCredits);
  console.log("Generation time:", elapsed, "ms");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
