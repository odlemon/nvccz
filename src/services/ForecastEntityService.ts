// @ts-nocheck
/**
 * ForecastEntity + entity COA — kept for Tax Return Pack and FP&A entity dimension.
 * Formerly ForecastingEntityService (hypercube scenarios removed).
 */
import { prisma } from "../utils/database";

export class ForecastEntityService {
  static async list() {
    const entities = await prisma.forecastEntity.findMany({
      where: { isActive: true },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      include: { _count: { select: { accounts: true } } },
    });
    return entities.map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      base_currency: e.baseCurrency,
      registration_number: e.registrationNumber,
      is_active: e.isActive,
      is_default: e.isDefault,
      account_count: e._count.accounts,
      created_at: e.createdAt,
    }));
  }

  static async get(entityId: string) {
    const entity = await prisma.forecastEntity.findUnique({
      where: { id: entityId },
      include: { _count: { select: { accounts: true } } },
    });
    if (!entity) {
      const err: any = new Error("Forecast entity not found");
      err.statusCode = 404;
      throw err;
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
      account_count: entity._count.accounts,
      created_at: entity.createdAt,
      updated_at: entity.updatedAt,
    };
  }

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
      const err: any = new Error(`type must be one of: ${validTypes.join(", ")}`);
      err.statusCode = 400;
      throw err;
    }

    let templateEntityId = input.clone_from_entity_id;
    if (!templateEntityId) {
      const def = await prisma.forecastEntity.findFirst({
        where: { isDefault: true },
        select: { id: true },
      });
      if (!def) {
        const err: any = new Error("No default entity to clone accounts from. Run migration first.");
        err.statusCode = 500;
        throw err;
      }
      templateEntityId = def.id;
    } else {
      const tpl = await prisma.forecastEntity.findUnique({
        where: { id: templateEntityId },
        select: { id: true },
      });
      if (!tpl) {
        const err: any = new Error(`clone_from_entity_id not found: ${templateEntityId}`);
        err.statusCode = 400;
        throw err;
      }
    }

    if (input.portfolio_company_id) {
      const pc = await prisma.portfolioCompany.findUnique({
        where: { id: input.portfolio_company_id },
        select: { id: true },
      });
      if (!pc) {
        const err: any = new Error(`portfolio_company_id not found: ${input.portfolio_company_id}`);
        err.statusCode = 400;
        throw err;
      }
    }

    const entity = await prisma.forecastEntity.create({
      data: {
        name: input.name.trim(),
        type: input.type,
        baseCurrency: input.base_currency?.toUpperCase() ?? null,
        registrationNumber: input.registration_number ?? null,
        isDefault: false,
        portfolioCompanyId: input.portfolio_company_id ?? null,
        createdById: userId,
      },
    });

    const templateAccounts = await prisma.entityChartOfAccount.findMany({
      where: { entityId: templateEntityId },
      orderBy: { accountNo: "asc" },
    });

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
          sourceAccountId: acct.sourceAccountId ?? null,
        },
      });
      sourceToNewId.set(acct.id, newAcct.id);
    }

    for (const acct of templateAccounts) {
      if (!acct.parentId) continue;
      const newId = sourceToNewId.get(acct.id);
      const newParentId = sourceToNewId.get(acct.parentId);
      if (newId && newParentId) {
        await prisma.entityChartOfAccount.update({
          where: { id: newId },
          data: { parentId: newParentId },
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
      cloned_from_entity_id: templateEntityId,
    };
  }

  static async listAccounts(
    entityId: string,
    opts: { accountType?: string; isActive?: boolean; forPosting?: boolean } = {}
  ) {
    const entity = await prisma.forecastEntity.findUnique({
      where: { id: entityId },
      select: { id: true },
    });
    if (!entity) {
      const err: any = new Error("Forecast entity not found");
      err.statusCode = 404;
      throw err;
    }

    const where: any = { entityId };
    if (opts.accountType) where.accountType = opts.accountType;
    if (opts.isActive !== undefined) where.isActive = opts.isActive;

    const accounts = await prisma.entityChartOfAccount.findMany({
      where,
      orderBy: [{ accountType: "asc" }, { accountNo: "asc" }],
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
        source_account_id: a.sourceAccountId,
      }));
  }

  static async resyncFromGlobalCoa(entityId: string) {
    const entity = await prisma.forecastEntity.findUnique({
      where: { id: entityId },
      select: { id: true, type: true },
    });
    if (!entity) {
      const err: any = new Error("Forecast entity not found");
      err.statusCode = 404;
      throw err;
    }
    if (entity.type !== "INTERNAL_SUBSIDIARY") {
      const err: any = new Error("resync is only supported for INTERNAL_SUBSIDIARY entities");
      err.statusCode = 400;
      throw err;
    }

    const globalAccounts = await prisma.chartOfAccounts.findMany({ where: { isActive: true } });
    const existingClones = await prisma.entityChartOfAccount.findMany({
      where: { entityId, sourceAccountId: { not: null } },
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
            sourceAccountId: g.id,
          },
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
            financialStatement: g.financialStatement,
          },
        });
        updated++;
      }
    }

    return { entity_id: entityId, accounts_added: added, accounts_updated: updated };
  }
}
