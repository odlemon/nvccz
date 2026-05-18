/**
 * Idempotent: investment_valuation_events + investment_exit_events (MySQL).
 * Run: npm run db:migrate:investment-valuation-exit
 * Then: npx prisma generate
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
  if (!(await tableExists("investment_valuation_events"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`investment_valuation_events\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`investment_implementation_id\` VARCHAR(191) NOT NULL,
        \`valuation_date\` DATE NOT NULL,
        \`valuation_type\` VARCHAR(64) NOT NULL,
        \`valuation_amount\` DECIMAL(15, 2) NOT NULL,
        \`currency_id\` VARCHAR(191) NULL,
        \`notes\` TEXT NULL,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`investment_valuation_events_impl_idx\` (\`investment_implementation_id\`),
        INDEX \`investment_valuation_events_date_idx\` (\`valuation_date\`),
        CONSTRAINT \`investment_valuation_events_impl_fk\`
          FOREIGN KEY (\`investment_implementation_id\`) REFERENCES \`investment_implementations\`(\`id\`)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`investment_valuation_events_currency_fk\`
          FOREIGN KEY (\`currency_id\`) REFERENCES \`currencies\`(\`id\`)
          ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT \`investment_valuation_events_created_by_fk\`
          FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\`(\`id\`)
          ON DELETE RESTRICT ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created investment_valuation_events");
  } else {
    console.log("[skip] investment_valuation_events exists");
  }

  if (!(await tableExists("investment_exit_events"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`investment_exit_events\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`investment_implementation_id\` VARCHAR(191) NOT NULL,
        \`exit_date\` DATE NOT NULL,
        \`exit_type\` VARCHAR(64) NOT NULL,
        \`exit_proceeds_amount\` DECIMAL(15, 2) NOT NULL,
        \`currency_id\` VARCHAR(191) NULL,
        \`total_invested_basis\` DECIMAL(15, 2) NULL,
        \`irr_annualized\` DECIMAL(18, 8) NULL,
        \`roi_multiple\` DECIMAL(18, 8) NULL,
        \`notes\` TEXT NULL,
        \`recorded_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`investment_exit_events_impl_uniq\` (\`investment_implementation_id\`),
        CONSTRAINT \`investment_exit_events_impl_fk\`
          FOREIGN KEY (\`investment_implementation_id\`) REFERENCES \`investment_implementations\`(\`id\`)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`investment_exit_events_currency_fk\`
          FOREIGN KEY (\`currency_id\`) REFERENCES \`currencies\`(\`id\`)
          ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT \`investment_exit_events_recorded_by_fk\`
          FOREIGN KEY (\`recorded_by_id\`) REFERENCES \`users\`(\`id\`)
          ON DELETE RESTRICT ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created investment_exit_events");
  } else {
    console.log("[skip] investment_exit_events exists");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
