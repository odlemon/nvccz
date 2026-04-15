/**
 * Times PerformanceScorecardService.getDepartmentScorecard with persist=true (same work as POST generate).
 *
 * Usage:
 *   npx ts-node scripts/bench-department-scorecard-generate.ts [departmentName]
 *
 * Requires DATABASE_URL. Picks first user who can generate (admin / HR / CEO / Finance HEAD).
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import { PerformanceScorecardService } from "../src/services/PerformanceScorecardService";
import {
  isAdminViewer,
  isCEO,
  isDepartmentManager,
  isHRLeader
} from "../src/services/performanceScorecardSupport";

async function main() {
  const departmentName = process.argv[2] || "Finance";

  const users = await prisma.user.findMany({
    take: 80,
    include: { role: true }
  });

  const viewer =
    users.find((u) => isAdminViewer(u) || isCEO(u) || isHRLeader(u)) ||
    users.find((u) => isDepartmentManager(u, departmentName));

  if (!viewer) {
    console.error("No suitable viewer user found in first 80 users.");
    process.exit(1);
  }

  const periodStart = "2026-01-01T00:00:00.000Z";
  const periodEnd = "2026-12-31T23:59:59.999Z";

  const t0 = process.hrtime.bigint();
  await PerformanceScorecardService.getDepartmentScorecard({
    viewer,
    departmentName,
    periodStart,
    periodEnd,
    periodLabel: "2026",
    persist: true,
    meta: {}
  });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;

  console.log(JSON.stringify({ departmentName, viewerId: viewer.id, elapsedMs: Math.round(ms * 100) / 100 }));
  if (ms >= 10_000) {
    console.error("SLOW: >= 10s threshold");
    process.exit(2);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
