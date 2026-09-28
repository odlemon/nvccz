// @ts-nocheck
/** GET /api/accounting/access: who can do what in Accounting, worked out exactly as the server decides each request
 *  (role permissions, the CFO's standing grants, the user's own profile) — the permissions, the roles that grant them,
 *  every active user who holds any, and where one person holds both halves of a control. Roles and users are changed
 *  in Admin; this is the review. Mounted behind the Accounting access guard (read keys). */
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { prisma } from "../utils/database";
import { userHasEffectivePermission, isModulePrivilegedUser } from "../config/cfoModulePermissions";
import { ACC } from "../config/accountingAccess";
import { isExternalPortalUser } from "../utils/portalAuth";

const router = express.Router();
router.use(authenticate);

export const ACCESS_KEYS: Array<{ key: string; label: string; allows: string }> = [
  { key: ACC.VIEW, label: "View accounting", allows: "Read the accounting pages and records" },
  { key: ACC.MANAGE, label: "Prepare", allows: "Prepare journals, invoices, expenses, assets, accounts and schedules" },
  { key: ACC.LEDGER_VIEW, label: "View ledger", allows: "Read the general ledger" },
  { key: ACC.LEDGER_POST, label: "Post / approve", allows: "Post others' journals, void, send credit notes, switch on recurring journals" },
  { key: ACC.REPORTS, label: "Financial reports", allows: "Run the financial statements" },
  { key: ACC.BANK_REC, label: "Bank reconciliation", allows: "Import statements, match and finish reconciliations" },
  { key: ACC.PERIOD_VIEW, label: "View periods", allows: "See period locks" },
  { key: ACC.PERIOD_MANAGE, label: "Lock periods", allows: "Lock and unlock periods" },
  { key: ACC.PERIOD_OVERRIDE, label: "Period override", allows: "Post into a locked period; lock with close tasks open" },
  { key: ACC.PERIOD_AUDIT, label: "Period audit", allows: "Read the period-lock log" },
  { key: ACC.TREASURY, label: "Book investments", allows: "Book, roll over and settle short-term investments" },
  { key: ACC.TREASURY_APPROVE, label: "Approve investments", allows: "Approve investment interest and settlements" },
  { key: "accounting.timesheets.view", label: "View timesheets", allows: "Read timesheets and projects" },
  { key: "accounting.timesheets.manage", label: "Approve timesheets", allows: "Approve and manage timesheets" },
  { key: ACC.ACCESS, label: "Manage access", allows: "Review accounting access" },
];
/** Two halves of one control held by one person: allowed (the system still stops anyone completing their own item), but
 *  worth a periodic look. */
const PAIRS = [
  { id: "prepare-post", label: "Prepare and post journals", keys: [ACC.MANAGE, ACC.LEDGER_POST] },
  { id: "book-approve", label: "Book and approve investments", keys: [ACC.TREASURY, ACC.TREASURY_APPROVE] },
  { id: "reconcile-post", label: "Reconcile the bank and void cash entries", keys: [ACC.BANK_REC, ACC.LEDGER_POST] },
  { id: "lock-override", label: "Lock periods and post into locked ones", keys: [ACC.PERIOD_MANAGE, ACC.PERIOD_OVERRIDE] },
];

router.get("/", async (req: any, res: any) => {
  try {
    const keys = ACCESS_KEYS.map((k) => k.key);
    const users = await prisma.user.findMany({
      where: { status: "ACTIVE" },
      include: { role: { select: { id: true, name: true, permissions: true } } },
    });
    const holders = [];
    const roleMap = new Map();
    for (const u of users) {
      if (isExternalPortalUser(u)) continue;
      const held = keys.filter((k) => userHasEffectivePermission(u, k));
      if (!held.length) continue;
      holders.push({ id: u.id, name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email, email: u.email, role: u.role?.name || u.roleCode || "—", roleId: u.role?.id || null, keys: held, privileged: isModulePrivilegedUser(u), lastLoginAt: u.lastLoginAt || null });
      const r = roleMap.get(u.role?.id) || { id: u.role?.id, name: u.role?.name || u.roleCode || "—", users: 0, keys: new Set() };
      r.users++; held.forEach((k) => r.keys.add(k));
      roleMap.set(u.role?.id, r);
    }
    const roles = [...roleMap.values()].map((r) => ({ ...r, keys: keys.filter((k) => r.keys.has(k)) })).sort((a, b) => b.keys.length - a.keys.length || a.name.localeCompare(b.name));
    const pairs = PAIRS.map((p) => ({ id: p.id, label: p.label, users: holders.filter((h) => p.keys.every((k) => h.keys.includes(k))).length }));
    holders.sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));
    res.json({ success: true, data: { keys: ACCESS_KEYS, roles, users: holders, pairs, pairKeys: Object.fromEntries(PAIRS.map((p) => [p.id, p.keys])) } });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e?.message || "Failed to load accounting access" });
  }
});

export default router;
