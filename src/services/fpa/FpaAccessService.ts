// @ts-nocheck
import { FpaError } from "./FpaError";

// Legacy short codes (set on User.roleCode directly, e.g. seeded test accounts)
// PLUS the real role names as configured live in Settings > Roles today
// (Role has no `code` column - only `name` - so most real users are matched
// by their normalized display name, not a short code). Confirmed live: the
// dynamically-created "Chief Financial Officer" and "FP&A Version Lock
// Authority" roles did NOT match the old CFO-only/FORECAST_LOCK-only codes,
// so a real CFO or the role built specifically to hold lock authority had no
// more access than an unrelated staff member - fixed by adding their actual
// normalized names.
const APPROVE_LOCK_CODES = new Set([
  "CFO",
  "SYSADMIN",
  "ADMIN",
  "SUPER_ADMIN",
  "SYSTEM_ADMIN",
  "FIN_MGR",
  "FIN_MANAGER",
  "FINANCE_MANAGER",
  "FORECAST_LOCK",
  "CEO",
  "CHIEF_FINANCIAL_OFFICER",
  "FP&A_VERSION_LOCK_AUTHORITY",
  "SYSTEM_ADMINISTRATOR",
]);

// Finance-team preparer roles: can edit/prepare forecasts day-to-day but
// cannot approve or lock (that stays limited to APPROVE_LOCK_CODES). There is
// no dedicated "FP&A Analyst" role seeded in this system - the closest real
// personas are these Finance-department roles.
const FPA_PREPARER_CODES = new Set([
  "FINANCE_OFFICER",
  "FINANCE_ASSISTANT",
  "ACCOUNTANT",
  "FINANCE_MEMBER",
]);

// Final sign-off tier: CFO-approval and locking, deliberately narrower than
// APPROVE_LOCK_CODES. The frontend's own permission matrix
// (lib/config/fpa-permissions.ts) already draws this line correctly - FIN_MGR
// ("FP&A Manager") gets REVIEW_SUBMISSIONS but not APPROVE_BUDGET/
// LOCK_VERSION, only CFO_ACTIONS has those - but the backend had been
// enforcing every "approve" tier with the same permissive set, so a Finance
// Manager could CFO-approve/lock a cycle via the API even though the UI
// correctly hid the button. Confirmed live: logged in as a real Finance
// Manager account and the Workflow screen correctly refused to show CFO
// Approval actions ("You do not have permission..."), which is what led to
// finding this backend/frontend mismatch.
const FINAL_APPROVE_CODES = new Set([
  "CFO",
  "CEO",
  "CHIEF_FINANCIAL_OFFICER",
  "SYSADMIN",
  "ADMIN",
  "SUPER_ADMIN",
  "SYSTEM_ADMIN",
  "SYSTEM_ADMINISTRATOR",
  "FORECAST_LOCK",
  "FP&A_VERSION_LOCK_AUTHORITY",
]);

const BOARD_VIEWER_CODES = new Set(["BOARD", "BOARD_VIEWER", "BOARD_MEMBER", "VIEWER"]);

function roleCode(user: any): string {
  return String(user?.roleCode || user?.role?.code || "")
    .trim()
    .toUpperCase();
}

function roleName(user: any): string {
  return String(user?.role?.name || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
}

function codesOf(user: any): string[] {
  const c = roleCode(user);
  const n = roleName(user);
  return [c, n].filter(Boolean);
}

export class FpaAccessService {
  static isBoardViewer(user: any): boolean {
    return codesOf(user).some((c) => BOARD_VIEWER_CODES.has(c) || c.includes("BOARD"));
  }

  static canApprove(user: any): boolean {
    return codesOf(user).some((c) => APPROVE_LOCK_CODES.has(c));
  }

  /** CFO-approval and lock actions specifically - narrower than canApprove(). */
  static canFinalApprove(user: any): boolean {
    return codesOf(user).some((c) => FINAL_APPROVE_CODES.has(c));
  }

  static canLock(user: any): boolean {
    return FpaAccessService.canFinalApprove(user);
  }

  static canEdit(user: any, opts?: { departmentId?: string | null; assignedDepartmentIds?: string[] }): boolean {
    if (!user) return false;
    if (FpaAccessService.isBoardViewer(user) && !FpaAccessService.canApprove(user)) return false;
    if (FpaAccessService.canApprove(user)) return true;
    const assigned = opts?.assignedDepartmentIds || user?.assignedDepartmentIds || [];
    const deptId = opts?.departmentId;
    // When cycle-scoped department list is provided, enforce it for all non-approvers
    // (this is how a real department head/budget owner gets scoped edit access -
    // via being assigned as a cycle owner - not via their job-title role name).
    if (assigned.length) {
      if (!deptId) return false;
      return assigned.includes(deptId);
    }
    // Finance-team preparer roles may edit even before any cycle assigns them
    // department scope (e.g. building out a model in Model Builder).
    if (codesOf(user).some((c) => FPA_PREPARER_CODES.has(c))) return true;
    // Everyone else (unrelated staff roles with no FP&A involvement at all -
    // Sales, HR, IT, Marketing, Legal, Procurement, Operations, etc.) is
    // read-only by default. Previously this fell through to `return true`,
    // meaning any authenticated internal staff member - regardless of role -
    // could edit any planning cycle's cells; confirmed live and closed.
    return false;
  }

  static async resolveCycleDepartmentIds(user: any, cycleId?: string | null): Promise<string[] | null> {
    if (!cycleId) return null;
    if (FpaAccessService.canApprove(user)) return null; // unrestricted
    const { prisma } = await import("../../utils/database");
    const modelOwners = await prisma.modelPlanningCycleOwner.findMany({
      where: { cycleId: String(cycleId), assigneeId: user.id },
      select: { departmentId: true },
    });
    if (modelOwners.length) {
      return modelOwners.map((o) => o.departmentId);
    }
    const isModelCycle = await prisma.modelPlanningCycle.findUnique({
      where: { id: String(cycleId) },
      select: { id: true },
    });
    if (isModelCycle) {
      // Model planning cycle exists but this user is not an owner → empty (no edit).
      return [];
    }
    const owners = await prisma.planningBudgetCycleOwner.findMany({
      where: { cycleId: String(cycleId), assigneeId: user.id },
      select: { departmentId: true },
    });
    return owners.map((o) => o.departmentId);
  }

  static assertCanEditVersion(
    user: any,
    version: { status?: string; id?: string },
    opts?: {
      departmentId?: string | null;
      assignedDepartmentIds?: string[];
      allowLockedPublished?: boolean;
    }
  ) {
    const status = String(version?.status || "").toUpperCase();
    if (status === "LOCKED" && !opts?.allowLockedPublished) {
      throw new FpaError(403, "LOCKED_VERSION", "Version is locked and cannot be edited");
    }
    if (status === "ARCHIVED") {
      throw new FpaError(403, "VERSION_ARCHIVED", "Version is archived and cannot be edited");
    }
    if (!FpaAccessService.canEdit(user, opts)) {
      throw new FpaError(403, "FORBIDDEN", "You do not have permission to edit this planning version");
    }
  }

  static assertCanApprove(user: any) {
    if (!FpaAccessService.canApprove(user)) {
      throw new FpaError(403, "FORBIDDEN", "You do not have permission to approve planning workflows");
    }
  }

  static assertCanFinalApprove(user: any) {
    if (!FpaAccessService.canFinalApprove(user)) {
      throw new FpaError(403, "FORBIDDEN", "Only the CFO (or an equivalent lock authority) can give final approval");
    }
  }

  static assertCanLock(user: any) {
    if (!FpaAccessService.canLock(user)) {
      throw new FpaError(403, "FORBIDDEN", "You do not have permission to lock planning versions");
    }
  }
}
