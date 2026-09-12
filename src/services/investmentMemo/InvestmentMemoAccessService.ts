// @ts-nocheck
import { prisma } from "../../utils/database";
import { hasAnySignal, isAdminViewer } from "../performanceScorecardSupport";

const BOARD_VIEWER_CODES = new Set(["BOARD_CHAIR", "BOARD_MEMBER", "INV_COMM_MEM", "CIO"]);
const EDITOR_CODES = new Set(["CIO", "FUND_MGR", "FUND_MANAGER", "fund_manager"]);

export class InvestmentMemoAccessService {
  static roleCode(user: any): string {
    return String(user?.roleCode || user?.role?.name || "").trim();
  }

  static isCio(user: any): boolean {
    const code = InvestmentMemoAccessService.roleCode(user).toUpperCase();
    if (code === "CIO") return true;
    return hasAnySignal(user, ["cio", "chief investment"]);
  }

  static isFundManager(user: any): boolean {
    const code = InvestmentMemoAccessService.roleCode(user).toUpperCase();
    return EDITOR_CODES.has(code) || hasAnySignal(user, ["fund_manager", "fund manager", "fund_mgr"]);
  }

  static isBoardViewer(user: any): boolean {
    const code = InvestmentMemoAccessService.roleCode(user).toUpperCase();
    return BOARD_VIEWER_CODES.has(code);
  }

  static async assertUnderBoardReview(applicationId: string) {
    const app = await prisma.application.findUnique({
      where: { id: applicationId },
      select: { id: true, currentStage: true, assignedAnalystId: true },
    });
    if (!app) throw Object.assign(new Error("Application not found"), { statusCode: 404 });
    if (app.currentStage !== "UNDER_BOARD_REVIEW") {
      throw Object.assign(
        new Error("Investment memo is only available when application is UNDER_BOARD_REVIEW"),
        { statusCode: 403 }
      );
    }
    return app;
  }

  static async assertCanView(user: any, applicationId: string) {
    await InvestmentMemoAccessService.assertUnderBoardReview(applicationId);
    if (isAdminViewer(user)) return;
    if (InvestmentMemoAccessService.isCio(user)) return;
    if (InvestmentMemoAccessService.isFundManager(user)) return;
    if (InvestmentMemoAccessService.isBoardViewer(user)) return;

    const app = await prisma.application.findUnique({
      where: { id: applicationId },
      select: { assignedAnalystId: true },
    });
    if (app?.assignedAnalystId === user?.id) return;

    throw Object.assign(new Error("You do not have permission to view this investment memo"), {
      statusCode: 403,
    });
  }

  static async assertCanEdit(user: any, applicationId: string) {
    await InvestmentMemoAccessService.assertUnderBoardReview(applicationId);
    if (isAdminViewer(user)) return;
    if (InvestmentMemoAccessService.isCio(user)) return;
    if (InvestmentMemoAccessService.isFundManager(user)) return;

    const app = await prisma.application.findUnique({
      where: { id: applicationId },
      select: { assignedAnalystId: true },
    });
    if (app?.assignedAnalystId === user?.id) return;

    throw Object.assign(new Error("You do not have permission to edit this investment memo"), {
      statusCode: 403,
    });
  }

  static assertCanApprove(user: any) {
    if (InvestmentMemoAccessService.isCio(user) || isAdminViewer(user)) return;
    throw Object.assign(new Error("Only the CIO may approve or reject investment memos"), {
      statusCode: 403,
    });
  }
}
