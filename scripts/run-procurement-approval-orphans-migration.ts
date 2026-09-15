/**
 * Closes requisition approval requests left open after their requisition was decided or removed (MySQL). Idempotent;
 * safe on every environment.
 *
 * Until the approval route was enforced, approving a requisition set its status and left its approval request and
 * approver rows PENDING, and deleting a requisition left its request behind. An open request is now what puts a
 * requisition in an approver's queue and what the approval route shows, so a stale one would show a decided
 * requisition as still waiting. A request is closed only when its requisition no longer exists or is no longer
 * pending approval; a requisition still pending keeps its request untouched.
 *
 * Run: npm run db:migrate:procurement-approval-orphans
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function main() {
  const needed: Array<[string, string]> = [
    ["approval_requests", "entityId"],
    ["approval_requests", "stageType"],
    ["approval_requests", "rejectionReason"],
    ["approvals", "requestId"],
    ["purchase_requisitions", "status"],
  ];
  for (const [table, column] of needed) {
    if (!(await columnExists(table, column))) {
      console.log(`[skip] ${table}.${column} not found; nothing to close`);
      return;
    }
  }

  const stale = `r.stageType = 'PURCHASE_REQUISITION' AND r.status = 'PENDING' AND (p.id IS NULL OR p.status <> 'PENDING_APPROVAL')`;
  const rows = await prisma.$executeRawUnsafe(`
    UPDATE approvals a
    JOIN approval_requests r ON r.id = a.requestId
    LEFT JOIN purchase_requisitions p ON p.id = r.entityId
    SET a.status = 'CANCELLED', a.updatedAt = CURRENT_TIMESTAMP(3)
    WHERE a.status = 'PENDING' AND ${stale}`);
  const requests = await prisma.$executeRawUnsafe(
    `
    UPDATE approval_requests r
    LEFT JOIN purchase_requisitions p ON p.id = r.entityId
    SET r.status = 'CANCELLED', r.rejectionReason = ?, r.rejectedAt = CURRENT_TIMESTAMP(3)
    WHERE ${stale}`,
    "Closed: the requisition was decided or removed while this approval request stayed open"
  );
  console.log(`[ok] closed ${requests} stale requisition approval request(s) and ${rows} approver row(s)`);
}

main()
  .then(() => console.log("Procurement approval orphans migration finished."))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
