/**
 * Vendor portal tokens + quotations:
 * - `rfq_vendor_invitations.invitation_token` → nullable VARCHAR(512), drop UNIQUE (tokens are stateless HMAC).
 * - `vendor_quotations.vendor_id` → nullable FK to `vendors`.
 *
 * Run: npx ts-node scripts/run-vendor-portal-procurement-migration.ts
 * Or:  npm run db:migrate:vendor-portal-procurement
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
     WHERE TABLE_SCHEMA = DATABASE() AND CONSTRAINT_TYPE = 'FOREIGN KEY' AND CONSTRAINT_NAME = ?`,
    fkName
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function main() {
  const invTable = "rfq_vendor_invitations";
  const qTable = "vendor_quotations";

  const uniqueTokenIdx = "rfq_vendor_invitations_invitation_token_key";
  if (await indexExists(invTable, uniqueTokenIdx)) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`${invTable}\` DROP INDEX \`${uniqueTokenIdx}\``
    );
    console.log(`[ok] dropped unique index ${uniqueTokenIdx}`);
  } else {
    console.log(`[skip] index ${uniqueTokenIdx} not present`);
  }

  if (await columnExists(invTable, "invitation_token")) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`${invTable}\` MODIFY COLUMN \`invitation_token\` VARCHAR(512) NULL`
    );
    console.log(`[ok] ${invTable}.invitation_token is VARCHAR(512) NULL`);
  }

  if (!(await columnExists(qTable, "vendor_id"))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`${qTable}\` ADD COLUMN \`vendor_id\` VARCHAR(191) NULL,
        ADD INDEX \`vendor_quotations_vendor_id_idx\` (\`vendor_id\`)`
    );
    console.log(`[ok] added ${qTable}.vendor_id`);
  } else {
    console.log(`[skip] ${qTable}.vendor_id already exists`);
  }

  const fk = "vendor_quotations_vendor_id_fkey";
  if (!(await fkExists(fk))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`${qTable}\`
       ADD CONSTRAINT \`${fk}\` FOREIGN KEY (\`vendor_id\`) REFERENCES \`vendors\`(\`id\`)
       ON DELETE SET NULL ON UPDATE CASCADE`
    );
    console.log(`[ok] added FK ${fk}`);
  } else {
    console.log(`[skip] FK ${fk} already exists`);
  }

  const checks: Array<[string, string]> = [
    [invTable, "invitation_token"],
    [qTable, "vendor_id"],
  ];
  for (const [t, c] of checks) {
    if (!(await columnExists(t, c))) {
      throw new Error(`Verification failed: missing ${t}.${c}`);
    }
    console.log(`[verify OK] ${t}.${c}`);
  }

  console.log("\nVendor portal procurement migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
