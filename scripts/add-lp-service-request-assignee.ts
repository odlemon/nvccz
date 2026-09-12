/**
 * Adds `assigned_to_id` to `lp_service_requests`.
 *
 * SRD §21 routes an investor request through ASSIGNED → UNDER REVIEW → AWAITING INVESTOR /
 * AWAITING INTERNAL → RESOLVED → CLOSED, and §5 makes "investor requests" the responsibility of
 * Investor Relations / Fund Operations. The table had no way to record who owns a request, because
 * nothing internal could see one: every service-desk method took an investor context, so a request
 * was written and no staff user could ever read, assign or answer it. The return leg of the flow
 * did not exist.
 *
 * Idempotent: adds the column and its index only if absent.
 *
 * Run with:  npx ts-node scripts/add-lp-service-request-assignee.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint | number }>>(
    `SELECT COUNT(*) AS c FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    table,
    column
  );
  return Number(rows?.[0]?.c ?? 0) > 0;
}

async function indexExists(table: string, index: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint | number }>>(
    `SELECT COUNT(*) AS c FROM information_schema.statistics
      WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?`,
    table,
    index
  );
  return Number(rows?.[0]?.c ?? 0) > 0;
}

async function main() {
  const table = "lp_service_requests";

  if (await columnExists(table, "assigned_to_id")) {
    console.log(`[skip]    ${table}.assigned_to_id already exists`);
  } else {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`${table}\` ADD COLUMN \`assigned_to_id\` VARCHAR(191) NULL`
    );
    console.log(`[created] ${table}.assigned_to_id`);
  }

  const idx = "lp_service_requests_assigned_to_id_idx";
  if (await indexExists(table, idx)) {
    console.log(`[skip]    index ${idx} already exists`);
  } else {
    await prisma.$executeRawUnsafe(`CREATE INDEX \`${idx}\` ON \`${table}\` (\`assigned_to_id\`)`);
    console.log(`[created] index ${idx}`);
  }

  const open = await prisma.$queryRawUnsafe<Array<{ c: bigint | number }>>(
    `SELECT COUNT(*) AS c FROM \`${table}\``
  );
  console.log(`[info] ${table} holds ${Number(open?.[0]?.c ?? 0)} request(s), all currently unassigned.`);
}

main()
  .catch((e) => {
    console.error("[failed]", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
