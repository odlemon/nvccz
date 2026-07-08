// @ts-nocheck
import { prisma } from "../../utils/database";
import { ListedEquityAuditService } from "./ListedEquityAuditService";

const LISTED_EQUITY_WHERE = {
  fundPurpose: "LISTED_EQUITY" as const,
  listedEquityFundConfig: { isNot: null },
};

export class ListedEquityAccessService {
  static async isAdmin(user: { role?: { name?: string } }): Promise<boolean> {
    const roleName = String(user?.role?.name || "").toLowerCase();
    return roleName === "admin" || roleName === "system administrator";
  }

  /** Funds eligible for Investment Operations (listed equity module). */
  static listedEquityFundWhere(extra: Record<string, unknown> = {}) {
    return { ...LISTED_EQUITY_WHERE, ...extra };
  }

  static async getAccessibleListedEquityFundIds(
    userId: string,
    user?: { role?: { name?: string } }
  ): Promise<string[] | "ALL"> {
    if (user && (await this.isAdmin(user))) return "ALL";
    const rows = await prisma.fundManager.findMany({
      where: { userId, isActive: true, fund: LISTED_EQUITY_WHERE },
      select: { fundId: true },
    });
    return rows.map((r) => r.fundId);
  }

  /** @deprecated use getAccessibleListedEquityFundIds — IO-only scope */
  static async getAccessibleFundIds(userId: string, user?: { role?: { name?: string } }) {
    return this.getAccessibleListedEquityFundIds(userId, user);
  }

  static async assertListedEquityFund(fundId: string): Promise<void> {
    const fund = await prisma.fund.findFirst({
      where: { id: fundId, ...LISTED_EQUITY_WHERE },
      select: { id: true },
    });
    if (!fund) throw new Error("FUND_NOT_LISTED_EQUITY");
  }

  static async assertListedEquityFundAccess(
    userId: string,
    fundId: string,
    user?: { role?: { name?: string } },
    resource = `fund:${fundId}`
  ): Promise<void> {
    await this.assertListedEquityFund(fundId);
    const scope = await this.getAccessibleListedEquityFundIds(userId, user);
    if (scope === "ALL") return;
    if (!scope.includes(fundId)) {
      await ListedEquityAuditService.securityAlert(userId, resource, { fundId });
      throw new Error("FORBIDDEN_FUND_ACCESS");
    }
  }

  /** @deprecated use assertListedEquityFundAccess */
  static async assertFundAccess(
    userId: string,
    fundId: string,
    user?: { role?: { name?: string } },
    resource = `fund:${fundId}`
  ): Promise<void> {
    return this.assertListedEquityFundAccess(userId, fundId, user, resource);
  }

  static fundIdFilter(scope: string[] | "ALL"): { fundId?: { in: string[] } } {
    if (scope === "ALL") return {};
    return { fundId: { in: scope } };
  }

  static async listedEquityFundIdFilter(
    userId: string,
    user?: { role?: { name?: string } }
  ): Promise<{ id?: { in: string[] } } | Record<string, never>> {
    const scope = await this.getAccessibleListedEquityFundIds(userId, user);
    if (scope === "ALL") return {};
    return { id: { in: scope } };
  }
}
