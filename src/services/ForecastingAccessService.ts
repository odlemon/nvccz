// @ts-nocheck
import { prisma } from "../utils/database";
import { getForecastLockRoleCodes } from "../constants/forecastingEngine";
import { ForecastingError } from "./ForecastingError";
import { FORECAST_ERROR_CODES } from "../constants/forecastingEngine";
import { isCfoUser } from "../config/cfoModulePermissions";
import { isAdminViewer, isSysAdmin } from "./performanceScorecardSupport";

/** Finance/exec role codes with cross-scenario forecasting access (list, lock, audit, etc.). */
const FORECAST_PRIVILEGED_ROLE_CODES = new Set([
  "CFO",
  "SYSADMIN",
  "ADMIN",
  "FIN_MGR",
  "FORECAST_LOCK",
  "CEO"
]);

export class ForecastingAccessService {
  /**
   * Platform admin, sysadmin, or senior finance/exec — unrestricted forecasting access.
   * Used for list scope bypass, lock, cross-scenario audit, and scenario ownership bypass.
   */
  static isAdminUser(user: any): boolean {
    if (!user) return false;
    if (isAdminViewer(user) || isSysAdmin(user)) return true;
    if (isCfoUser(user)) return true;
    const code = String(user.roleCode || "")
      .trim()
      .toUpperCase();
    if (FORECAST_PRIVILEGED_ROLE_CODES.has(code)) return true;
    if (getForecastLockRoleCodes().some((r) => r.toUpperCase() === code)) return true;
    return false;
  }

  static canLockScenario(user: any): boolean {
    return ForecastingAccessService.isAdminUser(user);
  }

  static assertLockRole(user: any): void {
    if (ForecastingAccessService.canLockScenario(user)) return;
    throw new ForecastingError(
      FORECAST_ERROR_CODES.FORBIDDEN_ROLE,
      "Missing permission to lock forecasts (admin, CFO, SYSADMIN, or FORECAST_LOCK required)",
      403
    );
  }

  /** Cross-scenario audit feeds — admin / finance leadership only. */
  static assertAdminAuditAccess(user: any): void {
    if (ForecastingAccessService.isAdminUser(user)) return;
    throw new ForecastingError(
      FORECAST_ERROR_CODES.FORBIDDEN_ROLE,
      "Admin access required for cross-scenario forecast audit",
      403
    );
  }

  /** Row-level scenario access — owner or admin. */
  static assertScenarioAccess(user: any, scenario: { createdById: string }): void {
    if (ForecastingAccessService.isAdminUser(user)) return;
    if (user?.id && scenario.createdById === user.id) return;
    throw new ForecastingError(
      FORECAST_ERROR_CODES.FORBIDDEN_ROLE,
      "No access to this forecast scenario",
      403
    );
  }

  static assertScenarioEditable(scenario: { status: string }): void {
    if (String(scenario.status).toUpperCase() === "LOCKED") {
      throw ForecastingError.locked();
    }
  }

  /** Non-admins only see scenarios they created. */
  static listScopeFilter(user: any) {
    if (ForecastingAccessService.isAdminUser(user)) {
      return {};
    }
    return { createdById: user.id };
  }

  /**
   * Resolve which ForecastEntity to use.
   * If entityId is provided, validate it exists. Otherwise fall back to the default entity.
   */
  static async resolveEntityId(entityId?: string | null): Promise<string> {
    if (entityId) {
      const entity = await prisma.forecastEntity.findUnique({
        where: { id: entityId },
        select: { id: true, isActive: true }
      });
      if (!entity || !entity.isActive) {
        throw new ForecastingError(
          FORECAST_ERROR_CODES.INVALID_COORDINATES,
          `Forecast entity not found or inactive: ${entityId}`,
          400
        );
      }
      return entity.id;
    }
    return ForecastingAccessService.getDefaultEntityId();
  }

  static async getDefaultEntityId(): Promise<string> {
    const entity = await prisma.forecastEntity.findFirst({
      where: { isDefault: true },
      select: { id: true }
    });
    if (!entity) {
      throw new ForecastingError(
        FORECAST_ERROR_CODES.INVALID_COORDINATES,
        "No default forecast entity configured. Run db:migrate:forecasting-multi-entity first.",
        500
      );
    }
    return entity.id;
  }

  static async assertEntityExists(entityId: string): Promise<void> {
    const entity = await prisma.forecastEntity.findUnique({ where: { id: entityId }, select: { id: true } });
    if (!entity) {
      throw new ForecastingError(FORECAST_ERROR_CODES.INVALID_COORDINATES, `Unknown entity_id: ${entityId}`, 400);
    }
  }

  /** @deprecated Use resolveEntityId instead. Kept for any residual callers. */
  static async resolveCompanyProfileId(): Promise<string> {
    return ForecastingAccessService.getDefaultEntityId();
  }

  static async loadScenarioOrThrow(scenarioId: string, user?: any) {
    const scenario = await prisma.forecastScenario.findUnique({
      where: { id: scenarioId },
      include: {
        dimensions: true,
        drivers: true,
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        lockedBy: { select: { id: true, firstName: true, lastName: true } },
        fund: { select: { id: true, name: true } },
        entity: { select: { id: true, name: true, type: true, isDefault: true } }
      }
    });
    if (!scenario) throw ForecastingError.notFound();
    if (user) ForecastingAccessService.assertScenarioAccess(user, scenario);
    return scenario;
  }

  static async loadScenarioForUser(user: any, scenarioId: string) {
    return ForecastingAccessService.loadScenarioOrThrow(scenarioId, user);
  }

  static async assertFundExists(fundId: string | null | undefined): Promise<void> {
    if (!fundId) return;
    const fund = await prisma.fund.findUnique({ where: { id: fundId }, select: { id: true } });
    if (!fund) {
      throw new ForecastingError(FORECAST_ERROR_CODES.INVALID_COORDINATES, "Unknown fund_id", 400);
    }
  }
}
