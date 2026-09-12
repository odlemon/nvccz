/**
 * Remove all ACTIVE CEO performance contracts (unlink goals + delete related scorecards first).
 *
 * Dry run:  npm run db:delete:active-ceo-contracts
 * Apply:     npm run db:delete:active-ceo-contracts -- --apply
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";

const APPLY = process.argv.includes("--apply");

const ACTIVE = { notIn: ["ARCHIVED", "CANCELLED"] as string[] };

async function main() {
  const contracts = await prisma.performanceContract.findMany({
    where: {
      contractType: { in: ["CEO", "ceo"] },
      status: ACTIVE
    },
    select: {
      id: true,
      title: true,
      periodLabel: true,
      periodStart: true,
      periodEnd: true,
      status: true
    },
    orderBy: { updatedAt: "desc" }
  });

  console.log(`\n=== Delete ACTIVE CEO performance contracts (${APPLY ? "APPLY" : "DRY RUN"}) ===\n`);
  console.log(`Found ${contracts.length} ACTIVE CEO contract(s)\n`);

  if (!contracts.length) {
    console.log("Nothing to delete.");
    return;
  }

  const contractIds = contracts.map((c) => c.id);

  const [goalCount, scorecardCount] = await Promise.all([
    prisma.performanceGoal.count({
      where: { performanceContractId: { in: contractIds } }
    }),
    prisma.performanceScorecard.count({
      where: { contractId: { in: contractIds } }
    })
  ]);

  for (const c of contracts) {
    const goals = await prisma.performanceGoal.count({
      where: { performanceContractId: c.id }
    });
    const sc = await prisma.performanceScorecard.count({
      where: { contractId: c.id }
    });
    console.log(`  ${c.id}  ${c.periodLabel ?? ""}  ${c.title ?? ""}`);
    console.log(`    linked goals: ${goals}, scorecards: ${sc}`);
  }

  console.log(`\nTotals: ${goalCount} goal(s) to unlink, ${scorecardCount} scorecard(s) to delete\n`);

  if (!APPLY) {
    console.log("Pass --apply to unlink goals, delete scorecards, and delete these contracts.");
    return;
  }

  const unlinked = await prisma.performanceGoal.updateMany({
    where: { performanceContractId: { in: contractIds } },
    data: { performanceContractId: null }
  });

  const deletedScorecards = await prisma.performanceScorecard.deleteMany({
    where: { contractId: { in: contractIds } }
  });

  const deletedContracts = await prisma.performanceContract.deleteMany({
    where: { id: { in: contractIds } }
  });

  console.log(`Unlinked goals: ${unlinked.count}`);
  console.log(`Deleted scorecards: ${deletedScorecards.count}`);
  console.log(`Deleted CEO contracts: ${deletedContracts.count}`);
  console.log("\nDone. Recreate via POST /api/performance/contracts/ceo to backfill company goals.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
