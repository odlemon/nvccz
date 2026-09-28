import { Request, Response } from "express";
import { isModulePrivilegedUser, userHasEffectivePermission } from "../config/cfoModulePermissions";
import { ALL_PROCUREMENT_PERMISSIONS } from "../config/procurementPermissions";
import { fullNameOf, parseSodRestrictions } from "../config/userMasterAccess";
import { prisma } from "../utils/database";

/**
 * The signed-in user's effective procurement grants.
 *
 * The V23 workspace gates its screens and controls on these, so a control the role cannot
 * use is explained before the click rather than failing with a 403 after it. Each grant is
 * evaluated with userHasEffectivePermission, the same check requireAnyPermission applies, so
 * the UI and the API cannot disagree about what a role may do.
 *
 * Department role travels with it because requisition approval is not a grant: the approval
 * engine admits the requisition's own department HEAD or DEPUTY.
 */
export class ProcurementAccessController {
  static async getMyAccess(req: Request, res: Response) {
    try {
      const user = (req as any).user;
      if (!user) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
      }

      const permissions = ALL_PROCUREMENT_PERMISSIONS.filter((p) =>
        userHasEffectivePermission(user, p),
      );

      const delegate = user.delegatedApproverId
        ? await prisma.user.findUnique({
            where: { id: user.delegatedApproverId },
            select: { firstName: true, lastName: true, email: true },
          })
        : null;

      return res.json({
        success: true,
        data: {
          userId: user.id,
          email: user.email,
          name: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email,
          roleName: user.role?.name ?? null,
          roleCode: user.roleCode ?? null,
          department: user.userDepartment ?? null,
          departmentRole: user.departmentRole ?? null,
          isPrivileged: isModulePrivilegedUser(user),
          procurementFunction: user.procurementFunction ?? null,
          accessProfile: user.accessProfile ?? null,
          approvalLevel: user.approvalLevel ?? null,
          approvalLimit: user.approvalLimitAmount != null ? Number(user.approvalLimitAmount) : null,
          delegatedApprover: delegate
            ? { id: user.delegatedApproverId, name: fullNameOf(delegate) || delegate.email }
            : null,
          costCentre: user.costCentre ?? null,
          branch: user.branch ?? null,
          businessUnit: user.businessUnit ?? null,
          sodRestrictions: parseSodRestrictions(user.sodRestrictions),
          permissions,
        },
      });
    } catch (error) {
      console.error("Error resolving procurement access:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to resolve procurement access",
      });
    }
  }
}
