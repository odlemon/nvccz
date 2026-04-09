/**
 * Per-reporting-period operational KPI payloads (investee-entered non-financial / unit economics).
 * Idempotent: creates table + FK if missing.
 *
 * Run: npm run db:migrate:reporting-period-operational-kpis
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    name
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function fkExists(table: string, constraintName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c
     FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND CONSTRAINT_NAME = ?
       AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
    table,
    constraintName
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function main() {
  const table = "reporting_period_operational_kpis";
  if (!(await tableExists(table))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`${table}\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`portfolio_company_id\` VARCHAR(191) NOT NULL,
        \`reporting_period_end\` DATE NOT NULL,
        \`payload\` JSON NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`reporting_period_operational_kpis_company_period_uniq\` (\`portfolio_company_id\`, \`reporting_period_end\`),
        KEY \`reporting_period_operational_kpis_company_idx\` (\`portfolio_company_id\`),
        CONSTRAINT \`reporting_period_operational_kpis_company_fk\`
          FOREIGN KEY (\`portfolio_company_id\`) REFERENCES \`portfolio_companies\` (\`id\`) ON DELETE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created reporting_period_operational_kpis");
  } else {
    if (!(await fkExists(table, "reporting_period_operational_kpis_company_fk"))) {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE \`${table}\`
        ADD CONSTRAINT \`reporting_period_operational_kpis_company_fk\`
          FOREIGN KEY (\`portfolio_company_id\`) REFERENCES \`portfolio_companies\` (\`id\`) ON DELETE CASCADE
      `);
      console.log("[ok] added FK reporting_period_operational_kpis_company_fk");
    } else {
      console.log("[skip] reporting_period_operational_kpis exists");
    }
  }

  console.log("\nReporting period operational KPIs migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
