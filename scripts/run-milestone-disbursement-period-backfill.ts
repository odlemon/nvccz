/**
 * Backfill default period milestone for legacy MILESTONE_BASED implementations
 * that have no milestones yet. Idempotent.
 *
 * Run: npm run db:migrate:milestone-period-backfill
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.investmentImplementation.findMany({
    where: { disbursementMode: "MILESTONE_BASED" },
    select: {
      id: true,
      totalCommittedAmount: true,
      createdAt: true,
      milestones: { select: { id: true }, take: 1 },
    },
  });

  let created = 0;
  let skippedHasMilestones = 0;
  let skippedNoAmount = 0;

  for (const impl of rows) {
    if (impl.milestones.length > 0) {
      skippedHasMilestones++;
      continue;
    }
    const amt = impl.totalCommittedAmount ? new Decimal(impl.totalCommittedAmount as any) : null;
    if (!amt || !amt.isFinite() || amt.lte(0)) {
      skippedNoAmount++;
      continue;
    }

    const dueDate = new Date(impl.createdAt);
    dueDate.setDate(dueDate.getDate() + 30);

    await prisma.investmentMilestone.create({
      data: {
        investmentImplementationId: impl.id,
        title: "Disbursement Period 1",
        description: "Auto-generated default period for legacy milestone-based implementation",
        amount: amt,
        dueDate,
        notes: "Backfilled by db:migrate:milestone-period-backfill",
      },
    });
    created++;
  }

  console.log(`[ok] backfill complete`);
  console.log(`  checked: ${rows.length}`);
  console.log(`  created: ${created}`);
  console.log(`  skipped(has milestones): ${skippedHasMilestones}`);
  console.log(`  skipped(no totalCommittedAmount): ${skippedNoAmount}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

