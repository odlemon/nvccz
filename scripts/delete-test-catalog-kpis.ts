/**
 * Removes sample KPI rows created via Postman / tests. Idempotent.
 * Run: npm run db:cleanup:test-kpis
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const NAMES = ["Test KPI", "Test KPI Postman", "Test KPI - Postman"];

async function main() {
  const r = await prisma.kPI.deleteMany({
    where: { name: { in: NAMES } },
  });
  console.log(`[ok] deleted ${r.count} kpis row(s) matching test names`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
