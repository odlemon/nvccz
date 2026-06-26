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
