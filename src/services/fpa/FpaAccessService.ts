// @ts-nocheck
import { FpaError } from "./FpaError";

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
]);

const BOARD_VIEWER_CODES = new Set(["BOARD", "BOARD_VIEWER", "BOARD_MEMBER", "VIEWER"]);

const DEPT_HEAD_CODES = new Set([
  "DEPT_HEAD",
  "DEPARTMENT_HEAD",
  "HEAD_OF_DEPT",
  "BUDGET_OWNER",
]);

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

  static isDeptHead(user: any): boolean {
    return codesOf(user).some((c) => DEPT_HEAD_CODES.has(c) || c.includes("DEPT_HEAD"));
  }

  static canApprove(user: any): boolean {
    return codesOf(user).some((c) => APPROVE_LOCK_CODES.has(c));
  }

  static canLock(user: any): boolean {
    return FpaAccessService.canApprove(user);
  }

  static canEdit(user: any, opts?: { departmentId?: string | null; assignedDepartmentIds?: string[] }): boolean {
    if (!user) return false;
    if (FpaAccessService.isBoardViewer(user) && !FpaAccessService.canApprove(user)) return false;
    if (FpaAccessService.canApprove(user)) return true;
    if (FpaAccessService.isDeptHead(user)) {
      const assigned = opts?.assignedDepartmentIds || user?.assignedDepartmentIds || [];
      const deptId = opts?.departmentId;
      if (!deptId) return true;
      if (!assigned.length) return true;
      return assigned.includes(deptId);
    }
    return true;
  }

  static assertCanEditVersion(user: any, version: { status?: string; id?: string }, opts?: any) {
    if (String(version?.status || "").toUpperCase() === "LOCKED") {
      throw new FpaError(403, "VERSION_LOCKED", "Version is locked and cannot be edited");
    }
    if (String(version?.status || "").toUpperCase() === "ARCHIVED") {
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

  static assertCanLock(user: any) {
    if (!FpaAccessService.canLock(user)) {
      throw new FpaError(403, "FORBIDDEN", "You do not have permission to lock planning versions");
    }
  }
}
