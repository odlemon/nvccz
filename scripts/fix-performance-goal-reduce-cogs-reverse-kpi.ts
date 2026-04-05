/**
 * Optional one-off: set `isReverseKpi` for goals whose titles indicate COGS / cost-of-goods reduction
 * (Org BSC audit O5).
 *
 * Run: npm run db:fix:performance-goal-reduce-cogs-reverse-kpi
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";

const RE = /\b(reduce\s+cogs|cogs|cost\s+of\s+goods)\b/i;

async function main() {
  const goals = await prisma.performanceGoal.findMany({
    where: { type: "company" },
    select: { id: true, title: true, isReverseKpi: true }
  });

  const matches = goals.filter((g) => RE.test(String(g.title || "")));
  console.log(`[info] company goals matching COGS title pattern: ${matches.length}`);

  for (const g of matches) {
    if (g.isReverseKpi) {
      console.log(`[skip] ${g.id} already isReverseKpi`);
      continue;
    }
    await prisma.performanceGoal.update({
      where: { id: g.id },
      data: { isReverseKpi: true }
    });
    console.log(`[ok] ${g.id} ${JSON.stringify(g.title)}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
