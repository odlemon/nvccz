/**
 * Read-only: loads Board scorecard through PerformanceScorecardService.getBoardScorecard
 * (same code path as GET /api/performance/scorecards/board) and prints a short summary.
 *
 * Run: npx ts-node scripts/verify-board-scorecard-flow.ts
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import { PerformanceScorecardService } from "../src/services/PerformanceScorecardService";

async function main() {
  const u = await prisma.user.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true, firstName: true, lastName: true, email: true, role: true }
  });
  if (!u) {
    console.log("No users in DB — cannot run.");
    return;
  }

  const viewer = u;
  const data: any = await PerformanceScorecardService.getBoardScorecard({
    viewer,
    periodLabel: "2026"
  });

  const { sections, scores, contract, warnings } = data;
  console.log("=== Board scorecard (service path = HTTP GET board) ===\n");
  console.log("contract:", contract?.id, contract?.title, contract?.periodLabel);
  console.log("finalScore:", scores?.finalScore, "label:", scores?.performanceLabel);
  console.log("warnings:", warnings?.length ?? 0, warnings);
  for (const key of ["A1", "A2", "B", "C", "D"] as const) {
    const s = sections[key];
    if (!s) continue;
    const n = s.indicators?.length ?? 0;
    const names = (s.indicators || []).map((i: { indicatorName?: string }) => i.indicatorName).filter(Boolean);
    console.log(
      `  ${key} ${s.label} — sectionScore=${s.sectionScore} label=${s.performanceLabel} indicators=${n}`,
      n ? `e.g. ${names[0]}` : ""
    );
  }
  console.log("\nDone. Full HTTP: GET /api/performance/scorecards/board?periodLabel=2026 (auth required).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
