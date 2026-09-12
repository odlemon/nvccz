/**
 * Board review: Final IM + call-to-vote workflow columns. Idempotent (MySQL).
 *
 * Run: npm run db:migrate:board-review-im-columns
 * Then: npx prisma generate
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

async function main() {
  const t = "board_reviews";

  if (!(await columnExists(t, "im_document_url"))) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`${t}\`
      ADD COLUMN \`im_document_url\` TEXT NULL
    `);
    console.log("[ok] board_reviews.im_document_url");
  } else {
    console.log("[skip] board_reviews.im_document_url exists");
  }

  if (!(await columnExists(t, "im_document_file_name"))) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`${t}\`
      ADD COLUMN \`im_document_file_name\` VARCHAR(191) NULL
    `);
    console.log("[ok] board_reviews.im_document_file_name");
  } else {
    console.log("[skip] board_reviews.im_document_file_name exists");
  }

  if (!(await columnExists(t, "im_status"))) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`${t}\`
      ADD COLUMN \`im_status\` VARCHAR(32) NOT NULL DEFAULT 'NONE'
    `);
    console.log("[ok] board_reviews.im_status");
  } else {
    console.log("[skip] board_reviews.im_status exists");
  }

  if (!(await columnExists(t, "vote_invite_sent_at"))) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`${t}\`
      ADD COLUMN \`vote_invite_sent_at\` DATETIME(3) NULL
    `);
    console.log("[ok] board_reviews.vote_invite_sent_at");
  } else {
    console.log("[skip] board_reviews.vote_invite_sent_at exists");
  }

  if (!(await columnExists(t, "requires_explicit_vote_open"))) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`${t}\`
      ADD COLUMN \`requires_explicit_vote_open\` BOOLEAN NOT NULL DEFAULT false
    `);
    console.log("[ok] board_reviews.requires_explicit_vote_open");
  } else {
    console.log("[skip] board_reviews.requires_explicit_vote_open exists");
  }

  console.log("\nboard_reviews IM / call-to-vote migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
