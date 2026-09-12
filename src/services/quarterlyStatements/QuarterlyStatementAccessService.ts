// @ts-nocheck
import { prisma } from "../../utils/database";
import { hasAnySignal, isAdminViewer } from "../performanceScorecardSupport";

export class QuarterlyStatementAccessService {
  static isFundManager(user: any): boolean {
    const code = String(user?.roleCode || user?.role?.name || "").trim().toUpperCase();
    return (
      code === "FUND_MGR" ||
      code === "FUND_MANAGER" ||
      hasAnySignal(user, ["fund_manager", "fund manager", "fund_mgr"])
    );
  }

  static isInvestorRelations(user: any): boolean {
    // Same bare "ir" collision as FundraisingAccessService — see the note there.
    const code = String(user?.roleCode || user?.role?.name || "").trim().toUpperCase();
    if (code === "IR" || code === "INVESTOR_RELATIONS") return true;
    return hasAnySignal(user, ["investor relations", "investor_relations"]);
  }

  static isChecker(user: any): boolean {
    if (isAdminViewer(user)) return true;
    return hasAnySignal(user, ["cfo", "chief financial", "executive partner", "managing partner", "checker"]);
  }

  static async getRun(runId: string) {
    const run = await prisma.quarterlyStatementRun.findUnique({
      where: { id: runId },
      include: { fund: { select: { id: true, name: true } } },
    });
    if (!run) throw Object.assign(new Error("Statement run not found"), { statusCode: 404 });
    return run;
  }

  static async assertCanView(user: any, fundId: string) {
    if (isAdminViewer(user)) return;
    if (QuarterlyStatementAccessService.isFundManager(user)) return;
    if (QuarterlyStatementAccessService.isInvestorRelations(user)) return;
    if (QuarterlyStatementAccessService.isChecker(user)) return;

    const fm = await prisma.fundManager.findFirst({
      where: { fundId, userId: user?.id },
      select: { id: true },
    });
    if (fm) return;

    throw Object.assign(new Error("You do not have permission to view quarterly statements"), { statusCode: 403 });
  }

  static assertCanCompile(user: any) {
    if (isAdminViewer(user)) return;
    if (QuarterlyStatementAccessService.isFundManager(user)) return;
    if (QuarterlyStatementAccessService.isInvestorRelations(user)) return;
    throw Object.assign(new Error("You do not have permission to compile statements"), { statusCode: 403 });
  }

  static assertCanApprove(user: any) {
    if (!QuarterlyStatementAccessService.isChecker(user)) {
      throw Object.assign(new Error("You do not have permission to approve statements"), { statusCode: 403 });
    }
  }

  static async assertCheckerNotMaker(makerId: string | null, checkerId: string) {
    if (!makerId || makerId !== checkerId) return;
    throw Object.assign(new Error("Checker must be different from the maker who compiled the run"), {
      statusCode: 400,
    });
  }
}
