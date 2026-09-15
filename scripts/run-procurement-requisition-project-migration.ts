/**
 * The project or cost centre a purchase requisition is charged to (MySQL). Idempotent; safe on every environment.
 *
 *   purchase_requisitions.project_id   a row of projects (Accounting's project register), or NULL for none
 *
 * SRD §7 Purchase Requisition Form: "Project/Cost Center (a searchable dropdown menu)". The column holds the project's
 * id; the register it points at is the one Accounting and Timesheets already keep.
 *
 * Run: npm run db:migrate:procurement-requisition-project
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function exists(sql: string, ...args: string[]): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(sql, ...args);
  return Number(rows[0]?.c ?? 0) > 0;
}

async function main() {
  if (!(await exists("SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?", "purchase_requisitions"))) {
    return console.log("[skip] purchase_requisitions not found");
  }
  if (await exists("SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?", "purchase_requisitions", "project_id")) {
    console.log("[skip] purchase_requisitions.project_id already exists");
  } else {
    await prisma.$executeRawUnsafe("ALTER TABLE `purchase_requisitions` ADD COLUMN `project_id` VARCHAR(191) NULL");
    console.log("[ok] added purchase_requisitions.project_id");
  }
  if (await exists("SELECT COUNT(*) AS c FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?", "purchase_requisitions", "purchase_requisitions_project_id_idx")) {
    console.log("[skip] purchase_requisitions_project_id_idx already exists");
  } else {
    await prisma.$executeRawUnsafe("CREATE INDEX `purchase_requisitions_project_id_idx` ON `purchase_requisitions` (`project_id`)");
    console.log("[ok] created purchase_requisitions_project_id_idx");
  }
}

main()
  .then(() => console.log("Procurement requisition project migration finished."))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
