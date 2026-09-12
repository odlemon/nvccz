/**
 * Creates `lp_benchmark_series_points` — the store for approved benchmark index series shown on
 * the LP portal performance screen.
 *
 * Why this table exists: `LpPortalPerformanceService.benchmarks()` had no data to read, so it
 * generated the series arithmetically (`base + i * step` per benchmark id), labelled it
 * `valuationStatus: "FINAL"`, and returned it to investors as the index their fund's performance
 * is measured against. A benchmark is an external series — it is either supplied and approved, or
 * it is absent. With this table the endpoint serves real rows and reports "not configured" when
 * there are none, instead of inventing a line.
 *
 * Idempotent: safe to run repeatedly. Creates nothing that already exists and seeds no data —
 * benchmark values must come from an approved feed, not from a migration.
 *
 * Run with:  npx ts-node scripts/create-lp-benchmark-series.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint | number }>>(
    `SELECT COUNT(*) AS c FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = ?`,
    name
  );
  return Number(rows?.[0]?.c ?? 0) > 0;
}

async function main() {
  const table = "lp_benchmark_series_points";

  if (await tableExists(table)) {
    console.log(`[skip] ${table} already exists`);
  } else {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`${table}\` (
        \`id\`           VARCHAR(191) NOT NULL,
        \`benchmark_id\` VARCHAR(64)  NOT NULL,
        \`metric\`       VARCHAR(32)  NOT NULL,
        \`as_of_date\`   DATE         NOT NULL,
        \`value\`        DECIMAL(18,6) NOT NULL,
        \`label\`        VARCHAR(64)  NULL,
        \`source\`       VARCHAR(255) NULL,
        \`approved_by\`  VARCHAR(191) NULL,
        \`approved_at\`  DATETIME(3)  NULL,
        \`created_at\`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`lp_benchmark_series_points_unique\` (\`benchmark_id\`, \`metric\`, \`as_of_date\`),
        KEY \`lp_benchmark_series_points_lookup\` (\`benchmark_id\`, \`metric\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log(`[created] ${table}`);
  }

  const count = await prisma.$queryRawUnsafe<Array<{ c: bigint | number }>>(
    `SELECT COUNT(*) AS c FROM \`${table}\``
  );
  console.log(`[info] ${table} holds ${Number(count?.[0]?.c ?? 0)} approved point(s).`);
  console.log(
    "[info] No rows are seeded on purpose: benchmark values must arrive from an approved index\n" +
      "       feed. Until then the LP performance screen reports the benchmark as not configured."
  );
}

main()
  .catch((e) => {
    console.error("[failed]", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
