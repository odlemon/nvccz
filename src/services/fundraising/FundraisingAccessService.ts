// @ts-nocheck
import { prisma } from "../../utils/database";
import { hasAnySignal, isAdminViewer } from "../performanceScorecardSupport";

export class FundraisingAccessService {
  static roleCode(user: any): string {
    return String(user?.roleCode || user?.role?.name || "").trim().toUpperCase();
  }

  static isFundManager(user: any): boolean {
    const code = FundraisingAccessService.roleCode(user);
    return (
      code === "FUND_MGR" ||
      code === "FUND_MANAGER" ||
      hasAnySignal(user, ["fund_manager", "fund manager", "fund_mgr"])
    );
  }

  /**
   * "ir" was in this list as a bare two-letter fragment, and hasAnySignal does
   * substring matching over role name, role code, department role and
   * department. So roleCode BOARD_CHAIR matched on "cha-ir", and the Board
   * Chair silently held edit rights over all fundraising data. Any role or
   * department containing those two letters -- Director, Chairman -- did too.
   * The unambiguous fragments below match every role actually intended.
   */
  static isInvestorRelations(user: any): boolean {
    const code = FundraisingAccessService.roleCode(user);
    if (code === "IR" || code === "INVESTOR_RELATIONS") return true;
    return hasAnySignal(user, ["investor relations", "investor_relations", "fundraising"]);
  }

  /** "cco" matched "A-cco-untant", handing Accountants view and close rights. */
  static isCompliance(user: any): boolean {
    const code = FundraisingAccessService.roleCode(user);
    if (code === "CCO") return true;
    return hasAnySignal(user, ["compliance", "chief compliance", "kyc"]);
  }

  static async getCampaign(campaignId: string) {
    const campaign = await prisma.fundraisingCampaign.findUnique({
      where: { id: campaignId },
      include: { fund: { select: { id: true, name: true, status: true } } },
    });
    if (!campaign) {
      throw Object.assign(new Error("Campaign not found"), { statusCode: 404 });
    }
    return campaign;
  }

  static async getDeal(dealId: string) {
    const deal = await prisma.fundraisingPipelineDeal.findUnique({
      where: { id: dealId },
      include: {
        campaign: { include: { fund: { select: { id: true, name: true } } } },
        stage: true,
      },
    });
    if (!deal) {
      throw Object.assign(new Error("Deal not found"), { statusCode: 404 });
    }
    return deal;
  }

  static async assertCanView(user: any, campaignId: string) {
    const campaign = await FundraisingAccessService.getCampaign(campaignId);
    if (isAdminViewer(user)) return campaign;
    if (FundraisingAccessService.isFundManager(user)) return campaign;
    if (FundraisingAccessService.isInvestorRelations(user)) return campaign;
    if (FundraisingAccessService.isCompliance(user)) return campaign;

    const fm = await prisma.fundManager.findFirst({
      where: { fundId: campaign.fundId, userId: user?.id },
      select: { id: true },
    });
    if (fm) return campaign;

    throw Object.assign(new Error("You do not have permission to view this campaign"), { statusCode: 403 });
  }

  static assertCanEdit(user: any) {
    if (isAdminViewer(user)) return;
    if (FundraisingAccessService.isFundManager(user)) return;
    if (FundraisingAccessService.isInvestorRelations(user)) return;
    throw Object.assign(new Error("You do not have permission to edit fundraising data"), { statusCode: 403 });
  }

  static assertCanMail(user: any) {
    if (isAdminViewer(user)) return;
    if (FundraisingAccessService.isFundManager(user)) return;
    throw Object.assign(new Error("You do not have permission to send fundraising mailers"), { statusCode: 403 });
  }

  static assertCanClose(user: any) {
    if (isAdminViewer(user)) return;
    if (FundraisingAccessService.isFundManager(user)) return;
    if (FundraisingAccessService.isCompliance(user)) return;
    throw Object.assign(new Error("You do not have permission to close deals"), { statusCode: 403 });
  }
}
