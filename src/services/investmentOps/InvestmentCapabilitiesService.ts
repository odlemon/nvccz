// @ts-nocheck
import { InvestmentOpsError } from "../../middleware/investmentOpsFoundation";
import { prisma } from "../../utils/database";
import { ListedEquityAccessService } from "../listedEquity/ListedEquityAccessService";

const db = prisma as any;

const PERMISSION_ACTIONS: Array<{ permission: string; action: string }> = [
  { permission: "investments.read", action: "READ" },
  { permission: "investments.write", action: "WRITE" },
  { permission: "investments.approve", action: "APPROVE" },
  { permission: "investments.execute", action: "EXECUTE" },
  { permission: "investments.admin", action: "ADMIN" },
];

function isAdmin(user: any): boolean {
  const roleName = String(user?.role?.name || "").trim().toLowerCase();
  const roleCode = String(user?.roleCode || "").trim().toLowerCase();
  return ["admin", "system administrator"].includes(roleName) || roleCode === "admin";
}

function grantedPermissions(user: any): Set<string> {
  if (isAdmin(user)) {
    return new Set([
      "investments.read",
      "investments.write",
      "investments.approve",
      "investments.execute",
      "investments.admin",
      "investments.*",
    ]);
  }
  const entries = Array.isArray(user?.role?.permissions) ? user.role.permissions : [];
  return new Set(
    entries
      .filter((entry: any) => entry?.value === true)
      .map((entry: any) => String(entry.name || ""))
  );
}

function hasPermission(granted: Set<string>, permission: string): boolean {
  return (
    granted.has(permission) ||
    granted.has("investments.*") ||
    granted.has("investments.admin")
  );
}

export function hasInvestmentPermission(user: any, permission: string): boolean {
  return hasPermission(grantedPermissions(user), permission);
}

/** Resource-scoped actions for API responses. */
export function permittedActionsFor(
  user: any,
  resource:
    | "report"
    | "job"
    | "order"
    | "document"
    | "valuation"
    | "reconciliation"
    | "generic",
  status?: string
): string[] {
  const granted = grantedPermissions(user);
  const actions = new Set<string>();
  if (hasPermission(granted, "investments.read")) actions.add("READ");
  if (hasPermission(granted, "investments.write")) {
    actions.add("WRITE");
    if (resource === "report") {
      actions.add("GENERATE");
      if (status && ["FAILED", "CANCELLED"].includes(status)) actions.add("RETRY");
      if (status && ["PENDING", "QUEUED", "RUNNING"].includes(status)) actions.add("CANCEL");
      if (status === "COMPLETED") actions.add("DOWNLOAD");
    }
    if (resource === "job" && status && ["PENDING", "RUNNING", "FAILED"].includes(status)) {
      actions.add("CANCEL");
    }
  }
  if (hasPermission(granted, "investments.approve")) actions.add("APPROVE");
  if (hasPermission(granted, "investments.execute")) actions.add("EXECUTE");
  if (hasPermission(granted, "investments.admin")) actions.add("ADMIN");
  return [...actions];
}

export class InvestmentCapabilitiesService {
  static async get(userId: string, user: any, fundId?: string) {
    const granted = grantedPermissions(user);
    const roleActions = PERMISSION_ACTIONS.filter((row) =>
      hasPermission(granted, row.permission)
    ).map((row) => row.action);

    let fundAccess: {
      fundId: string;
      hasAccess: boolean;
      assignmentRoles: string[];
      capabilityCodes: string[];
    } | null = null;

    if (fundId) {
      try {
        await ListedEquityAccessService.assertFundAccess(userId, fundId, user);
      } catch {
        throw new InvestmentOpsError(
          "FORBIDDEN_FUND_ACCESS",
          "Fund is not accessible for capabilities",
          403,
          { fundId }
        );
      }

      const now = new Date();
      const [assignments, caps] = await Promise.all([
        db.investmentPortfolioAssignment.findMany({
          where: {
            userId,
            portfolioConfig: { fundId },
            OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
          },
          select: { assignmentRole: true },
        }),
        db.investmentPortfolioAccessCapability.findMany({
          where: {
            fundId,
            userId,
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          select: { capabilityCode: true },
        }),
      ]);

      fundAccess = {
        fundId,
        hasAccess: true,
        assignmentRoles: [
          ...new Set(assignments.map((a: any) => String(a.assignmentRole || "")).filter(Boolean)),
        ],
        capabilityCodes: [
          ...new Set(caps.map((c: any) => String(c.capabilityCode || "")).filter(Boolean)),
        ],
      };
    }

    const permittedActions = [...new Set(roleActions)];
    if (fundAccess?.capabilityCodes?.length) {
      for (const code of fundAccess.capabilityCodes) {
        permittedActions.push(String(code).toUpperCase());
      }
    }

    return {
      userId,
      isAdmin: isAdmin(user),
      permissions: [...granted].filter((p) => p.startsWith("investments.")),
      permittedActions: [...new Set(permittedActions)],
      fundAccess,
    };
  }
}
