// @ts-nocheck
/**
 * Payroll HR access + admin bypass for maker-checker (single admin UAT / ops).
 */
import type { Request, Response } from "express";
import { prisma } from "../../utils/database";
import { roleHasPermissionInJson } from "../../config/cfoModulePermissions";
import { PAYROLL_WRITE_PERMISSIONS, PAYROLL_PERMISSIONS } from "../../config/payrollPermissions";

const HR_ROLE_NAMES = new Set([
  "admin",
  "administrator",
  "hr_manager",
  "payroll_manager",
  "finance_manager",
  "system_administrator",
  "cio",
  "chief_financial_officer",
  "cfo",
]);

const PRIVILEGED_ROLE_CODES = new Set([
  "ADMIN",
  "SYSADMIN",
  "SUPER_ADMIN",
  "SYSTEM_ADMIN",
  "FIN_MGR",
  "HR_MGR",
  "PAYROLL_MGR",
  "CFO",
]);

export function normalizeRoleName(name?: string | null): string {
  return String(name || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_");
}

export function isPayrollPrivilegedUser(user: {
  role?: { name?: string | null } | null;
  roleCode?: string | null;
} | null | undefined): boolean {
  if (!user) return false;
  // The permission catalogue is authoritative. This helper predates it and
  // matched on a hardcoded role-name list, which meant a role holding
  // payroll.runs.approve (e.g. CEO) was still refused by the controller after
  // the route guard had already let it through. Check the grant first, and keep
  // the name/code lists below as a fallback for routes without a guard.
  if (PAYROLL_WRITE_PERMISSIONS.some((p) => roleHasPermissionInJson(user, p))) return true;
  const code = String(user.roleCode || "").toUpperCase();
  if (PRIVILEGED_ROLE_CODES.has(code)) return true;
  const name = normalizeRoleName(user.role?.name);
  if (HR_ROLE_NAMES.has(name)) return true;
  if (name.includes("admin")) return true;
  if (name.includes("finance_manager") || name.includes("hr_manager") || name.includes("payroll_manager")) return true;
  return false;
}

/** Admin / sysadmin may approve own maker-checker submissions (UAT + small teams). */
export function canBypassMakerCheckerSegregation(user: {
  role?: { name?: string | null } | null;
  roleCode?: string | null;
} | null | undefined): boolean {
  if (!user) return false;
  // Only a role that holds BOTH sides of maker-checker may self-approve. A
  // checker-only role (CEO) must never be allowed to approve its own
  // submission, so this stays narrower than isPayrollPrivilegedUser.
  if (
    roleHasPermissionInJson(user, PAYROLL_PERMISSIONS.runsManage) &&
    roleHasPermissionInJson(user, PAYROLL_PERMISSIONS.runsApprove)
  ) {
    return true;
  }
  const code = String(user.roleCode || "").toUpperCase();
  if (code === "ADMIN" || code === "SYSADMIN" || code === "SUPER_ADMIN" || code === "FIN_MGR" || code === "CFO") return true;
  const name = normalizeRoleName(user.role?.name);
  return (
    name === "admin" ||
    name === "administrator" ||
    name.includes("system_admin") ||
    name === "cio" ||
    name === "chief_financial_officer" ||
    name === "cfo" ||
    name === "finance_manager"
  );
}

export async function isPrivilegedCheckerUserId(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: true },
  });
  return canBypassMakerCheckerSegregation(user);
}

export function assertPayrollHrAccess(req: Request, res: Response): boolean {
  if (isPayrollPrivilegedUser((req as any).user)) return true;
  res.status(403).json({
    success: false,
    message: "Insufficient role for this action (requires admin, hr_manager, payroll_manager, or finance_manager)",
  });
  return false;
}
