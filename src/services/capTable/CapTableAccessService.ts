// @ts-nocheck
import { prisma } from "../../utils/database";
import { hasAnySignal, isAdminViewer } from "../performanceScorecardSupport";

export class CapTableAccessService {
  static roleCode(user: any): string {
    return String(user?.roleCode || user?.role?.name || "").trim().toUpperCase();
  }

  static isFundManager(user: any): boolean {
    const code = CapTableAccessService.roleCode(user);
    return (
      code === "FUND_MGR" ||
      code === "FUND_MANAGER" ||
      hasAnySignal(user, ["fund_manager", "fund manager", "fund_mgr"])
    );
  }

  static isCio(user: any): boolean {
    return CapTableAccessService.roleCode(user) === "CIO" || hasAnySignal(user, ["cio", "chief investment"]);
  }

  static isCfo(user: any): boolean {
    return hasAnySignal(user, ["cfo", "chief financial"]);
  }

  static isLegal(user: any): boolean {
    return hasAnySignal(user, ["legal", "counsel", "corporate secretary"]);
  }

  static isCorpSecretary(user: any): boolean {
    return hasAnySignal(user, ["corporate secretary", "corp secretary", "company secretary"]);
  }

  static isBoardViewer(user: any): boolean {
    const code = CapTableAccessService.roleCode(user);
    return ["BOARD_CHAIR", "BOARD_MEMBER", "INV_COMM_MEM"].includes(code);
  }

  static async getPortfolioCompany(portfolioCompanyId: string) {
    const company = await prisma.portfolioCompany.findUnique({
      where: { id: portfolioCompanyId },
      select: {
        id: true,
        name: true,
        userId: true,
        fundId: true,
        capTableRegistry: { select: { id: true } },
      },
    });
    if (!company) {
      throw Object.assign(new Error("Portfolio company not found"), { statusCode: 404 });
    }
    return company;
  }

  static async assertCanView(user: any, portfolioCompanyId: string) {
    const company = await CapTableAccessService.getPortfolioCompany(portfolioCompanyId);
    if (isAdminViewer(user)) return company;
    if (CapTableAccessService.isFundManager(user)) return company;
    if (CapTableAccessService.isCio(user)) return company;
    if (CapTableAccessService.isCfo(user)) return company;
    if (CapTableAccessService.isBoardViewer(user)) return company;
    if (CapTableAccessService.isLegal(user)) return company;
    if (CapTableAccessService.isCorpSecretary(user)) return company;

    if (company.userId === user?.id) return company;

    const impl = await prisma.investmentImplementation.findFirst({
      where: {
        portfolioCompanyId,
        application: { assignedAnalystId: user?.id },
      },
      select: { id: true },
    });
    if (impl) return company;

    throw Object.assign(new Error("You do not have permission to view this cap table"), { statusCode: 403 });
  }

  static async assertCanConfigure(user: any, portfolioCompanyId: string) {
    await CapTableAccessService.assertCanView(user, portfolioCompanyId);
    if (isAdminViewer(user)) return;
    if (CapTableAccessService.isLegal(user)) return;
    throw Object.assign(new Error("You do not have permission to configure share classes"), { statusCode: 403 });
  }

  static async assertCanEditTransactions(user: any, portfolioCompanyId: string) {
    await CapTableAccessService.assertCanView(user, portfolioCompanyId);
    if (isAdminViewer(user)) return;
    if (CapTableAccessService.isFundManager(user)) return;
    if (CapTableAccessService.isCorpSecretary(user)) return;
    if (CapTableAccessService.isLegal(user)) return;
    throw Object.assign(new Error("You do not have permission to edit cap table transactions"), { statusCode: 403 });
  }

  static assertCanApprove(user: any) {
    if (isAdminViewer(user)) return;
    if (CapTableAccessService.isCio(user)) return;
    if (CapTableAccessService.isCfo(user)) return;
    throw Object.assign(new Error("You do not have permission to approve cap table transactions"), { statusCode: 403 });
  }

  static assertCanIntegrationStub(user: any) {
    if (!isAdminViewer(user)) {
      throw Object.assign(new Error("Admin only"), { statusCode: 403 });
    }
  }
}
