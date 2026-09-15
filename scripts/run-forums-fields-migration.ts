/**
 * Adds `category` and `isSolved` to `posts` (MySQL). Idempotent.
 * Shared by the Home hub's News feed and Forums — `category` null means a News/company post,
 * a real category means a Forum discussion filed under it; `isSolved` is Forums-only. See the
 * doc comment on Post in schema.prisma.
 * Run: npm run db:migrate:forums-fields
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
  const hasCategory = await columnExists("posts", "category");
  if (hasCategory) {
    console.log("[skip] posts.category already present");
  } else {
    await prisma.$executeRawUnsafe(`ALTER TABLE \`posts\` ADD COLUMN \`category\` VARCHAR(64) NULL`);
    console.log("[ok] added posts.category");
  }

  const hasIsSolved = await columnExists("posts", "isSolved");
  if (hasIsSolved) {
    console.log("[skip] posts.isSolved already present");
  } else {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`posts\` ADD COLUMN \`isSolved\` BOOLEAN NOT NULL DEFAULT false`
    );
    console.log("[ok] added posts.isSolved");
  }

  console.log("\nForums fields migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
