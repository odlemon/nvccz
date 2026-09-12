/**
 * Deletes all rows from `performance_contracts` after clearing FKs from goals and scorecards.
 * Use to reset performance-contract UAT / local testing (destructive).
 *
 * Run: npm run db:cleanup:performance-contracts
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";

async function main() {
  const before = await prisma.performanceContract.count();
  console.log(`performance_contracts rows before: ${before}`);

  const goals = await prisma.performanceGoal.updateMany({
    where: { performanceContractId: { not: null } },
    data: { performanceContractId: null }
  });
  console.log(`performance_goals cleared (performanceContractId): ${goals.count}`);

  const scorecards = await prisma.performanceScorecard.updateMany({
    where: { contractId: { not: null } },
    data: { contractId: null }
  });
  console.log(`performance_scorecards cleared (contractId): ${scorecards.count}`);

  const del = await prisma.performanceContract.deleteMany({});
  console.log(`performance_contracts deleted: ${del.count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
