import "dotenv/config";
import { prisma } from "../src/utils/database";

async function main() {
  const camps = await prisma.fundraisingCampaign.findMany({
    select: { id: true, name: true, startDate: true, closeDate: true, status: true, targetCapital: true, primaryCurrency: true, createdAt: true, updatedAt: true },
  });
  for (const c of camps) {
    console.log(JSON.stringify(c));
  }
}
main().finally(() => prisma.$disconnect());
