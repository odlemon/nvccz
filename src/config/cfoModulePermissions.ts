// @ts-nocheck
import { hasAnySignal, isAdminViewer } from "../services/performanceScorecardSupport";

export type PermissionEntry = { name: string; value: boolean };

/** Admin-equivalent module access for CFO — accounting, procurement, payroll shell, forecasting shell, events. */
export const CFO_MODULE_PERMISSIONS: PermissionEntry[] = [
  { name: "view_dashboard", value: true },
  { name: "view_reports", value: true },
  { name: "view_accounting", value: true },
  { name: "manage_accounting", value: true },
  { name: "view_ledger", value: true },
  { name: "manage_ledger", value: true },
  { name: "view_financial_reports", value: true },
  { name: "manage_financial_reports", value: true },
  { name: "bank_reconciliation", value: true },
  { name: "accounting.period_lock.view", value: true },
  { name: "accounting.period_lock.manage", value: true },
  { name: "accounting.period_lock.override", value: true },
  { name: "accounting.period_lock.audit_view", value: true },
  { name: "view_business_operations", value: true },
  { name: "manage_business_operations", value: true },
  { name: "view_events", value: true },
  { name: "create_events", value: true },
  { name: "edit_events", value: true },
  { name: "delete_events", value: true },
];

const CFO_PERMISSION_NAMES = new Set(CFO_MODULE_PERMISSIONS.map((p) => p.name));

export function isCfoUser(user: any): boolean {
  if (!user) return false;
  const code = String(user.roleCode || "")
    .trim()
    .toUpperCase();
  if (code === "CFO") return true;
  return hasAnySignal(user, ["chief financial officer", "cfo"]);
}

export function roleHasPermissionInJson(
  user: any,
  permissionName: string
): boolean {
  const perms = user?.role?.permissions;
  if (!Array.isArray(perms)) return false;
  return perms.some((p: any) => p?.name === permissionName && p?.value === true);
}

export function userHasEffectivePermission(user: any, permissionName: string): boolean {
  if (roleHasPermissionInJson(user, permissionName)) return true;
  if (isCfoUser(user) && CFO_PERMISSION_NAMES.has(permissionName)) return true;
  return false;
}

/** Admin or CFO — for module controllers (procurement, events) without granting global admin. */
export function isModulePrivilegedUser(user: any): boolean {
  if (!user) return false;
  if (isAdminViewer(user)) return true;
  const code = String(user.roleCode || "")
    .trim()
    .toUpperCase();
  if (code === "ADMIN") return true;
  return isCfoUser(user);
}

export function normalizeRoleToken(value: unknown): string {
  return String(value || "").toLowerCase().trim();
}

/** Legacy `authorize([...])` role-name list match (case-insensitive, roleCode, CFO alias). */
export function userMatchesAuthorizeRoleList(user: any, allowedRoles: string[]): boolean {
  const allowed = allowedRoles.map(normalizeRoleToken);
  const name = normalizeRoleToken(user?.role?.name);
  const code = normalizeRoleToken(user?.roleCode);
  if (allowed.includes(name) || (code && allowed.includes(code))) return true;
  if (name === "chief financial officer" && allowed.includes("cfo")) return true;
  return false;
}

/**
 * CFO bypass for legacy `authorize(["admin","accountant",...])` routes.
 * Does not grant admin-only or investment-manager routes.
 */
export function cfoPassesLegacyAuthorize(user: any, allowedRoles: string[]): boolean {
  if (!isCfoUser(user)) return false;
  const allowed = new Set(allowedRoles.map(normalizeRoleToken));
  const hasInvestmentScope = ["fund_manager", "investments_manager"].some((s) => allowed.has(s));

  if (allowed.has("accountant") && userHasEffectivePermission(user, "view_accounting")) {
    return true;
  }
  if (
    allowed.has("finance_manager") &&
    !hasInvestmentScope &&
    userHasEffectivePermission(user, "view_accounting")
  ) {
    return true;
  }
  if (["hr_manager", "payroll_manager"].some((s) => allowed.has(s))) {
    return true;
  }
  if (
    (allowed.has("manager") || allowed.has("user")) &&
    userHasEffectivePermission(user, "view_financial_reports")
  ) {
    return true;
  }
  if (
    allowed.has("procurement") ||
    allowed.has("proc_mgr") ||
    (allowed.has("operations") && userHasEffectivePermission(user, "view_business_operations"))
  ) {
    return true;
  }
  return false;
}

export function mergeCfoModulePermissions(
  existing: PermissionEntry[] | null | undefined
): PermissionEntry[] {
  const merged = new Map<string, PermissionEntry>();
  for (const p of Array.isArray(existing) ? existing : []) {
    if (p?.name) merged.set(p.name, { name: p.name, value: !!p.value });
  }
  for (const p of CFO_MODULE_PERMISSIONS) {
    merged.set(p.name, { ...p });
  }
  return [...merged.values()];
}

/** Role JSON merged with CFO module grants — for period-lock override and similar checks. */
export function getEffectiveRolePermissions(user: any): PermissionEntry[] {
  return mergeCfoModulePermissions(
    Array.isArray(user?.role?.permissions) ? user.role.permissions : []
  );
}
