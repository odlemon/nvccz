/**
 * Payroll V6 permission catalogue and default role grants.
 *
 * Naming follows the house convention already used by the performance module:
 *   <module>.<area>.<view|manage>
 *
 * IMPORTANT (code + data coupling): adding a guard here does nothing on its own.
 * Roles carry their grants in `Role.permissions` (a JSON array of {name,value}).
 * A guard shipped without a matching grant produces a 403 on every request.
 * Run `npm run db:migrate:payroll-v6-permissions` after changing this file.
 */

export const PAYROLL_PERMISSIONS = {
  dashboardView: "payroll.dashboard.view",

  employeesView: "payroll.employees.view",
  employeesManage: "payroll.employees.manage",

  runsView: "payroll.runs.view",
  runsManage: "payroll.runs.manage",
  /** Maker-checker checker side. Deliberately NOT granted to the same role that prepares runs. */
  runsApprove: "payroll.runs.approve",
  /** Releasing bank files / distributing payslips. */
  runsRelease: "payroll.runs.release",

  componentsView: "payroll.components.view",
  componentsManage: "payroll.components.manage",

  taxView: "payroll.tax.view",
  taxManage: "payroll.tax.manage",

  leaveView: "payroll.leave.view",
  leaveManage: "payroll.leave.manage",

  trainingView: "payroll.training.view",
  trainingManage: "payroll.training.manage",

  vaultView: "payroll.vault.view",
  vaultManage: "payroll.vault.manage",

  reportsView: "payroll.reports.view",
  reportsManage: "payroll.reports.manage",

  auditView: "payroll.audit.view",

  accessView: "payroll.access.view",
  accessManage: "payroll.access.manage",

  settingsView: "payroll.settings.view",
  settingsManage: "payroll.settings.manage",

  vendorsView: "payroll.vendors.view",
  vendorsManage: "payroll.vendors.manage",

  calendarView: "payroll.calendar.view",
  calendarManage: "payroll.calendar.manage",

  exceptionsView: "payroll.exceptions.view",
  exceptionsManage: "payroll.exceptions.manage",

  // Inputs & Validation and Onboarding had no backend at all, so no permission was ever minted
  // for them. Added with the endpoints, and granted below in the same change — a guard shipped
  // without its grant 403s every request, which has bitten this codebase twice.
  inputsView: "payroll.inputs.view",
  inputsManage: "payroll.inputs.manage",

  onboardingView: "payroll.onboarding.view",
  onboardingManage: "payroll.onboarding.manage",
} as const

export type PayrollPermission =
  (typeof PAYROLL_PERMISSIONS)[keyof typeof PAYROLL_PERMISSIONS]

export const ALL_PAYROLL_PERMISSIONS: string[] = Object.values(PAYROLL_PERMISSIONS)

const P = PAYROLL_PERMISSIONS

/** Every read permission — convenience bundle for view-only roles. */
const ALL_VIEW: string[] = ALL_PAYROLL_PERMISSIONS.filter((n) => n.endsWith(".view"))

/**
 * Default grants per role NAME (matched case-insensitively against `Role.name`,
 * falling back to `Role.roleCode`). Roles absent from this map are left untouched
 * by the migration, so hand-tuned grants elsewhere are never clobbered.
 *
 * Segregation of duties: `payroll.runs.manage` (maker) and `payroll.runs.approve`
 * (checker) are never granted to the same non-admin role.
 */
export const PAYROLL_ROLE_GRANTS: Record<string, string[]> = {
  // Full administrative access, both sides of maker-checker.
  "System Administrator": ALL_PAYROLL_PERMISSIONS,
  admin: ALL_PAYROLL_PERMISSIONS,

  // Prepares payroll; cannot approve its own work.
  "Payroll Manager": [
    P.dashboardView,
    P.employeesView,
    P.employeesManage,
    P.runsView,
    P.runsManage,
    P.runsRelease,
    P.componentsView,
    P.componentsManage,
    P.taxView,
    P.taxManage,
    P.leaveView,
    P.leaveManage,
    P.trainingView,
    P.vaultView,
    P.vaultManage,
    P.reportsView,
    P.reportsManage,
    P.auditView,
    P.calendarView,
    P.inputsView,
    P.onboardingView,
    P.calendarManage,
    P.inputsView,
    P.inputsManage,
    P.onboardingView,
    P.onboardingManage,
    P.exceptionsView,
    P.exceptionsManage,
    P.vendorsView,
    P.settingsView,
  ],

  // People data owner: employees, leave, training. Sees payroll, does not run it.
  "HR Manager": [
    P.dashboardView,
    P.employeesView,
    P.employeesManage,
    P.runsView,
    P.componentsView,
    P.taxView,
    P.leaveView,
    P.leaveManage,
    P.trainingView,
    P.trainingManage,
    P.vaultView,
    P.vaultManage,
    P.reportsView,
    P.auditView,
    P.calendarView,
    P.inputsView,
    P.onboardingView,
    P.exceptionsView,
  ],

  "HR Officer": [
    P.dashboardView,
    P.employeesView,
    P.leaveView,
    P.leaveManage,
    P.trainingView,
    P.vaultView,
    P.reportsView,
  ],

  // Checker side of maker-checker plus release authority.
  "Chief Financial Officer": [
    ...ALL_VIEW,
    P.runsApprove,
    P.runsRelease,
    P.reportsManage,
  ],
  CEO: [...ALL_VIEW, P.runsApprove],
  "Finance Manager": [
    ...ALL_VIEW,
    P.runsApprove,
    P.componentsManage,
    P.reportsManage,
  ],

  "Compliance Officer": [
    P.dashboardView,
    P.employeesView,
    P.runsView,
    P.taxView,
    P.taxManage,
    P.trainingView,
    P.trainingManage,
    P.vaultView,
    P.reportsView,
    P.reportsManage,
    P.auditView,
    P.exceptionsView,
  ],

  "Internal Auditor": [...ALL_VIEW],
  "External Auditor": [P.auditView, P.reportsView, P.runsView],

  // Line managers: visibility over their people, no compensation editing.
  "Operations Manager": [P.dashboardView, P.employeesView, P.leaveView, P.trainingView],

  // Plain staff get nothing here — My Pay self-service is authenticated-only
  // and scoped to the caller's own employee record, so it needs no grant.
}

/**
 * Areas whose write routes must never be reachable by an authenticated user
 * with no payroll grant at all. Used by tests and the verification script.
 */
export const PAYROLL_WRITE_PERMISSIONS: string[] = ALL_PAYROLL_PERMISSIONS.filter(
  (n) => n.endsWith(".manage") || n.endsWith(".approve") || n.endsWith(".release"),
)
