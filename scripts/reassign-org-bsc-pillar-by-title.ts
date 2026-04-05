/**
 * One-off data repair: set `scorecardPillar` / `pillar_id` on organisational (`type = company`)
 * goals where pillar is missing, using title keyword heuristics (Org BSC audit O1).
 *
 * Run: npm run db:migrate:org-bsc-pillar-by-title
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import {
  normalizeOrgBscScorecardPillar,
  ORG_BSC_CANONICAL_TO_PILLAR_ID
} from "../src/services/performanceScorecardSupport";

type Rule = { test: (title: string) => boolean; pillar: string };

/** First match wins; conservative ordering (specific before broad). */
const TITLE_RULES: Rule[] = [
  {
    test: (t) =>
      /\b(hr|human resources|human resource|training|learning|capability|skills|workforce|engagement survey)\b/i.test(
        t
      ),
    pillar: "Learning, Growth & HR"
  },
  {
    test: (t) =>
      /\b(customer|market|client satisfaction|brand|nps|net promoter|stakeholder satisfaction)\b/i.test(t),
    pillar: "Customer & Market"
  },
  {
    test: (t) =>
      /\b(operations|operational excellence|process|internal control|compliance rate|efficiency)\b/i.test(t),
    pillar: "Internal Operations"
  },
  {
    test: (t) =>
      /\b(financial|revenue|profit|irr|aum|ebitda|budget|roe|liquidity|funding)\b/i.test(t),
    pillar: "Financial"
  }
];

function inferPillarFromTitle(title: string): string {
  const t = String(title || "").trim();
  for (const r of TITLE_RULES) {
    if (r.test(t)) return r.pillar;
  }
  return "Financial";
}

async function main() {
  const goals = await prisma.performanceGoal.findMany({
    where: {
      type: "company",
      OR: [{ scorecardPillar: null }, { scorecardPillar: "" }]
    },
    select: { id: true, title: true, scorecardPillar: true }
  });

  console.log(`[info] company goals with empty scorecardPillar: ${goals.length}`);

  let updated = 0;
  for (const g of goals) {
    const canonical = inferPillarFromTitle(g.title);
    const normalized = normalizeOrgBscScorecardPillar(canonical);
    if (!normalized) continue;
    await prisma.performanceGoal.update({
      where: { id: g.id },
      data: {
        scorecardPillar: normalized,
        pillarId: ORG_BSC_CANONICAL_TO_PILLAR_ID[normalized] ?? null
      }
    });
    updated += 1;
    const short = (g.title || "").length > 70 ? `${(g.title || "").slice(0, 70)}…` : g.title || "";
    console.log(`[ok] ${g.id} "${short}" -> ${normalized}`);
  }

  console.log(`[done] updated ${updated} row(s)`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
