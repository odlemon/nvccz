/**
 * Add activity_logs.application_id for portfolio deal collaboration feed. Idempotent (MySQL).
 *
 * Run: npm run db:migrate:activity-log-application-id
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

async function indexExists(table: string, indexName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    table,
    indexName
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function fkExists(fkName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
    fkName
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function main() {
  const t = "activity_logs";

  if (!(await columnExists(t, "applicationId"))) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`${t}\`
      ADD COLUMN \`applicationId\` VARCHAR(191) NULL
    `);
    console.log("[ok] activity_logs.applicationId");
  } else {
    console.log("[skip] activity_logs.applicationId exists");
  }

  if (!(await indexExists(t, "activity_logs_applicationId_idx"))) {
    await prisma.$executeRawUnsafe(`
      CREATE INDEX \`activity_logs_applicationId_idx\` ON \`${t}\` (\`applicationId\`)
    `);
    console.log("[ok] index activity_logs_applicationId_idx");
  } else {
    console.log("[skip] index activity_logs_applicationId_idx exists");
  }

  const fk = "activity_logs_applicationId_fkey";
  if (!(await fkExists(fk))) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`${t}\`
      ADD CONSTRAINT \`${fk}\`
      FOREIGN KEY (\`applicationId\`) REFERENCES \`applications\`(\`id\`)
      ON DELETE CASCADE ON UPDATE CASCADE
    `);
    console.log("[ok] FK activity_logs_applicationId_fkey");
  } else {
    console.log("[skip] FK activity_logs_applicationId_fkey exists");
  }

  console.log("\nactivity_logs.applicationId migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
