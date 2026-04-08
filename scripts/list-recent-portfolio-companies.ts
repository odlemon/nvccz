/**
 * List recent portfolio companies to help locate an investee for testing.
 *
 * Usage:
 *   npx ts-node scripts/list-recent-portfolio-companies.ts [take]
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";

async function main() {
  const take = Math.min(200, Math.max(1, Number(process.argv[2] || 50)));
  const rows = await prisma.portfolioCompany.findMany({
    select: { id: true, name: true, industry: true, status: true, user: { select: { email: true } } },
    take,
    orderBy: { createdAt: "desc" },
  });

  for (const r of rows) {
    console.log(
      `${r.id}\t${r.status}\t${(r.industry || "").slice(0, 30)}\t${r.name}\t${r.user?.email ?? ""}`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

