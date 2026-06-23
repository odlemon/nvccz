/**
 * LP Portal — schema (access, vault, snapshots, MFA).
 * Idempotent. Run: npm run db:migrate:lp-portal
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

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    name
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function addColumnIfMissing(table: string, column: string, definition: string) {
  if (await columnExists(table, column)) {
    console.log(`[skip] ${table}.${column}`);
    return;
  }
  await prisma.$executeRawUnsafe(
    `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`
  );
  console.log(`[ok] ${table}.${column}`);
}

async function main() {
  await addColumnIfMissing("users", "token_version", "INT NOT NULL DEFAULT 0");

  if (!(await tableExists("lp_user_relations"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`lp_user_relations\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`user_id\` VARCHAR(191) NOT NULL,
        \`client_id\` VARCHAR(191) NOT NULL,
        \`lp_role\` VARCHAR(16) NOT NULL DEFAULT 'VIEWER',
        \`is_active\` BOOLEAN NOT NULL DEFAULT true,
        \`fund_ids\` JSON NULL,
        \`invited_by_id\` VARCHAR(191) NULL,
        \`revoked_at\` DATETIME(3) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`lp_user_relations_user_client_key\` (\`user_id\`, \`client_id\`),
        INDEX \`lp_user_relations_client_idx\` (\`client_id\`),
        INDEX \`lp_user_relations_user_active_idx\` (\`user_id\`, \`is_active\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] lp_user_relations");
  } else {
    console.log("[skip] lp_user_relations");
  }

  if (!(await tableExists("lp_portal_documents"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`lp_portal_documents\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`client_id\` VARCHAR(191) NOT NULL,
        \`fund_id\` VARCHAR(191) NULL,
        \`category\` VARCHAR(32) NOT NULL,
        \`title\` VARCHAR(512) NOT NULL,
        \`file_url\` TEXT NULL,
        \`storage_path\` VARCHAR(512) NULL,
        \`sha256\` VARCHAR(64) NULL,
        \`published_at\` DATETIME(3) NULL,
        \`published_by_id\` VARCHAR(191) NULL,
        \`source_type\` VARCHAR(32) NOT NULL,
        \`source_ref_id\` VARCHAR(191) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`lp_portal_documents_client_idx\` (\`client_id\`),
        INDEX \`lp_portal_documents_category_idx\` (\`category\`),
        INDEX \`lp_portal_documents_source_idx\` (\`source_type\`, \`source_ref_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] lp_portal_documents");
  } else {
    console.log("[skip] lp_portal_documents");
  }

  if (!(await tableExists("lp_portal_metric_snapshots"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`lp_portal_metric_snapshots\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`client_id\` VARCHAR(191) NOT NULL,
        \`fund_id\` VARCHAR(191) NOT NULL,
        \`as_of_date\` DATE NOT NULL,
        \`metrics\` JSON NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`lp_portal_metric_snapshots_client_fund_date_key\` (\`client_id\`, \`fund_id\`, \`as_of_date\`),
        INDEX \`lp_portal_metric_snapshots_client_idx\` (\`client_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] lp_portal_metric_snapshots");
  } else {
    console.log("[skip] lp_portal_metric_snapshots");
  }

  if (!(await tableExists("user_mfa_totp"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`user_mfa_totp\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`user_id\` VARCHAR(191) NOT NULL,
        \`encrypted_secret\` TEXT NOT NULL,
        \`enabled_at\` DATETIME(3) NULL,
        \`backup_codes\` JSON NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`user_mfa_totp_user_id_key\` (\`user_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] user_mfa_totp");
  } else {
    console.log("[skip] user_mfa_totp");
  }

  if (!(await tableExists("lp_portal_mfa_policy"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`lp_portal_mfa_policy\` (
        \`id\` VARCHAR(191) NOT NULL DEFAULT 'default',
        \`require_mfa_for_lp\` BOOLEAN NOT NULL DEFAULT false,
        \`issuer_name\` VARCHAR(128) NOT NULL DEFAULT 'Arcus LP Portal',
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await prisma.$executeRawUnsafe(`
      INSERT IGNORE INTO \`lp_portal_mfa_policy\` (\`id\`, \`require_mfa_for_lp\`, \`issuer_name\`, \`updated_at\`)
      VALUES ('default', false, 'Arcus LP Portal', CURRENT_TIMESTAMP(3))
    `);
    console.log("[ok] lp_portal_mfa_policy");
  } else {
    console.log("[skip] lp_portal_mfa_policy");
  }

  if (!(await tableExists("auth_mfa_pending"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`auth_mfa_pending\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`user_id\` VARCHAR(191) NOT NULL,
        \`token_hash\` VARCHAR(64) NOT NULL,
        \`expires_at\` DATETIME(3) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`auth_mfa_pending_token_hash_key\` (\`token_hash\`),
        INDEX \`auth_mfa_pending_user_idx\` (\`user_id\`),
        INDEX \`auth_mfa_pending_expires_idx\` (\`expires_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] auth_mfa_pending");
  } else {
    console.log("[skip] auth_mfa_pending");
  }

  // Backfill lp_user_relations from clients.user_id (legacy 1:1 links)
  const legacy = await prisma.$queryRawUnsafe<
    Array<{ user_id: string; client_id: string }>
  >(`SELECT user_id, id AS client_id FROM clients WHERE user_id IS NOT NULL`);
  for (const row of legacy) {
    const existing = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
      `SELECT COUNT(*) AS c FROM lp_user_relations WHERE user_id = ? AND client_id = ?`,
      row.user_id,
      row.client_id
    );
    if (Number(existing[0]?.c ?? 0) > 0) continue;
    const id = `lur_${row.user_id.slice(0, 8)}_${row.client_id.slice(0, 8)}`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO lp_user_relations (id, user_id, client_id, lp_role, is_active, created_at, updated_at)
       VALUES (?, ?, ?, 'VIEWER', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
      id,
      row.user_id,
      row.client_id
    );
    console.log(`[ok] backfill lp_user_relations ${row.user_id} -> ${row.client_id}`);
  }

  console.log("LP Portal migration complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
