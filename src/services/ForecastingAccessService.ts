// @ts-nocheck
import { prisma } from "../utils/database";
import { getForecastLockRoleCodes } from "../constants/forecastingEngine";
import { ForecastingError } from "./ForecastingError";
import { FORECAST_ERROR_CODES } from "../constants/forecastingEngine";

const ADMIN_ROLE_CODES = ["CFO", "SYSADMIN", "FIN_MGR"];

export class ForecastingAccessService {
  static isAdminUser(user: { roleCode?: string | null } | null | undefined): boolean {
    const code = String(user?.roleCode || "").trim();
    return ADMIN_ROLE_CODES.includes(code) || getForecastLockRoleCodes().includes(code);
  }

  static assertLockRole(user: { roleCode?: string | null } | null | undefined): void {
    const code = String(user?.roleCode || "").trim();
    const allowed = getForecastLockRoleCodes();
    if (!allowed.includes(code)) {
      throw new ForecastingError(
        FORECAST_ERROR_CODES.FORBIDDEN_ROLE,
        "Missing FORECAST_LOCK role",
        403
      );
    }
  }

  static assertScenarioEditable(scenario: { status: string }): void {
    if (String(scenario.status).toUpperCase() === "LOCKED") {
      throw ForecastingError.locked();
    }
  }

  static listScopeFilter(user: { id: string; roleCode?: string | null }) {
    if (ForecastingAccessService.isAdminUser(user)) {
      return {};
    }
    return { createdById: user.id };
  }

  static async loadScenarioOrThrow(scenarioId: string) {
    const scenario = await prisma.forecastScenario.findUnique({
      where: { id: scenarioId },
      include: {
        dimensions: true,
        drivers: true,
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        fund: { select: { id: true, name: true } }
      }
    });
    if (!scenario) throw ForecastingError.notFound();
    return scenario;
  }

  static async assertEntityExists(entityId: string): Promise<{ kind: "company" | "portfolio" }> {
    const [company, portfolio] = await Promise.all([
      prisma.companyProfile.findUnique({ where: { id: entityId }, select: { id: true } }),
      prisma.portfolioCompany.findUnique({ where: { id: entityId }, select: { id: true } })
    ]);
    if (company) return { kind: "company" };
    if (portfolio) return { kind: "portfolio" };
    throw new ForecastingError(FORECAST_ERROR_CODES.INVALID_COORDINATES, "Unknown entity_id", 400);
  }

  static async assertFundExists(fundId: string | null | undefined): Promise<void> {
    if (!fundId) return;
    const fund = await prisma.fund.findUnique({ where: { id: fundId }, select: { id: true } });
    if (!fund) {
      throw new ForecastingError(FORECAST_ERROR_CODES.INVALID_COORDINATES, "Unknown fund_id", 400);
    }
  }
}
