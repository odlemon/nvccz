/**
 * Deal workflow UAT: statutory compliance flags on applications + task metadata JSON (MySQL). Idempotent.
 *
 * Run: npm run db:migrate:application-deal-workflow
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
  const apps = "applications";
  const tasks = "tasks";

  if (!(await columnExists(apps, "complianceCleared"))) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`${apps}\`
      ADD COLUMN \`complianceCleared\` BOOLEAN NOT NULL DEFAULT false
    `);
    console.log("[ok] applications.complianceCleared");
  } else {
    console.log("[skip] applications.complianceCleared exists");
  }

  if (!(await columnExists(apps, "kycVerified"))) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`${apps}\`
      ADD COLUMN \`kycVerified\` BOOLEAN NOT NULL DEFAULT false
    `);
    console.log("[ok] applications.kycVerified");
  } else {
    console.log("[skip] applications.kycVerified exists");
  }

  if (!(await columnExists(tasks, "taskMetadata"))) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`${tasks}\`
      ADD COLUMN \`taskMetadata\` JSON NULL
    `);
    console.log("[ok] tasks.taskMetadata");
  } else {
    console.log("[skip] tasks.taskMetadata exists");
  }

  console.log("\nApplication deal workflow columns migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
