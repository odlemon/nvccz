// @ts-nocheck
import { prisma } from "../../utils/database";
import { hasAnySignal, isAdminViewer } from "../performanceScorecardSupport";
import { userHasEffectivePermission } from "../../config/cfoModulePermissions";

export class TaxReturnPackAccessService {
  static isTaxOfficer(user: any): boolean {
    const code = String(user?.roleCode || user?.role?.name || "").trim().toUpperCase();
    return (
      code === "CFO" ||
      code === "FUND_MGR" ||
      code === "FUND_MANAGER" ||
      hasAnySignal(user, ["tax", "tax officer", "tax_officer", "tax manager", "accountant"]) ||
      // an accounting preparer compiles returns (Compliance & Tax)
      userHasEffectivePermission(user, "manage_accounting")
    );
  }

  static isChecker(user: any): boolean {
    if (isAdminViewer(user)) return true;
    const code = String(user?.roleCode || user?.role?.name || "").trim().toUpperCase();
    return code === "CFO" || hasAnySignal(user, ["cfo", "chief financial", "managing partner", "checker"]);
  }

  static async getPack(packId: string) {
    const pack = await prisma.taxReturnPack.findUnique({
      where: { id: packId },
      include: {
        forecastEntity: { select: { id: true, name: true, type: true, baseCurrency: true } },
        fund: { select: { id: true, name: true } },
      },
    });
    if (!pack) throw Object.assign(new Error("Tax return pack not found"), { statusCode: 404 });
    return pack;
  }

  static async assertCanView(user: any, fundId?: string | null) {
    if (isAdminViewer(user)) return;
    if (TaxReturnPackAccessService.isTaxOfficer(user)) return;
    if (TaxReturnPackAccessService.isChecker(user)) return;
    if (["view_accounting", "manage_ledger", "view_financial_reports"].some((k) => userHasEffectivePermission(user, k))) return;

    if (fundId) {
      const fm = await prisma.fundManager.findFirst({
        where: { fundId, userId: user?.id },
        select: { id: true },
      });
      if (fm) return;
    }

    throw Object.assign(new Error("You do not have permission to access tax return packs"), { statusCode: 403 });
  }

  static assertCanCompile(user: any) {
    if (isAdminViewer(user)) return;
    if (TaxReturnPackAccessService.isTaxOfficer(user)) return;
    throw Object.assign(new Error("You do not have permission to compile tax return packs"), { statusCode: 403 });
  }

  static assertCanApprove(user: any) {
    if (!TaxReturnPackAccessService.isChecker(user)) {
      throw Object.assign(new Error("You do not have permission to sign off tax return packs"), { statusCode: 403 });
    }
  }

  static async assertCheckerNotMaker(makerId: string | null, checkerId: string) {
    if (!makerId || makerId !== checkerId) return;
    throw Object.assign(new Error("Checker must be different from the maker who compiled the pack"), {
      statusCode: 400,
    });
  }
}
