/**
 * Objects that used to be created implicitly by `prisma db push` on container
 * start. That call was removed from deploy/docker-entrypoint.sh (it drops
 * tables managed outside Prisma), so they need an explicit migration:
 *
 *   - board_review_votes                       (IC voting)
 *   - fundraising_agreement_templates          (agreement templates)
 *   - fundraising_agreements.application_id    (link to application)
 *   - fundraising_agreements.fund_id           (link to fund)
 *   - fundraising_agreement_signatories.role   (signatory role)
 *
 * All additive and idempotent. Safe to re-run.
 *
 * Run: npm run db:migrate:board-review-votes-agreement-links
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function tableExists(table: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    table
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function indexExists(table: string, index: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    table,
    index
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function addColumn(table: string, column: string, ddl: string) {
  if (!(await tableExists(table))) {
    console.log(`[skip] ${table} does not exist`);
    return;
  }
  if (await columnExists(table, column)) {
    console.log(`[skip] ${table}.${column} exists`);
    return;
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
  console.log(`[ok] ${table}.${column}`);
}

async function addIndex(table: string, index: string, ddl: string) {
  if (!(await tableExists(table))) return;
  if (await indexExists(table, index)) {
    console.log(`[skip] index ${index}`);
    return;
  }
  await prisma.$executeRawUnsafe(ddl);
  console.log(`[ok] index ${index}`);
}

async function main() {
  // —— board_review_votes ——
  if (await tableExists("board_review_votes")) {
    console.log("[skip] board_review_votes exists");
  } else {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`board_review_votes\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`boardReviewId\` VARCHAR(191) NOT NULL,
        \`userId\` VARCHAR(191) NOT NULL,
        \`vote\` VARCHAR(16) NOT NULL,
        \`comment\` TEXT NULL,
        \`votingPower\` INTEGER NOT NULL DEFAULT 1,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL,
        INDEX \`board_review_votes_boardReviewId_idx\`(\`boardReviewId\`),
        INDEX \`board_review_votes_userId_idx\`(\`userId\`),
        UNIQUE INDEX \`board_review_votes_boardReviewId_userId_key\`(\`boardReviewId\`, \`userId\`),
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] board_review_votes");
  }

  // —— fundraising_agreement_templates ——
  if (await tableExists("fundraising_agreement_templates")) {
    console.log("[skip] fundraising_agreement_templates exists");
  } else {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fundraising_agreement_templates\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`document_type\` VARCHAR(64) NOT NULL,
        \`description\` TEXT NULL,
        \`is_active\` BOOLEAN NOT NULL DEFAULT true,
        \`created_by_id\` VARCHAR(191) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        INDEX \`fundraising_agreement_templates_document_type_idx\`(\`document_type\`),
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] fundraising_agreement_templates");
  }

  // —— agreement links ——
  await addColumn(
    "fundraising_agreements",
    "application_id",
    "`application_id` VARCHAR(191) NULL"
  );
  await addColumn("fundraising_agreements", "fund_id", "`fund_id` VARCHAR(191) NULL");
  await addIndex(
    "fundraising_agreements",
    "fundraising_agreements_application_idx",
    "CREATE INDEX `fundraising_agreements_application_idx` ON `fundraising_agreements`(`application_id`)"
  );
  await addIndex(
    "fundraising_agreements",
    "fundraising_agreements_fund_idx",
    "CREATE INDEX `fundraising_agreements_fund_idx` ON `fundraising_agreements`(`fund_id`)"
  );

  await addColumn(
    "fundraising_agreement_signatories",
    "role",
    "`role` VARCHAR(128) NULL"
  );

  console.log("\nBoard review votes / agreement links migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
