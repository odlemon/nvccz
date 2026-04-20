/**
 * Creates portfolio_company_letterheads (MySQL). Idempotent.
 * Run: npm run db:migrate:portfolio-company-letterhead
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
  const existed = await tableExists("portfolio_company_letterheads");
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`portfolio_company_letterheads\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`portfolio_company_id\` VARCHAR(191) NOT NULL,
      \`legal_name\` VARCHAR(512) NULL,
      \`registration_number\` VARCHAR(255) NULL,
      \`tax_number\` VARCHAR(255) NULL,
      \`email\` VARCHAR(255) NULL,
      \`phone\` VARCHAR(64) NULL,
      \`website\` VARCHAR(512) NULL,
      \`logo_url\` VARCHAR(1024) NULL,
      \`line1\` VARCHAR(512) NULL,
      \`line2\` VARCHAR(512) NULL,
      \`city\` VARCHAR(255) NULL,
      \`state\` VARCHAR(255) NULL,
      \`postal_code\` VARCHAR(64) NULL,
      \`country\` VARCHAR(255) NULL,
      \`address_label\` VARCHAR(255) NULL,
      \`twitter\` VARCHAR(255) NULL,
      \`facebook\` VARCHAR(255) NULL,
      \`linkedin\` VARCHAR(255) NULL,
      \`instagram\` VARCHAR(255) NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`portfolio_company_letterheads_portfolio_company_id_key\` (\`portfolio_company_id\`),
      CONSTRAINT \`portfolio_company_letterheads_portfolio_company_id_fkey\` FOREIGN KEY (\`portfolio_company_id\`) REFERENCES \`portfolio_companies\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log(existed ? "[skip] portfolio_company_letterheads already present" : "[ok] created table portfolio_company_letterheads");
  console.log("\nPortfolio company letterhead migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
