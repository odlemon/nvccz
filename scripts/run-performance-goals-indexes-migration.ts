/**
 * Add indexes for performance goal / scorecard hot paths (contract linkage, employee & department lookups).
 * Idempotent: skips indexes that already exist. No Prisma migrate.
 *
 * Run: npm run db:migrate:performance-goals-indexes
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function indexExists(table: string, indexName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
    `SELECT COUNT(1) AS cnt FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    table,
    indexName
  );
  return Number(rows[0]?.cnt || 0) > 0;
}

async function main() {
  const specs: { name: string; table: string; sql: string }[] = [
    {
      name: "performance_goals_performance_contract_id_idx",
      table: "performance_goals",
      sql: "CREATE INDEX `performance_goals_performance_contract_id_idx` ON `performance_goals` (`performanceContractId`)"
    },
    {
      name: "performance_goals_type_assigned_to_idx",
      table: "performance_goals",
      sql: "CREATE INDEX `performance_goals_type_assigned_to_idx` ON `performance_goals` (`type`, `assignedToId`)"
    },
    {
      name: "performance_goals_type_department_name_idx",
      table: "performance_goals",
      sql: "CREATE INDEX `performance_goals_type_department_name_idx` ON `performance_goals` (`type`, `departmentName`)"
    },
    {
      name: "performance_scorecards_type_period_idx",
      table: "performance_scorecards",
      sql: "CREATE INDEX `performance_scorecards_type_period_idx` ON `performance_scorecards` (`scorecardType`, `periodStart`, `periodEnd`)"
    }
  ];

  for (const { name, table, sql } of specs) {
    if (await indexExists(table, name)) {
      console.log(`[skip] ${name} already exists`);
      continue;
    }
    await prisma.$executeRawUnsafe(sql);
    console.log(`[ok] ${name}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
