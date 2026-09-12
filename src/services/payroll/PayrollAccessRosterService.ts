// @ts-nocheck
/**
 * Payroll access roster — who holds payroll authority, computed from the grants the
 * route guards actually enforce.
 *
 * The Roles and Access Control screen rendered six people who were not employees of this
 * deployment, each with an MFA state, a data scope and a "last reviewed" date, above a
 * matrix of ticks — string literals in the vendored runtime (FINDING-017). It is the screen
 * an auditor opens to check maker-checker, and it showed a Payroll Manager and an
 * Approver / CFO as two different people while System Administrator held both sides.
 *
 * Nothing here is stored or configured; every value is derived at request time:
 *
 *   payroll grants   userHasEffectivePermission() — the call requireAnyPermission uses
 *   role matrix      roleHasPermissionInJson() against each role's stored grants
 *   MFA              user_mfa_totp.enabled_at
 *   self-approval    canBypassMakerCheckerSegregation() — the exact exception
 *                    PayrollRunApprovalService applies when a submitter approves
 *
 * There is deliberately no "last activity" column. User.lastSeen is maintained, but by
 * intranet homepage, post, event and newsletter views — not by sign-in and not by any
 * payroll action. A payroll processor who never opens the homepage would read as dormant,
 * which on an access review is a misleading figure rather than a missing one.
 */
import { prisma } from "../../utils/database"
import {
  roleHasPermissionInJson,
  userHasEffectivePermission,
} from "../../config/cfoModulePermissions"
import { ALL_PAYROLL_PERMISSIONS, PAYROLL_PERMISSIONS as P } from "../../config/payrollPermissions"
import { canBypassMakerCheckerSegregation } from "./payrollAccessHelpers"

function initialsOf(first?: string | null, last?: string | null): string {
  const a = String(first ?? "").trim().charAt(0)
  const b = String(last ?? "").trim().charAt(0)
  return (a + b).toUpperCase() || "--"
}

/**
 * Account state as far as the data can tell. An employee record, where one exists, wins:
 * a terminated employee who still holds payroll grants is the case an access review
 * exists to catch, so it must not be reported as merely "Active".
 */
function statusOf(u: any): string {
  if (u.employee?.terminated) return "Terminated"
  if (u.employee && u.employee.isActive === false) return "Suspended"
  if (u.mustChangePassword) return "Awaiting first sign-in"
  return "Active"
}

export class PayrollAccessRosterService {
  static async roster() {
    const [users, roles] = await Promise.all([
      prisma.user.findMany({
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          roleCode: true,
          mustChangePassword: true,
          userDepartment: true,
          role: { select: { id: true, name: true, permissions: true } },
          userMfaTotp: { select: { enabledAt: true } },
          employee: {
            select: {
              employeeNumber: true,
              departmentCode: true,
              isActive: true,
              terminated: true,
            },
          },
        },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      }),
      prisma.role.findMany({
        select: { id: true, name: true, permissions: true },
        orderBy: { name: "asc" },
      }),
    ])

    const rows = []
    for (const u of users) {
      const permissions = ALL_PAYROLL_PERMISSIONS.filter((p) => userHasEffectivePermission(u, p))
      // Holding no payroll grant means not being on a payroll access register. My Pay is
      // authenticated-only and scoped to the caller, so it is not a grant to review.
      if (permissions.length === 0) continue

      const has = (p: string) => permissions.includes(p)
      const canPrepare = has(P.runsManage)
      const canApprove = has(P.runsApprove)
      const canRelease = has(P.runsRelease)
      // Being able to prepare and approve is not by itself a conflict: the approval service
      // refuses "Checker must be different from submitter". It is a conflict only when
      // that refusal is bypassed for this user.
      const selfApproval = canPrepare && canApprove && canBypassMakerCheckerSegregation(u)
      const status = statusOf(u)

      rows.push({
        id: u.id,
        name: `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email,
        initials: initialsOf(u.firstName, u.lastName),
        email: u.email,
        roleName: u.role?.name ?? null,
        roleCode: u.roleCode ?? null,
        department: u.employee?.departmentCode ?? u.userDepartment ?? null,
        employeeNumber: u.employee?.employeeNumber ?? null,
        mfaEnrolled: Boolean(u.userMfaTotp?.enabledAt),
        mfaEnabledAt: u.userMfaTotp?.enabledAt ?? null,
        status,
        permissions,
        canPrepare,
        canApprove,
        canRelease,
        canManageAccess: has(P.accessManage),
        selfApproval,
      })
    }

    const userCountByRole = new Map<string, number>()
    for (const r of rows) {
      if (r.roleName) userCountByRole.set(r.roleName, (userCountByRole.get(r.roleName) ?? 0) + 1)
    }

    const matrixRoles = roles
      .map((role) => ({
        id: role.id,
        name: role.name,
        permissions: ALL_PAYROLL_PERMISSIONS.filter((p) => roleHasPermissionInJson({ role }, p)),
        userCount: userCountByRole.get(role.name) ?? 0,
      }))
      .filter((r) => r.permissions.length > 0)

    const privileged = rows.filter((r) => r.canManageAccess || r.canRelease || r.selfApproval)
    const mfaEnrolled = rows.filter((r) => r.mfaEnrolled).length

    return {
      users: rows,
      roles: matrixRoles,
      permissions: ALL_PAYROLL_PERMISSIONS,
      // The one segregation rule the backend enforces, stated with its real exception.
      segregation: {
        rule: "A payroll run's submitter cannot approve or reject it.",
        enforcedBy: "PayrollRunApprovalService.approve / reject",
        exception:
          "Waived for users whose role holds both runs.manage and runs.approve, and for " +
          "administrator, CFO, CIO and finance-manager roles.",
        exemptUsers: rows
          .filter((r) => r.selfApproval)
          .map((r) => ({ id: r.id, name: r.name, roleName: r.roleName })),
      },
      summary: {
        usersWithPayrollAccess: rows.length,
        privileged: privileged.length,
        mfaEnrolled,
        // null, not 0%, when there is nobody to cover: "0%" and "no data" say different things.
        mfaCoveragePct: rows.length ? Math.round((mfaEnrolled / rows.length) * 100) : null,
        selfApprovalConflicts: rows.filter((r) => r.selfApproval).length,
        terminatedWithAccess: rows.filter((r) => r.status === "Terminated").length,
        awaitingFirstSignIn: rows.filter((r) => r.status === "Awaiting first sign-in").length,
      },
      generatedAt: new Date().toISOString(),
    }
  }
}
