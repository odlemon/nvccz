import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const reportId = String(process.argv[2] || "").trim();
  if (!reportId) {
    console.error("Usage: npx ts-node scripts/revert-financial-report-to-pending.ts <reportId>");
    process.exitCode = 2;
    return;
  }

  const rows: any[] = await prisma.$queryRawUnsafe(
    `SELECT id, status, reviewerId, reviewedAt, reviewerComment
       FROM financial_reports
      WHERE id = ?
      LIMIT 1`,
    reportId
  );
  const existing = rows[0] || null;

  if (!existing) {
    console.error(`Report not found: ${reportId}`);
    process.exitCode = 1;
    return;
  }

  await prisma.$executeRawUnsafe(
    `UPDATE financial_reports
        SET status = 'PENDING',
            reviewerId = NULL,
            reviewedAt = NULL,
            reviewerComment = NULL,
            updatedAt = NOW()
      WHERE id = ?`,
    reportId
  );

  console.log(
    `✅ Reverted financial report ${reportId} from ${existing.status} to PENDING (cleared reviewer fields).`
  );
}

main()
  .catch((e) => {
    console.error("❌ Failed to revert report:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

