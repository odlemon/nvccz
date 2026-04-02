/**
 * Adds company letterhead fields + address table + vat_rates table (no prisma migrate).
 * Safe to re-run: checks information_schema before applying DDL.
 *
 * Run: npx ts-node --transpile-only scripts/run-letterhead-addresses-and-vat-migration.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function tableExists(table: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    table
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function addColumnIfMissing(table: string, column: string, definition: string) {
  if (await columnExists(table, column)) {
    console.log(`[skip] ${table}.${column} exists`);
    return;
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  console.log(`[ok] added ${table}.${column}`);
}

async function main() {
  // 1) Extend company_profile for letterhead identity
  const cpTable = 'company_profile';
  if (!(await tableExists(cpTable))) {
    throw new Error('company_profile table not found (expected existing table).');
  }

  await addColumnIfMissing(cpTable, 'legal_name', 'VARCHAR(255) NULL');
  await addColumnIfMissing(cpTable, 'registration_number', 'VARCHAR(255) NULL');
  await addColumnIfMissing(cpTable, 'tax_number', 'VARCHAR(255) NULL');
  await addColumnIfMissing(cpTable, 'email', 'VARCHAR(255) NULL');
  await addColumnIfMissing(cpTable, 'phone', 'VARCHAR(255) NULL');
  await addColumnIfMissing(cpTable, 'website', 'VARCHAR(255) NULL');
  await addColumnIfMissing(cpTable, 'logo_url', 'VARCHAR(1024) NULL');

  // 2) Create company_profile_addresses
  const addrTable = 'company_profile_addresses';
  if (!(await tableExists(addrTable))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`${addrTable}\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`company_profile_id\` VARCHAR(191) NOT NULL,
        \`label\` VARCHAR(255) NULL,
        \`line1\` VARCHAR(255) NOT NULL,
        \`line2\` VARCHAR(255) NULL,
        \`city\` VARCHAR(255) NULL,
        \`state\` VARCHAR(255) NULL,
        \`postal_code\` VARCHAR(64) NULL,
        \`country\` VARCHAR(255) NULL,
        \`is_active\` BOOLEAN NOT NULL DEFAULT FALSE,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`company_profile_address_company_idx\` (\`company_profile_id\`),
        INDEX \`company_profile_address_active_idx\` (\`company_profile_id\`, \`is_active\`),
        CONSTRAINT \`company_profile_addresses_company_profile_id_fk\`
          FOREIGN KEY (\`company_profile_id\`) REFERENCES \`${cpTable}\`(\`id\`)
          ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log(`[ok] created ${addrTable}`);
  } else {
    console.log(`[skip] ${addrTable} exists`);
  }
  // Add logo_url if table already existed (or older schema)
  await addColumnIfMissing(addrTable, 'logo_url', 'VARCHAR(1024) NULL');

  // 3) Create vat_rates
  const vatTable = 'vat_rates';
  if (!(await tableExists(vatTable))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`${vatTable}\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`rate_decimal\` DECIMAL(10,6) NOT NULL,
        \`is_active\` BOOLEAN NOT NULL DEFAULT FALSE,
        \`effective_from\` DATETIME(3) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`vat_rates_active_idx\` (\`is_active\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log(`[ok] created ${vatTable}`);
  } else {
    console.log(`[skip] ${vatTable} exists`);
  }

  // 4) Ensure there is at least one active VAT row (15.5%) so system behaviour matches current default
  const active = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM \`${vatTable}\` WHERE is_active = TRUE`
  );
  if (Number(active[0]?.c ?? 0) === 0) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO \`${vatTable}\` (id, name, rate_decimal, is_active, effective_from)
       VALUES (UUID(), 'Standard VAT', 0.155000, TRUE, NOW())`
    );
    console.log('[ok] inserted default active VAT (0.155000)');
  } else {
    console.log('[skip] active VAT row already exists');
  }
}

main()
  .catch((e) => {
    console.error('MIGRATION_FAILED', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

