// @ts-nocheck
/**
 * One-off: create audit_trail_sequences table and add auditTrailSequenceNumber to journal_entries.
 * Run: npx ts-node scripts/migrate-audit-trail-sequence.ts
 */
import { prisma } from "../src/utils/database";

async function run() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS audit_trail_sequences (
        name VARCHAR(191) NOT NULL,
        value INT NOT NULL DEFAULT 1000,
        updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (name)
      )
    `);
    console.log("Table audit_trail_sequences ensured.");
  } catch (e: any) {
    if (!e.message?.includes("already exists")) throw e;
    console.log("Table audit_trail_sequences already exists.");
  }

  try {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE journal_entries ADD COLUMN auditTrailSequenceNumber INT NULL UNIQUE
    `);
    console.log("Column journal_entries.auditTrailSequenceNumber added.");
  } catch (e: any) {
    if (!e.message?.includes("Duplicate column")) throw e;
    console.log("Column auditTrailSequenceNumber already exists.");
  }

  await prisma.$disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
