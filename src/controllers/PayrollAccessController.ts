// @ts-nocheck
/**
 * Payroll V6 — "what may I do here?" for the signed-in user.
 *
 * The login payload carries roleName/roleCode but not the role's permission
 * array, so the frontend had no way to gate the payroll UI on real grants. The
 * alternative — re-deriving entitlement from roleCode in the client — would be
 * a second copy of the authorisation rules that drifts from the backend the
 * first time a grant changes. This returns the effective grants instead, so the
 * UI shows the same answer the route guards will enforce.
 *
 * Authenticated-only: any signed-in user may ask what they themselves can do.
 * It never returns another user's entitlement.
 */
import type { Request, Response } from "express"
import { prisma } from "../utils/database"
import { userHasEffectivePermission } from "../config/cfoModulePermissions"
import { ALL_PAYROLL_PERMISSIONS } from "../config/payrollPermissions"
import { PayrollAuditService } from "../services/payroll/PayrollAuditService"

export class PayrollAccessController {
  static async getMyAccess(req: Request, res: Response) {
    try {
      const user = (req as any).user
      if (!user) {
        return res.status(401).json({ success: false, message: "Unauthorized" })
      }

      const permissions = ALL_PAYROLL_PERMISSIONS.filter((p) =>
        userHasEffectivePermission(user, p),
      )

      // My Pay needs the caller's own employee record id to resolve payslips.
      const employee = await prisma.employee.findUnique({
        where: { userId: user.id },
        select: {
          id: true,
          employeeNumber: true,
          departmentCode: true,
          isActive: true,
          terminated: true,
        },
      })

      return res.json({
        success: true,
        data: {
          userId: user.id,
          email: user.email,
          roleName: user.role?.name ?? null,
          roleCode: user.roleCode ?? null,
          permissions,
          employee: employee ?? null,
        },
      })
    } catch (error) {
      console.error("Error resolving payroll access:", error)
      return res.status(500).json({
        success: false,
        message: "Failed to resolve payroll access",
        error: error instanceof Error ? error.message : "Unknown error",
      })
    }
  }

  /**
   * Payroll audit trail, newest first.
   *
   * Guarded by payroll.audit.view on the route. Returns an empty trail rather
   * than a 500 when the table has not been created yet, because it is managed
   * by a migration script outside Prisma.
   */
  static async listAudit(req: Request, res: Response) {
    try {
      const { limit, entityType, entityId, action } = req.query as Record<string, string>
      const data = await PayrollAuditService.list({
        limit: limit ? Number(limit) : 100,
        entityType,
        entityId,
        action,
      })
      return res.json({ success: true, data })
    } catch (error) {
      console.error("Error reading payroll audit trail:", error)
      return res.status(500).json({
        success: false,
        message: "Failed to read the payroll audit trail",
        error: error instanceof Error ? error.message : "Unknown error",
      })
    }
  }
}
