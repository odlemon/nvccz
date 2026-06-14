// @ts-nocheck
import crypto from "crypto";
import { prisma } from "../utils/database";
import { ForecastingError } from "./ForecastingError";
import { FORECAST_ERROR_CODES } from "../constants/forecastingEngine";

export class ForecastingEntityService {
  /** List all active forecast entities. */
  static async list() {
    const entities = await prisma.forecastEntity.findMany({
      where: { isActive: true },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      include: {
        _count: { select: { forecastScenarios: true, accounts: true } }
      }
    });
    return entities.map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      base_currency: e.baseCurrency,
      registration_number: e.registrationNumber,
      is_active: e.isActive,
      is_default: e.isDefault,
      scenario_count: e._count.forecastScenarios,
      account_count: e._count.accounts,
      created_at: e.createdAt
    }));
  }

  /** Get single entity with its account count. */
  static async get(entityId: string) {
    const entity = await prisma.forecastEntity.findUnique({
      where: { id: entityId },
      include: { _count: { select: { forecastScenarios: true, accounts: true } } }
    });
    if (!entity) {
      throw new ForecastingError(FORECAST_ERROR_CODES.INVALID_COORDINATES, "Forecast entity not found", 404);
    }
    return {
      id: entity.id,
      name: entity.name,
      type: entity.type,
      base_currency: entity.baseCurrency,
      registration_number: entity.registrationNumber,
      is_active: entity.isActive,
      is_default: entity.isDefault,
      company_profile_id: entity.companyProfileId,
      portfolio_company_id: entity.portfolioCompanyId,
      scenario_count: entity._count.forecastScenarios,
      account_count: entity._count.accounts,
      created_at: entity.createdAt,
      updated_at: entity.updatedAt
    };
  }

  /**
   * Create a new forecast entity and clone the chart of accounts from a template entity
   * (default: the default entity). Preserves parent-child account hierarchy.
   */
  static async create(
    input: {
      name: string;
      type: string;
      base_currency?: string;
      registration_number?: string;
      portfolio_company_id?: string;
      clone_from_entity_id?: string;
    },
    userId: string
  ) {
    const validTypes = ["INTERNAL_SUBSIDIARY", "EXTERNAL_STARTUP"];
    if (!validTypes.includes(input.type)) {
      throw new ForecastingError(
        FORECAST_ERROR_CODES.INVALID_COORDINATES,
        `type must be one of: ${validTypes.join(", ")}`,
        400
      );
    }

    // Resolve template entity to clone COA from
    let templateEntityId = input.clone_from_entity_id;
    if (!templateEntityId) {
      const def = await prisma.forecastEntity.findFirst({
        where: { isDefault: true },
        select: { id: true }
      });
      if (!def) {
        throw new ForecastingError(
          FORECAST_ERROR_CODES.INVALID_COORDINATES,
          "No default entity to clone accounts from. Run migration first.",
          500
        );
      }
      templateEntityId = def.id;
    } else {
      const tpl = await prisma.forecastEntity.findUnique({ where: { id: templateEntityId }, select: { id: true } });
      if (!tpl) {
        throw new ForecastingError(
          FORECAST_ERROR_CODES.INVALID_COORDINATES,
          `clone_from_entity_id not found: ${templateEntityId}`,
          400
        );
      }
    }

    if (input.portfolio_company_id) {
      const pc = await prisma.portfolioCompany.findUnique({
        where: { id: input.portfolio_company_id },
        select: { id: true }
      });
      if (!pc) {
        throw new ForecastingError(
          FORECAST_ERROR_CODES.INVALID_COORDINATES,
          `portfolio_company_id not found: ${input.portfolio_company_id}`,
          400
        );
      }
    }

    // Create the entity row
    const entity = await prisma.forecastEntity.create({
      data: {
        name: input.name.trim(),
        type: input.type,
        baseCurrency: input.base_currency?.toUpperCase() ?? null,
        registrationNumber: input.registration_number ?? null,
        isDefault: false,
        portfolioCompanyId: input.portfolio_company_id ?? null,
        createdById: userId
      }
    });

    // Clone COA from template entity
    const templateAccounts = await prisma.entityChartOfAccount.findMany({
      where: { entityId: templateEntityId },
      orderBy: { accountNo: "asc" }
    });

    // Pass 1 — create rows without parentId
    const sourceToNewId = new Map<string, string>();
    for (const acct of templateAccounts) {
      const newAcct = await prisma.entityChartOfAccount.create({
        data: {
          entityId: entity.id,
          accountNo: acct.accountNo,
          accountName: acct.accountName,
          accountType: acct.accountType,
          naturalBalance: acct.naturalBalance,
          financialStatement: acct.financialStatement,
          notes: acct.notes ?? null,
          isActive: acct.isActive,
          sourceAccountId: acct.sourceAccountId ?? null
        }
      });
      sourceToNewId.set(acct.id, newAcct.id);
    }

    // Pass 2 — wire parentId
    for (const acct of templateAccounts) {
      if (!acct.parentId) continue;
      const newId = sourceToNewId.get(acct.id);
      const newParentId = sourceToNewId.get(acct.parentId);
      if (newId && newParentId) {
        await prisma.entityChartOfAccount.update({
          where: { id: newId },
          data: { parentId: newParentId }
        });
      }
    }

    return {
      id: entity.id,
      name: entity.name,
      type: entity.type,
      base_currency: entity.baseCurrency,
      is_default: false,
      account_count: templateAccounts.length,
      cloned_from_entity_id: templateEntityId
    };
  }

  /**
   * List accounts for an entity — flat list with parent_id for tree construction.
   * Optional filters: account_type, is_active, for_posting.
   */
  static async listAccounts(
    entityId: string,
    opts: { accountType?: string; isActive?: boolean; forPosting?: boolean } = {}
  ) {
    const entity = await prisma.forecastEntity.findUnique({ where: { id: entityId }, select: { id: true } });
    if (!entity) {
      throw new ForecastingError(FORECAST_ERROR_CODES.INVALID_COORDINATES, "Forecast entity not found", 404);
    }

    const where: any = { entityId };
    if (opts.accountType) where.accountType = opts.accountType;
    if (opts.isActive !== undefined) where.isActive = opts.isActive;

    const accounts = await prisma.entityChartOfAccount.findMany({
      where,
      orderBy: [{ accountType: "asc" }, { accountNo: "asc" }]
    });

    return accounts
      .filter((a) => (opts.forPosting ? a.accountNo !== "1000" : true))
      .map((a) => ({
        id: a.id,
        account_no: a.accountNo,
        account_name: a.accountName,
        account_type: a.accountType,
        natural_balance: a.naturalBalance,
        financial_statement: a.financialStatement,
        notes: a.notes,
        parent_id: a.parentId,
        is_active: a.isActive,
        source_account_id: a.sourceAccountId
      }));
  }

  /**
   * Resync an internal entity's chart of accounts from the global COA.
   * Adds any new global accounts not yet cloned; updates names/types for existing.
   * Only valid for INTERNAL_SUBSIDIARY entities that have sourceAccountId links.
   */
  static async resyncFromGlobalCoa(entityId: string) {
    const entity = await prisma.forecastEntity.findUnique({
      where: { id: entityId },
      select: { id: true, type: true }
    });
    if (!entity) {
      throw new ForecastingError(FORECAST_ERROR_CODES.INVALID_COORDINATES, "Forecast entity not found", 404);
    }
    if (entity.type !== "INTERNAL_SUBSIDIARY") {
      throw new ForecastingError(
        FORECAST_ERROR_CODES.INVALID_COORDINATES,
        "resync is only supported for INTERNAL_SUBSIDIARY entities",
        400
      );
    }

    const globalAccounts = await prisma.chartOfAccounts.findMany({ where: { isActive: true } });
    const existingClones = await prisma.entityChartOfAccount.findMany({
      where: { entityId, sourceAccountId: { not: null } }
    });
    const cloneBySource = new Map(existingClones.map((c) => [c.sourceAccountId, c]));

    let added = 0;
    let updated = 0;

    for (const g of globalAccounts) {
      const existing = cloneBySource.get(g.id);
      if (!existing) {
        await prisma.entityChartOfAccount.create({
          data: {
            entityId,
            accountNo: g.accountNo,
            accountName: g.accountName,
            accountType: g.accountType,
            naturalBalance: g.naturalBalance,
            financialStatement: g.financialStatement,
            notes: g.notes ?? null,
            isActive: g.isActive,
            sourceAccountId: g.id
          }
        });
        added++;
      } else if (
        existing.accountName !== g.accountName ||
        existing.accountType !== g.accountType ||
        existing.naturalBalance !== g.naturalBalance
      ) {
        await prisma.entityChartOfAccount.update({
          where: { id: existing.id },
          data: {
            accountName: g.accountName,
            accountType: g.accountType,
            naturalBalance: g.naturalBalance,
            financialStatement: g.financialStatement
          }
        });
        updated++;
      }
    }

    return { entity_id: entityId, accounts_added: added, accounts_updated: updated };
  }
}
