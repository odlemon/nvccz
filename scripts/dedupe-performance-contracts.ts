/**
 * Finds duplicate ACTIVE performance contracts (same type + same UTC annual period + same entity
 * keys) and deletes the newer rows, keeping the **oldest** by `createdAt`.
 *
 * Run: npm run db:dedupe:performance-contracts
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";

const ACTIVE = { notIn: ["ARCHIVED", "CANCELLED"] as string[] };

function dedupeKey(r: {
  contractType: string;
  periodStart: Date;
  periodEnd: Date;
  subjectUserId: string | null;
  departmentName: string | null;
}): string {
  return [
    r.contractType,
    r.periodStart.toISOString(),
    r.periodEnd.toISOString(),
    r.subjectUserId ?? "",
    (r.departmentName ?? "").trim()
  ].join("\t");
}

async function clearFksForContractIds(ids: string[]) {
  if (ids.length === 0) return;
  const g = await prisma.performanceGoal.updateMany({
    where: { performanceContractId: { in: ids } },
    data: { performanceContractId: null }
  });
  const s = await prisma.performanceScorecard.updateMany({
    where: { contractId: { in: ids } },
    data: { contractId: null }
  });
  if (g.count || s.count) {
    console.log(`  cleared FKs: goals ${g.count}, scorecards ${s.count}`);
  }
}

async function main() {
  const rows = await prisma.performanceContract.findMany({
    where: { status: ACTIVE },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      contractType: true,
      periodStart: true,
      periodEnd: true,
      subjectUserId: true,
      departmentName: true,
      createdAt: true,
      status: true
    }
  });

  const buckets = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = dedupeKey(r);
    const arr = buckets.get(k) ?? [];
    arr.push(r);
    buckets.set(k, arr);
  }

  const toDelete: string[] = [];
  for (const [, arr] of buckets.entries()) {
    if (arr.length <= 1) continue;
    const [, ...newer] = arr;
    console.log(
      `Duplicate key (${arr[0].contractType}, period ${arr[0].periodStart.toISOString().slice(0, 10)}→${arr[0].periodEnd.toISOString().slice(0, 10)}): ${arr.length} rows; keeping oldest id=${arr[0].id}`
    );
    for (const x of newer) {
      toDelete.push(x.id);
      console.log(`  will delete newer id=${x.id} createdAt=${x.createdAt.toISOString()}`);
    }
  }

  if (toDelete.length === 0) {
    console.log("No duplicate ACTIVE performance contracts found.");
    return;
  }

  await clearFksForContractIds(toDelete);
  const del = await prisma.performanceContract.deleteMany({
    where: { id: { in: toDelete } }
  });
  console.log(`Deleted ${del.count} duplicate performance contract row(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
