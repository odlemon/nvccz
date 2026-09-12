// @ts-nocheck
/**
 * Suite 06: vendor invoice intake, field corrections, purchase_invoices GRN + match columns.
 * Idempotent DDL. Run: npm run db:migrate:procurement-suite06
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function tableExists(table: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*) AS cnt FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    table
  );
  return Number(rows[0]?.cnt ?? 0) > 0;
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  return Number(rows[0]?.cnt ?? 0) > 0;
}

async function indexExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND INDEX_NAME = ?`,
    name
  );
  return Number(rows[0]?.cnt ?? 0) > 0;
}

async function fkExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*) AS cnt FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
    name
  );
  return Number(rows[0]?.cnt ?? 0) > 0;
}

async function addColumn(table: string, column: string, ddl: string) {
  if (await columnExists(table, column)) {
    console.log(`[skip] ${table}.${column}`);
    return;
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
  console.log(`[ok]   ${table}.${column}`);
}

async function main() {
  console.log("=== Procurement Suite 06 migration ===\n");

  if (!(await tableExists("vendor_invoice_intakes"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`vendor_invoice_intakes\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`intake_number\` VARCHAR(191) NOT NULL,
        \`document_url\` TEXT NOT NULL,
        \`raw_extracted_text\` LONGTEXT NULL,
        \`extracted_payload_json\` JSON NULL,
        \`llm_meta_json\` JSON NULL,
        \`status\` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
        \`overall_confidence\` DECIMAL(7,4) NULL,
        \`vendor_id\` VARCHAR(191) NOT NULL,
        \`source_purchase_order_id\` VARCHAR(191) NULL,
        \`goods_received_note_id\` VARCHAR(191) NULL,
        \`purchase_invoice_id\` VARCHAR(191) NULL,
        \`tax_parse_status\` VARCHAR(32) NULL,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        UNIQUE INDEX \`vendor_invoice_intakes_intake_number_key\`(\`intake_number\`),
        UNIQUE INDEX \`vendor_invoice_intakes_purchase_invoice_id_key\`(\`purchase_invoice_id\`),
        INDEX \`vendor_invoice_intakes_vendor_id_idx\`(\`vendor_id\`),
        INDEX \`vendor_invoice_intakes_status_idx\`(\`status\`),
        INDEX \`vendor_invoice_intakes_source_purchase_order_id_idx\`(\`source_purchase_order_id\`),
        INDEX \`vendor_invoice_intakes_goods_received_note_id_idx\`(\`goods_received_note_id\`),
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok]   created table vendor_invoice_intakes");
  } else {
    console.log("[skip] table vendor_invoice_intakes");
  }

  if (!(await tableExists("vendor_invoice_field_corrections"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`vendor_invoice_field_corrections\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`vendor_id\` VARCHAR(191) NOT NULL,
        \`field_key\` VARCHAR(128) NOT NULL,
        \`corrected_value\` TEXT NOT NULL,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE INDEX \`vendor_invoice_field_corrections_vendor_field_key\`(\`vendor_id\`, \`field_key\`),
        INDEX \`vendor_invoice_field_corrections_vendor_id_idx\`(\`vendor_id\`),
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok]   created table vendor_invoice_field_corrections");
  } else {
    console.log("[skip] table vendor_invoice_field_corrections");
  }

  // FKs (idempotent)
  const fks: { name: string; sql: string }[] = [
    {
      name: "vendor_invoice_intakes_vendor_id_fkey",
      sql: `ALTER TABLE \`vendor_invoice_intakes\` ADD CONSTRAINT \`vendor_invoice_intakes_vendor_id_fkey\` FOREIGN KEY (\`vendor_id\`) REFERENCES \`vendors\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE`,
    },
    {
      name: "vendor_invoice_intakes_source_purchase_order_id_fkey",
      sql: `ALTER TABLE \`vendor_invoice_intakes\` ADD CONSTRAINT \`vendor_invoice_intakes_source_purchase_order_id_fkey\` FOREIGN KEY (\`source_purchase_order_id\`) REFERENCES \`purchase_orders\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE`,
    },
    {
      name: "vendor_invoice_intakes_goods_received_note_id_fkey",
      sql: `ALTER TABLE \`vendor_invoice_intakes\` ADD CONSTRAINT \`vendor_invoice_intakes_goods_received_note_id_fkey\` FOREIGN KEY (\`goods_received_note_id\`) REFERENCES \`goods_received_notes\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE`,
    },
    {
      name: "vendor_invoice_intakes_purchase_invoice_id_fkey",
      sql: `ALTER TABLE \`vendor_invoice_intakes\` ADD CONSTRAINT \`vendor_invoice_intakes_purchase_invoice_id_fkey\` FOREIGN KEY (\`purchase_invoice_id\`) REFERENCES \`purchase_invoices\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE`,
    },
    {
      name: "vendor_invoice_intakes_created_by_id_fkey",
      sql: `ALTER TABLE \`vendor_invoice_intakes\` ADD CONSTRAINT \`vendor_invoice_intakes_created_by_id_fkey\` FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE`,
    },
    {
      name: "vendor_invoice_field_corrections_vendor_id_fkey",
      sql: `ALTER TABLE \`vendor_invoice_field_corrections\` ADD CONSTRAINT \`vendor_invoice_field_corrections_vendor_id_fkey\` FOREIGN KEY (\`vendor_id\`) REFERENCES \`vendors\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    },
    {
      name: "vendor_invoice_field_corrections_created_by_id_fkey",
      sql: `ALTER TABLE \`vendor_invoice_field_corrections\` ADD CONSTRAINT \`vendor_invoice_field_corrections_created_by_id_fkey\` FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE`,
    },
  ];
  for (const { name, sql } of fks) {
    if (await fkExists(name)) {
      console.log(`[skip] FK ${name}`);
    } else {
      try {
        await prisma.$executeRawUnsafe(sql);
        console.log(`[ok]   FK ${name}`);
      } catch (e: any) {
        console.warn(`[warn] FK ${name}: ${e.message}`);
      }
    }
  }

  await addColumn(
    "purchase_invoices",
    "source_goods_received_note_id",
    "`source_goods_received_note_id` VARCHAR(191) NULL"
  );
  await addColumn(
    "purchase_invoices",
    "suite06_match_status",
    "`suite06_match_status` VARCHAR(32) NULL"
  );
  await addColumn(
    "purchase_invoices",
    "suite06_match_result_json",
    "`suite06_match_result_json` JSON NULL"
  );

  if (!(await fkExists("purchase_invoices_source_goods_received_note_id_fkey"))) {
    try {
      await prisma.$executeRawUnsafe(
        `ALTER TABLE \`purchase_invoices\` ADD CONSTRAINT \`purchase_invoices_source_goods_received_note_id_fkey\` FOREIGN KEY (\`source_goods_received_note_id\`) REFERENCES \`goods_received_notes\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE`
      );
      console.log("[ok]   FK purchase_invoices_source_goods_received_note_id_fkey");
    } catch (e: any) {
      console.warn(`[warn] FK purchase_invoices GRN: ${e.message}`);
    }
  } else {
    console.log("[skip] FK purchase_invoices_source_goods_received_note_id_fkey");
  }

  if (!(await indexExists("purchase_invoices_source_goods_received_note_id_idx"))) {
    await prisma.$executeRawUnsafe(
      `CREATE INDEX \`purchase_invoices_source_goods_received_note_id_idx\` ON \`purchase_invoices\`(\`source_goods_received_note_id\`)`
    );
    console.log("[ok]   index purchase_invoices.source_goods_received_note_id");
  }

  console.log("\n=== done ===");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
