// @ts-nocheck
import { prisma } from "../../utils/database";
import { ListedEquityAuditService } from "./ListedEquityAuditService";

export class ListedEquityAccessService {
  static async isAdmin(user: { role?: { name?: string } }): Promise<boolean> {
    const roleName = String(user?.role?.name || "").toLowerCase();
    return roleName === "admin" || roleName === "system administrator";
  }

  static async getAccessibleFundIds(userId: string, user?: { role?: { name?: string } }): Promise<string[] | "ALL"> {
    if (user && (await this.isAdmin(user))) return "ALL";
    const rows = await prisma.fundManager.findMany({
      where: { userId, isActive: true },
      select: { fundId: true },
    });
    return rows.map((r) => r.fundId);
  }

  static async assertFundAccess(
    userId: string,
    fundId: string,
    user?: { role?: { name?: string } },
    resource = `fund:${fundId}`
  ): Promise<void> {
    const scope = await this.getAccessibleFundIds(userId, user);
    if (scope === "ALL") return;
    if (!scope.includes(fundId)) {
      await ListedEquityAuditService.securityAlert(userId, resource, { fundId });
      throw new Error("FORBIDDEN_FUND_ACCESS");
    }
  }

  static fundIdFilter(scope: string[] | "ALL"): { fundId?: { in: string[] } } {
    if (scope === "ALL") return {};
    return { fundId: { in: scope } };
  }
}
