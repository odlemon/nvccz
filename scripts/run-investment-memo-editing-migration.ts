/**
 * Investment Memo Editing — schema.
 * Idempotent. Run: npm run db:migrate:investment-memo-editing
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    name
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function main() {
  if (!(await tableExists("investment_memos"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`investment_memos\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`application_id\` VARCHAR(191) NOT NULL,
        \`board_review_id\` VARCHAR(191) NULL,
        \`workflow_status\` VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
        \`current_version_id\` VARCHAR(191) NULL,
        \`approved_version_id\` VARCHAR(191) NULL,
        \`approved_by_id\` VARCHAR(191) NULL,
        \`approved_at\` DATETIME(3) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`investment_memos_application_id_key\` (\`application_id\`),
        UNIQUE INDEX \`investment_memos_board_review_id_key\` (\`board_review_id\`),
        INDEX \`investment_memos_status_idx\` (\`workflow_status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] investment_memos");
  } else {
    console.log("[skip] investment_memos");
  }

  if (!(await tableExists("investment_memo_versions"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`investment_memo_versions\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`memo_id\` VARCHAR(191) NOT NULL,
        \`version_number\` INT NOT NULL,
        \`sections\` JSON NOT NULL,
        \`attachment_url\` TEXT NULL,
        \`attachment_file_name\` VARCHAR(512) NULL,
        \`attachment_sha256\` VARCHAR(64) NULL,
        \`change_summary\` TEXT NULL,
        \`validation_passed\` BOOLEAN NOT NULL DEFAULT false,
        \`validation_errors\` JSON NULL,
        \`version_status\` VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`submitted_at\` DATETIME(3) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`investment_memo_versions_memo_num_key\` (\`memo_id\`, \`version_number\`),
        INDEX \`investment_memo_versions_memo_idx\` (\`memo_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] investment_memo_versions");
  } else {
    console.log("[skip] investment_memo_versions");
  }

  if (!(await tableExists("investment_memo_approval_events"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`investment_memo_approval_events\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`memo_id\` VARCHAR(191) NOT NULL,
        \`version_id\` VARCHAR(191) NOT NULL,
        \`action\` VARCHAR(32) NOT NULL,
        \`actor_id\` VARCHAR(191) NOT NULL,
        \`comment\` TEXT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`investment_memo_approval_events_memo_idx\` (\`memo_id\`, \`created_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] investment_memo_approval_events");
  } else {
    console.log("[skip] investment_memo_approval_events");
  }

  // Backfill from existing board_reviews
  const legacy = await prisma.$queryRawUnsafe<
    Array<{
      applicationId: string;
      board_review_id: string;
      recommendation_report: string | null;
      overall_score: string | null;
      im_document_url: string | null;
      im_document_file_name: string | null;
    }>
  >(`SELECT br.applicationId, br.id AS board_review_id, br.recommendationReport AS recommendation_report,
            br.overallScore AS overall_score, br.im_document_url, br.im_document_file_name
     FROM board_reviews br
     LEFT JOIN investment_memos im ON im.application_id = br.applicationId
     WHERE im.id IS NULL`);

  for (const row of legacy) {
    const memoId = `im_${row.applicationId.slice(0, 12)}`;
    const versionId = `imv_${row.applicationId.slice(0, 10)}_1`;
    const sections = {
      executiveSummary: "",
      investmentThesis: "",
      marketOpportunity: "",
      companyOverview: "",
      financialAnalysis: "",
      risksAndMitigants: "",
      dealTerms: "",
      recommendation: row.recommendation_report || "",
      overallScore: row.overall_score ? Number(row.overall_score) : null,
      additionalInformation: "",
    };
    await prisma.$executeRawUnsafe(
      `INSERT INTO investment_memos (id, application_id, board_review_id, workflow_status, current_version_id, created_at, updated_at)
       VALUES (?, ?, ?, 'DRAFT', ?, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
      memoId,
      row.applicationId,
      row.board_review_id,
      versionId
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO investment_memo_versions (id, memo_id, version_number, sections, attachment_url, attachment_file_name,
        validation_passed, version_status, created_by_id, created_at)
       VALUES (?, ?, 1, ?, ?, ?, false, 'DRAFT', (SELECT reviewerId FROM board_reviews WHERE id = ?), CURRENT_TIMESTAMP(3))`,
      versionId,
      memoId,
      JSON.stringify(sections),
      row.im_document_url,
      row.im_document_file_name,
      row.board_review_id
    );
    console.log(`[ok] backfill memo for application ${row.applicationId}`);
  }

  console.log("Investment memo editing migration complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
