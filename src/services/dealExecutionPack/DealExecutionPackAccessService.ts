// @ts-nocheck
import { prisma } from "../../utils/database";
import { hasAnySignal, isAdminViewer } from "../performanceScorecardSupport";

export class DealExecutionPackAccessService {
  static isLegalCoordinator(user: any): boolean {
    return hasAnySignal(user, ["legal", "legal coordinator", "legal_coordinator", "cco legal"]);
  }

  static isCco(user: any): boolean {
    const code = String(user?.roleCode || user?.role?.name || "").trim().toUpperCase();
    return code === "CCO" || hasAnySignal(user, ["chief compliance", "cco", "compliance officer"]);
  }

  static isIcMember(user: any): boolean {
    return hasAnySignal(user, ["investment committee", "ic member", "ic_member", "ic"]);
  }

  static isAnalyst(user: any): boolean {
    const code = String(user?.roleCode || user?.role?.name || "").trim().toUpperCase();
    return (
      code === "ANALYST" ||
      code === "FUND_MGR" ||
      code === "FUND_MANAGER" ||
      hasAnySignal(user, ["analyst", "fund_manager", "fund manager", "deal analyst"])
    );
  }

  static async getPack(packId: string) {
    const pack = await prisma.dealExecutionPack.findUnique({
      where: { id: packId },
      include: {
        fund: { select: { id: true, name: true } },
        portfolioCompany: { select: { id: true, name: true } },
        application: { select: { id: true, businessName: true, dealReference: true } },
      },
    });
    if (!pack) throw Object.assign(new Error("Deal execution pack not found"), { statusCode: 404 });
    return pack;
  }

  static async assertFundAccess(user: any, fundId: string) {
    if (isAdminViewer(user)) return;
    if (DealExecutionPackAccessService.isAnalyst(user)) return;
    if (DealExecutionPackAccessService.isLegalCoordinator(user)) return;
    if (DealExecutionPackAccessService.isCco(user)) return;
    if (DealExecutionPackAccessService.isIcMember(user)) return;

    const fm = await prisma.fundManager.findFirst({
      where: { fundId, userId: user?.id },
      select: { id: true },
    });
    if (fm) return;

    throw Object.assign(new Error("You do not have permission to access deal execution packs"), {
      statusCode: 403,
    });
  }

  static assertCanEditWorkspace(user: any) {
    if (isAdminViewer(user)) return;
    if (DealExecutionPackAccessService.isAnalyst(user)) return;
    if (DealExecutionPackAccessService.isLegalCoordinator(user)) return;
    throw Object.assign(new Error("You do not have permission to edit deal execution packs"), {
      statusCode: 403,
    });
  }

  static assertCanExecute(user: any) {
    if (isAdminViewer(user)) return;
    if (DealExecutionPackAccessService.isCco(user)) return;
    if (DealExecutionPackAccessService.isIcMember(user)) return;
    throw Object.assign(new Error("You do not have permission to execute deal packs"), { statusCode: 403 });
  }

  static assertSignerMatchesRole(user: any, roleCode: string, allowAdminBypass = true) {
    if (allowAdminBypass && isAdminViewer(user)) return;
    const role = String(roleCode || "").toUpperCase();
    if (role === "LEGAL_COORDINATOR" && DealExecutionPackAccessService.isLegalCoordinator(user)) return;
    if (role === "CCO" && DealExecutionPackAccessService.isCco(user)) return;
    if (role === "IC_MEMBER" && DealExecutionPackAccessService.isIcMember(user)) return;
    if (isAdminViewer(user)) return;
    throw Object.assign(new Error(`You are not authorized to sign as ${roleCode}`), { statusCode: 403 });
  }
}
