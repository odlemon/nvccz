/**
 * Times PerformanceScorecardService.getEmployeeScorecard with persist=true.
 *
 * Usage:
 *   npx ts-node scripts/bench-employee-scorecard-generate.ts [employeeUserId]
 *
 * Without args: picks the first employee who has an active EMPLOYEE contract in 2026.
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import { PerformanceScorecardService } from "../src/services/PerformanceScorecardService";
import { isAdminViewer, isCEO, isHRLeader } from "../src/services/performanceScorecardSupport";

async function main() {
  let employeeUserId = process.argv[2];

  if (!employeeUserId) {
    const contract = await prisma.performanceContract.findFirst({
      where: {
        contractType: "EMPLOYEE",
        status: { notIn: ["ARCHIVED", "CANCELLED"] },
        subjectUserId: { not: null },
        periodStart: { lte: new Date("2026-12-31T23:59:59.999Z") },
        periodEnd: { gte: new Date("2026-01-01T00:00:00.000Z") }
      },
      select: { subjectUserId: true }
    });
    if (!contract?.subjectUserId) {
      console.error("No active EMPLOYEE contract found for 2026.");
      process.exit(1);
    }
    employeeUserId = contract.subjectUserId;
  }

  const users = await prisma.user.findMany({ take: 80, include: { role: true } });
  const viewer =
    users.find((u) => isAdminViewer(u) || isCEO(u) || isHRLeader(u)) ||
    users.find((u) => u.id !== employeeUserId);

  if (!viewer) {
    console.error("No suitable viewer user found.");
    process.exit(1);
  }

  const periodStart = "2026-01-01T00:00:00.000Z";
  const periodEnd = "2026-12-31T23:59:59.999Z";

  const t0view = process.hrtime.bigint();
  const viewResult = await PerformanceScorecardService.getEmployeeScorecard({
    viewer,
    employeeUserId,
    periodStart,
    periodEnd,
    periodLabel: "2026",
    persist: false,
    meta: {}
  });
  const viewMs = Number(process.hrtime.bigint() - t0view) / 1e6;

  const t0gen = process.hrtime.bigint();
  const result = await PerformanceScorecardService.getEmployeeScorecard({
    viewer,
    employeeUserId,
    periodStart,
    periodEnd,
    periodLabel: "2026",
    persist: true,
    meta: {}
  });
  const genMs = Number(process.hrtime.bigint() - t0gen) / 1e6;

  console.log(
    JSON.stringify({
      employeeUserId,
      employeeName: result.employee?.name,
      viewerId: viewer.id,
      goalCount: result.goals?.length,
      finalScore: result.scores?.finalScore,
      viewMs: Math.round(viewMs * 100) / 100,
      generateMs: Math.round(genMs * 100) / 100,
      totalMs: Math.round((viewMs + genMs) * 100) / 100
    })
  );
  if (genMs >= 5000) {
    console.error("SLOW: generate >= 5s threshold");
    process.exit(2);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
