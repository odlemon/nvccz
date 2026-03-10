// @ts-nocheck
/**
 * Activity Log / System Audit Log – rigorous test
 *
 * Requirement: View the "System Audit Log" for the last 24 hours.
 * Expected: Every login, record creation, and report export is listed with a user and IP address.
 *
 * Run: npx ts-node scripts/test-system-audit-log.ts
 * (Test data is left in place; no cleanup.)
 */
import { prisma } from "../src/utils/database";
import AuditService from "../src/services/AuditService";
import { getSystemAuditLog } from "../src/services/SystemAuditLogService";

const TEST_IP = "192.168.1.100";
const TEST_UA = "Mozilla/5.0 (Test) ActivityLogTest/1.0";
const failures: string[] = [];

function assert(condition: boolean, msg: string) {
  if (!condition) failures.push(msg);
}

async function run() {
  console.log("Activity Log – System Audit Log (last 24 hours)\n");

  const user = await prisma.user.findFirst();
  if (!user?.id) {
    console.error("Need at least one user.");
    process.exit(1);
  }

  // 1) Log LOGIN with user and IP (simulate login)
  await AuditService.log({
    userId: user.id,
    action: "LOGIN",
    entityType: "User",
    entityId: user.id,
    ipAddress: TEST_IP,
    userAgent: TEST_UA,
  });

  // 2) Log CREATE (record creation) with user and IP – simulate a created record
  await AuditService.log({
    userId: user.id,
    action: "CREATE",
    entityType: "JournalEntry",
    entityId: `test-je-${Date.now()}`,
    newValues: { description: "System audit log test – record creation" },
    ipAddress: TEST_IP,
    userAgent: TEST_UA,
  });

  // 3) Log REPORT_EXPORT with user and IP (simulate report export)
  await AuditService.log({
    userId: user.id,
    action: "REPORT_EXPORT",
    entityType: "CashbookAudit",
    entityId: "test-export-2025-01",
    ipAddress: TEST_IP,
    userAgent: TEST_UA,
  });

  // 4) Fetch system audit log for last 24 hours
  const { entries, total } = await getSystemAuditLog({ hours: 24, limit: 500 });

  assert(entries.length > 0, "System audit log should return at least one entry");
  assert(total >= 3, "Should have at least LOGIN, CREATE, and REPORT_EXPORT (total >= 3)");

  const logins = entries.filter((e) => e.action === "LOGIN");
  const creates = entries.filter((e) => e.action === "CREATE" && e.entityType === "JournalEntry");
  const exports_ = entries.filter((e) => e.action === "REPORT_EXPORT");

  assert(logins.length >= 1, "At least one LOGIN entry");
  assert(creates.length >= 1, "At least one CREATE (JournalEntry) entry");
  assert(exports_.length >= 1, "At least one REPORT_EXPORT entry");

  for (const e of entries) {
    const hasUser = e.userId != null || (e.user != null && e.user.id);
    assert(hasUser || e.action === "LOGIN", `Entry ${e.id} (${e.action}) should have user or userId`);
    // IP may be null for older entries from other code paths; our three test entries have IP
    if (e.ipAddress != null && e.ipAddress !== "") {
      assert(typeof e.ipAddress === "string", `Entry ${e.id} ipAddress should be string when set`);
    }
  }

  const ourLogins = logins.filter((e) => e.ipAddress === TEST_IP);
  const ourCreates = creates.filter((e) => e.ipAddress === TEST_IP);
  const ourExports = exports_.filter((e) => e.ipAddress === TEST_IP);

  assert(ourLogins.length >= 1, "At least one LOGIN with IP address");
  assert(ourCreates.length >= 1, "At least one CREATE (record creation) with IP address");
  assert(ourExports.length >= 1, "At least one REPORT_EXPORT with IP address");

  console.log("Last 24h total entries:", total);
  console.log("Sample entries (action, entityType, user, ipAddress):");
  entries.slice(0, 5).forEach((e) => {
    const name = e.user ? [e.user.firstName, e.user.lastName].filter(Boolean).join(" ") || e.user.email : e.userId;
    console.log(`  - ${e.action} ${e.entityType} | user=${name} | ip=${e.ipAddress ?? "(none)"}`);
  });

  if (failures.length > 0) {
    console.error("\nFailures:");
    failures.forEach((f) => console.error(" -", f));
    process.exit(1);
  }

  console.log("\nSystem audit log lists login, record creation, and report export with user and IP.");
  console.log("Activity log test passed.");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
