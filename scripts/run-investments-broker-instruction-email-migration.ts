/**
 * Broker instruction email round-trip (PO-style email + magic-link reply).
 * Idempotent DDL. Apply on nts now; re-run on client1_db / demo_env when up.
 *
 * npm run db:migrate:investments-broker-instruction-email
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function tableExists(table: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
    `SELECT COUNT(*) AS cnt FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    table
  );
  return Number(rows[0]?.cnt || 0) > 0;
}

async function createTable(table: string, ddl: string) {
  if (await tableExists(table)) {
    console.log(`[skip] table ${table}`);
    return;
  }
  await prisma.$executeRawUnsafe(ddl);
  console.log(`[ok] created ${table}`);
}

async function main() {
  const dbRows = await prisma.$queryRawUnsafe<Array<{ db: string }>>(`SELECT DATABASE() AS db`);
  console.log(`Broker instruction email DDL on DATABASE()=${dbRows[0]?.db}`);

  await createTable(
    "investment_order_broker_instructions",
    `CREATE TABLE \`investment_order_broker_instructions\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`order_id\` VARCHAR(191) NOT NULL,
      \`channel\` VARCHAR(32) NOT NULL DEFAULT 'EMAIL',
      \`to_email\` VARCHAR(255) NULL,
      \`subject\` VARCHAR(512) NULL,
      \`body_text\` TEXT NULL,
      \`reply_token\` VARCHAR(128) NOT NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'PENDING',
      \`delivery_error\` TEXT NULL,
      \`email_message_id\` VARCHAR(255) NULL,
      \`sent_at\` DATETIME(3) NULL,
      \`replied_at\` DATETIME(3) NULL,
      \`expires_at\` DATETIME(3) NOT NULL,
      \`created_by_id\` VARCHAR(191) NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`investment_order_broker_instructions_token_key\` (\`reply_token\`),
      KEY \`investment_order_broker_instructions_order_idx\` (\`order_id\`),
      KEY \`investment_order_broker_instructions_status_idx\` (\`status\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );

  await createTable(
    "investment_order_broker_messages",
    `CREATE TABLE \`investment_order_broker_messages\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`order_id\` VARCHAR(191) NOT NULL,
      \`instruction_id\` VARCHAR(191) NULL,
      \`direction\` VARCHAR(16) NOT NULL,
      \`channel\` VARCHAR(32) NOT NULL DEFAULT 'EMAIL',
      \`kind\` VARCHAR(48) NOT NULL,
      \`body\` TEXT NULL,
      \`payload_json\` JSON NULL,
      \`actor_label\` VARCHAR(255) NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      KEY \`investment_order_broker_messages_order_idx\` (\`order_id\`, \`created_at\`),
      KEY \`investment_order_broker_messages_instruction_idx\` (\`instruction_id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );

  console.log("Broker instruction email DDL complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
