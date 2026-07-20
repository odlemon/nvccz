// @ts-nocheck
import { randomUUID } from "crypto";
import { Decimal } from "@prisma/client/runtime/library";
import { InvestmentOpsError } from "../../middleware/investmentOpsFoundation";
import { prisma } from "../../utils/database";
import { ListedEquityAccessService } from "../listedEquity/ListedEquityAccessService";
import { ListedEquityPortfolioService } from "../listedEquity/ListedEquityPortfolioService";
import { paginatedResult, parsePagination } from "./investmentOpsSupport";
import { InvestmentOpsAuditService } from "./InvestmentOpsAuditService";

const db = prisma as any;

function required(value: unknown, field: string): string {
  const text = String(value ?? "").trim();
  if (!text) throw new InvestmentOpsError("VALIDATION_ERROR", `${field} is required`, 400, { field });
  return text;
}

function expected(current: number, version: string) {
  if (String(current) !== String(version)) {
    throw new InvestmentOpsError("VERSION_CONFLICT", "Resource has changed since it was read", 409, {
      expectedVersion: String(version),
      currentVersion: String(current),
    });
  }
}

export function assertFolderMoveIsAcyclic(
  folders: Array<{ id: string; parentId: string | null }>,
  folderId: string,
  nextParentId: string | null
) {
  if (!nextParentId) return;
  if (folderId === nextParentId) {
    throw new InvestmentOpsError("FOLDER_CYCLE", "A folder cannot be its own parent", 409);
  }
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  let cursor: string | null = nextParentId;
  const visited = new Set<string>();
  while (cursor) {
    if (cursor === folderId) {
      throw new InvestmentOpsError("FOLDER_CYCLE", "Folder move would create a cycle", 409);
    }
    if (visited.has(cursor)) {
      throw new InvestmentOpsError("FOLDER_CYCLE", "Existing folder hierarchy contains a cycle", 409);
    }
    visited.add(cursor);
    cursor = byId.get(cursor)?.parentId ?? null;
  }
}

export function validateAtomicSiblingOrder(currentIds: string[], requestedIds: string[]) {
  const unique = new Set(requestedIds);
  if (
    unique.size !== requestedIds.length ||
    requestedIds.length !== currentIds.length ||
    currentIds.some((id) => !unique.has(id))
  ) {
    throw new InvestmentOpsError(
      "INVALID_SIBLING_ORDER",
      "Reorder must contain every active sibling exactly once",
      400,
      { currentIds, requestedIds }
    );
  }
}

async function access(fundId: string, userId: string, user: any) {
  await ListedEquityAccessService.assertFundAccess(userId, fundId, user);
}

async function folderWithFund(id: string) {
  const folder = await db.investmentPortfolioFolder.findUnique({ where: { id } });
  if (!folder) throw new InvestmentOpsError("FOLDER_NOT_FOUND", "Folder not found", 404);
  return folder;
}

async function configForFund(fundId: string) {
  const config = await db.investmentPortfolioConfig.findUnique({ where: { fundId } });
  if (!config) {
    throw new InvestmentOpsError("PORTFOLIO_CONFIG_NOT_FOUND", "Portfolio config not found", 404);
  }
  return config;
}

export class InvestmentOpsPhase1Service {
  static async portfolios(query: any, userId: string, user: any) {
    const page = parsePagination(query);
    let rows = await ListedEquityPortfolioService.listFunds(userId, user);
    if (page.search) {
      const search = page.search.toLowerCase();
      rows = rows.filter((row: any) => String(row.name ?? "").toLowerCase().includes(search));
    }
    const allowed = new Set(["name", "createdAt", "updatedAt", "status"]);
    const sortBy = allowed.has(page.sortBy) ? page.sortBy : "name";
    rows.sort((a: any, b: any) => {
      const result = String(a[sortBy] ?? "").localeCompare(String(b[sortBy] ?? ""));
      return page.sortDirection === "asc" ? result : -result;
    });
    return paginatedResult(
      rows.slice(page.skip, page.skip + page.take),
      rows.length,
      page.page,
      page.pageSize
    );
  }

  static async createPortfolio(data: any, userId: string) {
    const name = required(data.name, "name");
    const baseCurrencyCode = required(data.baseCurrencyCode || "USD", "baseCurrencyCode").toUpperCase();
    return db.$transaction(async (tx: any) => {
      const fund = await tx.fund.create({
        data: {
          name,
          description: data.description || "Investment Operations portfolio",
          totalAmount: new Decimal(String(data.totalAmount ?? 0)),
          remainingAmount: new Decimal(String(data.totalAmount ?? 0)),
          minInvestment: new Decimal(0),
          maxInvestment: new Decimal(String(data.totalAmount ?? 0)),
          focusIndustries: [],
          applicationStart: new Date(),
          applicationEnd: new Date("2099-12-31"),
          status: data.status || "OPEN",
          fundPurpose: "LISTED_EQUITY",
          createdById: userId,
        },
      });
      const config = await tx.investmentPortfolioConfig.create({
        data: {
          fundId: fund.id,
          baseCurrencyCode,
          valuationPolicyJson: data.valuationPolicyJson,
          settlementPolicyJson: data.settlementPolicyJson,
          approvalPolicyJson: data.approvalPolicyJson,
          createdById: userId,
          updatedById: userId,
        },
      });
      await tx.listedEquityFundConfig.create({
        data: { fundId: fund.id, baseCurrencyCode, coaMappingJson: data.coaMappingJson || {} },
      });
      await tx.fundManager.create({
        data: { fundId: fund.id, userId, role: "fund_manager", isActive: true },
      });
      return { ...fund, investmentPortfolioConfig: config };
    });
  }

  static async portfolioDetail(fundId: string, userId: string, user: any) {
    await access(fundId, userId, user);
    const fund = await db.fund.findUnique({
      where: { id: fundId },
      include: { listedEquityFundConfig: true },
    });
    if (!fund) throw new InvestmentOpsError("FUND_NOT_FOUND", "Portfolio not found", 404);
    const [config, folders] = await Promise.all([
      db.investmentPortfolioConfig.findUnique({
        where: { fundId },
        include: { limits: true, assignments: true },
      }),
      db.investmentPortfolioFolder.findMany({
        where: { fundId, parentId: null },
        orderBy: { sortOrder: "asc" },
      }),
    ]);
    return { ...fund, investmentPortfolioConfig: config, folders };
  }

  static async patchPortfolio(
    fundId: string,
    data: Record<string, unknown>,
    version: string,
    userId: string,
    user: any
  ) {
    await access(fundId, userId, user);
    const config = await configForFund(fundId);
    expected(config.version, version);
    return db.$transaction(async (tx: any) => {
      if (data.name !== undefined || data.description !== undefined || data.status !== undefined) {
        await tx.fund.update({
          where: { id: fundId },
          data: {
            ...(data.name !== undefined ? { name: required(data.name, "name") } : {}),
            ...(data.description !== undefined ? { description: data.description } : {}),
            ...(data.status !== undefined ? { status: data.status } : {}),
          },
        });
      }
      const updated = await tx.investmentPortfolioConfig.update({
        where: { id: config.id },
        data: { version: { increment: 1 }, updatedById: userId },
      });
      return tx.fund.findUnique({
        where: { id: fundId },
        include: { investmentPortfolioConfig: true, listedEquityFundConfig: true },
      });
    });
  }

  static async folders(fundId: string, userId: string, user: any, includeArchived = false) {
    await access(fundId, userId, user);
    return db.investmentPortfolioFolder.findMany({
      where: { fundId, ...(includeArchived ? {} : { isArchived: false }) },
      orderBy: [{ path: "asc" }, { sortOrder: "asc" }],
    });
  }

  static async folder(id: string, userId: string, user: any) {
    const folder = await folderWithFund(id);
    await access(folder.fundId, userId, user);
    return db.investmentPortfolioFolder.findUnique({
      where: { id },
      include: { children: { orderBy: { sortOrder: "asc" } }, assignments: true },
    });
  }

  static async createFolder(fundId: string, data: any, userId: string, user: any) {
    await access(fundId, userId, user);
    const name = required(data.name, "name");
    const parent = data.parentId
      ? await db.investmentPortfolioFolder.findFirst({
          where: { id: data.parentId, fundId, isArchived: false },
        })
      : null;
    if (data.parentId && !parent) {
      throw new InvestmentOpsError("PARENT_FOLDER_NOT_FOUND", "Parent folder not found", 404);
    }
    const path = parent ? `${parent.path}/${name}` : name;
    const count = await db.investmentPortfolioFolder.count({
      where: { fundId, parentId: data.parentId ?? null, isArchived: false },
    });
    return db.investmentPortfolioFolder.create({
      data: {
        fundId,
        parentId: data.parentId ?? null,
        name,
        path,
        sortOrder: data.sortOrder ?? count,
        createdById: userId,
      },
    });
  }

  static async patchFolder(id: string, data: any, version: string, userId: string, user: any) {
    const folder = await folderWithFund(id);
    await access(folder.fundId, userId, user);
    expected(folder.version, version);
    const all = await db.investmentPortfolioFolder.findMany({
      where: { fundId: folder.fundId },
      select: { id: true, parentId: true, path: true },
    });
    const parentId = data.parentId === undefined ? folder.parentId : data.parentId;
    assertFolderMoveIsAcyclic(all, id, parentId);
    const parent = parentId
      ? await db.investmentPortfolioFolder.findFirst({
          where: { id: parentId, fundId: folder.fundId, isArchived: false },
        })
      : null;
    if (parentId && !parent) {
      throw new InvestmentOpsError("PARENT_FOLDER_NOT_FOUND", "Parent folder not found", 404);
    }
    const name = data.name === undefined ? folder.name : required(data.name, "name");
    const path = parent ? `${parent.path}/${name}` : name;
    return db.$transaction(async (tx: any) => {
      const updated = await tx.investmentPortfolioFolder.update({
        where: { id },
        data: {
          name,
          parentId,
          path,
          ...(data.sortOrder !== undefined ? { sortOrder: Number(data.sortOrder) } : {}),
          version: { increment: 1 },
        },
      });
      if (path !== folder.path) {
        const descendants = await tx.investmentPortfolioFolder.findMany({
          where: { fundId: folder.fundId, path: { startsWith: `${folder.path}/` } },
        });
        for (const child of descendants) {
          await tx.investmentPortfolioFolder.update({
            where: { id: child.id },
            data: { path: `${path}${child.path.slice(folder.path.length)}`, version: { increment: 1 } },
          });
        }
      }
      return updated;
    });
  }

  static async setFolderArchived(
    id: string,
    archived: boolean,
    version: string,
    userId: string,
    user: any
  ) {
    const folder = await folderWithFund(id);
    await access(folder.fundId, userId, user);
    expected(folder.version, version);
    return db.investmentPortfolioFolder.update({
      where: { id },
      data: { isArchived: archived, version: { increment: 1 } },
    });
  }

  static async reorderFolders(
    fundId: string,
    parentId: string | null,
    ids: string[],
    userId: string,
    user: any
  ) {
    await access(fundId, userId, user);
    const siblings = await db.investmentPortfolioFolder.findMany({
      where: { fundId, parentId, isArchived: false },
      orderBy: { sortOrder: "asc" },
      select: { id: true },
    });
    validateAtomicSiblingOrder(
      siblings.map((row: any) => row.id),
      ids
    );
    return db.$transaction(
      ids.map((id, sortOrder) =>
        db.investmentPortfolioFolder.update({
          where: { id },
          data: { sortOrder, version: { increment: 1 } },
        })
      )
    );
  }

  static async listAssignments(fundId: string, userId: string, user: any) {
    await access(fundId, userId, user);
    const config = await configForFund(fundId);
    return db.investmentPortfolioAssignment.findMany({
      where: { portfolioConfigId: config.id },
      orderBy: { createdAt: "desc" },
    });
  }

  static async createAssignment(fundId: string, data: any, userId: string, user: any) {
    await access(fundId, userId, user);
    const config = await configForFund(fundId);
    if (data.folderId) {
      const folder = await db.investmentPortfolioFolder.findFirst({
        where: { id: data.folderId, fundId, isArchived: false },
      });
      if (!folder) throw new InvestmentOpsError("FOLDER_NOT_FOUND", "Folder not found", 404);
    }
    return db.investmentPortfolioAssignment.upsert({
      where: {
        portfolioConfigId_userId_assignmentRole: {
          portfolioConfigId: config.id,
          userId: required(data.userId, "userId"),
          assignmentRole: required(data.assignmentRole, "assignmentRole"),
        },
      },
      create: {
        portfolioConfigId: config.id,
        folderId: data.folderId ?? null,
        userId: data.userId,
        assignmentRole: data.assignmentRole,
        effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : new Date(),
        effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null,
        createdById: userId,
      },
      update: {
        folderId: data.folderId ?? null,
        effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null,
        version: { increment: 1 },
      },
    });
  }

  static async patchAssignment(id: string, data: any, version: string, userId: string, user: any) {
    const assignment = await db.investmentPortfolioAssignment.findUnique({
      where: { id },
      include: { portfolioConfig: true },
    });
    if (!assignment) throw new InvestmentOpsError("ASSIGNMENT_NOT_FOUND", "Assignment not found", 404);
    await access(assignment.portfolioConfig.fundId, userId, user);
    expected(assignment.version, version);
    return db.investmentPortfolioAssignment.update({
      where: { id },
      data: {
        ...(data.folderId !== undefined ? { folderId: data.folderId } : {}),
        ...(data.assignmentRole !== undefined ? { assignmentRole: data.assignmentRole } : {}),
        ...(data.effectiveTo !== undefined
          ? { effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null }
          : {}),
        version: { increment: 1 },
      },
    });
  }

  /** Flattened folder list across accessible funds (SRD `/portfolio-folders`). */
  static async listFoldersFlat(userId: string, user: any, query: any = {}) {
    if (query.fundId) {
      return this.folders(query.fundId, userId, user, query.includeArchived === "true");
    }
    const scope = await ListedEquityAccessService.getAccessibleFundIds(userId, user);
    const fundIds = scope === "ALL" ? undefined : scope;
    if (Array.isArray(fundIds) && fundIds.length === 0) return [];
    return db.investmentPortfolioFolder.findMany({
      where: {
        ...(fundIds ? { fundId: { in: fundIds } } : {}),
        ...(query.includeArchived === "true" ? {} : { isArchived: false }),
      },
      orderBy: [{ fundId: "asc" }, { path: "asc" }, { sortOrder: "asc" }],
    });
  }

  /** End folder↔portfolio assignment: clear folderId on user assignments for that fund/folder. */
  static async unassignFolderPortfolio(
    folderId: string,
    fundId: string,
    userId: string,
    user: any
  ) {
    await access(fundId, userId, user);
    const folder = await folderWithFund(folderId);
    if (folder.fundId !== fundId) {
      throw new InvestmentOpsError(
        "FOLDER_FUND_MISMATCH",
        "Folder does not belong to the specified fund",
        409,
        { folderId, fundId, folderFundId: folder.fundId }
      );
    }
    const config = await configForFund(fundId);
    const result = await db.investmentPortfolioAssignment.updateMany({
      where: { portfolioConfigId: config.id, folderId },
      data: { folderId: null, version: { increment: 1 }, effectiveTo: new Date() },
    });
    return { folderId, fundId, unassignedCount: result.count };
  }

  static async deleteAssignment(id: string, userId: string, user: any) {
    const assignment = await db.investmentPortfolioAssignment.findUnique({
      where: { id },
      include: { portfolioConfig: true },
    });
    if (!assignment) throw new InvestmentOpsError("ASSIGNMENT_NOT_FOUND", "Assignment not found", 404);
    await access(assignment.portfolioConfig.fundId, userId, user);
    await db.investmentPortfolioAssignment.delete({ where: { id } });
    return { id, deleted: true };
  }

  static async config(fundId: string, userId: string, user: any) {
    await access(fundId, userId, user);
    return configForFund(fundId);
  }

  static async patchConfig(fundId: string, data: any, version: string, userId: string, user: any) {
    await access(fundId, userId, user);
    const config = await configForFund(fundId);
    expected(config.version, version);
    return db.investmentPortfolioConfig.update({
      where: { id: config.id },
      data: {
        ...(data.baseCurrencyCode !== undefined
          ? { baseCurrencyCode: required(data.baseCurrencyCode, "baseCurrencyCode").toUpperCase() }
          : {}),
        ...(data.valuationPolicyJson !== undefined
          ? { valuationPolicyJson: data.valuationPolicyJson }
          : {}),
        ...(data.settlementPolicyJson !== undefined
          ? { settlementPolicyJson: data.settlementPolicyJson }
          : {}),
        ...(data.approvalPolicyJson !== undefined
          ? { approvalPolicyJson: data.approvalPolicyJson }
          : {}),
        updatedById: userId,
        version: { increment: 1 },
      },
    });
  }

  static async limits(fundId: string, userId: string, user: any, includeArchived = false) {
    await access(fundId, userId, user);
    const config = await configForFund(fundId);
    return db.investmentPortfolioLimit.findMany({
      where: { portfolioConfigId: config.id, ...(includeArchived ? {} : { isActive: true }) },
      orderBy: [{ limitCode: "asc" }, { effectiveFrom: "desc" }],
    });
  }

  static async createLimit(fundId: string, data: any, userId: string, user: any) {
    await access(fundId, userId, user);
    const config = await configForFund(fundId);
    return db.investmentPortfolioLimit.create({
      data: {
        portfolioConfigId: config.id,
        complianceRuleId: data.complianceRuleId ?? null,
        limitCode: required(data.limitCode, "limitCode"),
        dimensionType: required(data.dimensionType, "dimensionType"),
        dimensionValue: data.dimensionValue ?? null,
        warningValue: data.warningValue != null ? new Decimal(String(data.warningValue)) : null,
        hardValue: data.hardValue != null ? new Decimal(String(data.hardValue)) : null,
        unit: required(data.unit, "unit"),
        effectiveFrom: new Date(required(data.effectiveFrom, "effectiveFrom")),
        effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null,
      },
    });
  }

  static async limit(id: string, userId: string, user: any) {
    const limit = await db.investmentPortfolioLimit.findUnique({
      where: { id },
      include: { portfolioConfig: true, complianceRule: true },
    });
    if (!limit) throw new InvestmentOpsError("LIMIT_NOT_FOUND", "Portfolio limit not found", 404);
    await access(limit.portfolioConfig.fundId, userId, user);
    return limit;
  }

  static async patchLimit(id: string, data: any, version: string, userId: string, user: any) {
    const limit = await db.investmentPortfolioLimit.findUnique({
      where: { id },
      include: { portfolioConfig: true },
    });
    if (!limit) throw new InvestmentOpsError("LIMIT_NOT_FOUND", "Portfolio limit not found", 404);
    await access(limit.portfolioConfig.fundId, userId, user);
    expected(limit.version, version);
    return db.investmentPortfolioLimit.update({
      where: { id },
      data: {
        ...(data.dimensionType !== undefined ? { dimensionType: data.dimensionType } : {}),
        ...(data.dimensionValue !== undefined ? { dimensionValue: data.dimensionValue } : {}),
        ...(data.warningValue !== undefined
          ? { warningValue: data.warningValue == null ? null : new Decimal(String(data.warningValue)) }
          : {}),
        ...(data.hardValue !== undefined
          ? { hardValue: data.hardValue == null ? null : new Decimal(String(data.hardValue)) }
          : {}),
        ...(data.unit !== undefined ? { unit: data.unit } : {}),
        ...(data.effectiveTo !== undefined
          ? { effectiveTo: data.effectiveTo ? new Date(data.effectiveTo) : null }
          : {}),
        ...(data.isActive !== undefined ? { isActive: Boolean(data.isActive) } : {}),
        version: { increment: 1 },
      },
    });
  }

  static async positions(fundId: string, userId: string, user: any) {
    await access(fundId, userId, user);
    const run = await db.investmentValuationRun.findFirst({
      where: { fundId, status: "COMPLETED" },
      orderBy: [{ asOf: "desc" }, { createdAt: "desc" }],
    });
    if (!run) return { valuationRunId: null, asOf: null, items: [] };
    const items = await db.investmentValuationItemSnapshot.findMany({
      where: { valuationRunId: run.id },
      orderBy: { baseMarketValue: "desc" },
    });
    return { valuationRunId: run.id, asOf: run.asOf, navBaseCurrency: run.navBaseCurrency, items };
  }

  static async position(id: string, userId: string, user: any) {
    const item = await db.investmentValuationItemSnapshot.findUnique({
      where: { id },
      include: { valuationRun: true },
    });
    if (!item) throw new InvestmentOpsError("POSITION_NOT_FOUND", "Position not found", 404);
    await access(item.fundId, userId, user);
    return item;
  }

  static async transactions(fundId: string, query: any, userId: string, user: any) {
    await access(fundId, userId, user);
    const page = parsePagination(query);
    const allowedSort = new Set(["tradeDate", "createdAt", "updatedAt", "transactionRef", "status"]);
    const sortBy = allowedSort.has(page.sortBy) ? page.sortBy : "tradeDate";
    const where: any = {
      fundId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { transactionType: query.type } : {}),
      ...(page.from || page.to
        ? { tradeDate: { ...(page.from ? { gte: new Date(page.from) } : {}), ...(page.to ? { lte: new Date(page.to) } : {}) } }
        : {}),
      ...(page.search
        ? { OR: [{ transactionRef: { contains: page.search } }, { transactionType: { contains: page.search } }] }
        : {}),
    };
    const [items, total] = await Promise.all([
      db.investmentTransaction.findMany({
        where,
        include: {
          order: { select: { id: true, tradeId: true, orderRef: true } },
          execution: { select: { id: true } },
        },
        skip: page.skip,
        take: page.take,
        orderBy: { [sortBy]: page.sortDirection },
      }),
      db.investmentTransaction.count({ where }),
    ]);
    const instrumentIds = [
      ...new Set(items.map((t: any) => t.instrumentId).filter(Boolean)),
    ] as string[];
    const instruments = instrumentIds.length
      ? await db.investmentInstrument.findMany({
          where: { id: { in: instrumentIds } },
          select: { id: true, ticker: true, shortName: true },
        })
      : [];
    const instrumentById = Object.fromEntries(instruments.map((i: any) => [i.id, i]));
    const tradeIds = [
      ...new Set(items.map((t: any) => t.order?.tradeId).filter(Boolean)),
    ];
    const trades = tradeIds.length
      ? await db.listedEquityTrade.findMany({
          where: { id: { in: tradeIds } },
          include: { settlement: { select: { journalEntryId: true } } },
        })
      : [];
    const journalByTrade = Object.fromEntries(
      trades.map((tr: any) => [tr.id, tr.settlement?.journalEntryId ?? null])
    );
    const docs = tradeIds.length
      ? await db.investmentDocument.findMany({
          where: { tradeId: { in: tradeIds } },
          select: { id: true, tradeId: true },
          take: 200,
        })
      : [];
    const docByTrade = Object.fromEntries(docs.map((d: any) => [d.tradeId, d.id]));
    const mapped = items.map((t: any) => {
      const tradeId = t.order?.tradeId ?? null;
      const instrument = t.instrumentId ? instrumentById[t.instrumentId] : null;
      return {
        id: t.id,
        type: t.transactionType,
        transactionType: t.transactionType,
        tradeRef: t.transactionRef,
        transactionRef: t.transactionRef,
        symbol: instrument?.ticker ?? null,
        instrumentTicker: instrument?.ticker ?? null,
        quantity: t.quantity != null ? String(t.quantity) : null,
        price: t.unitPrice != null ? String(t.unitPrice) : null,
        unitPrice: t.unitPrice != null ? String(t.unitPrice) : null,
        netAmount: t.netAmount != null ? String(t.netAmount) : null,
        grossAmount: t.grossAmount != null ? String(t.grossAmount) : null,
        realizedPnl: null,
        status: t.status,
        tradeDate: t.tradeDate,
        settlementDate: t.settlementDate,
        currencyCode: t.currencyCode,
        fundId: t.fundId,
        orderId: t.orderId ?? null,
        executionId: t.executionId ?? null,
        tradeId,
        journalEntryId: tradeId ? journalByTrade[tradeId] ?? null : null,
        documentId: tradeId ? docByTrade[tradeId] ?? null : null,
        valuationRunId: null,
      };
    });
    return paginatedResult(mapped, total, page.page, page.pageSize);
  }

  static async transaction(id: string, userId: string, user: any) {
    const transaction = await db.investmentTransaction.findUnique({
      where: { id },
      include: { order: true, execution: true, cashEntries: true },
    });
    if (!transaction) throw new InvestmentOpsError("TRANSACTION_NOT_FOUND", "Transaction not found", 404);
    await access(transaction.fundId, userId, user);
    return transaction;
  }

  static async manualAdjustment(
    fundId: string,
    data: any,
    idempotencyKey: string,
    userId: string,
    user: any
  ) {
    await access(fundId, userId, user);
    required(data.reason, "reason");
    const allowed = new Set(["CASH_ADJUSTMENT", "POSITION_ADJUSTMENT", "FEE_ADJUSTMENT"]);
    if (!allowed.has(data.transactionType)) {
      throw new InvestmentOpsError("INVALID_ADJUSTMENT_TYPE", "Unsupported adjustment type", 400);
    }
    const existing = await db.investmentTransaction.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;
    const adjustment = await db.investmentTransaction.create({
      data: {
        transactionRef: `ADJ-${randomUUID().slice(0, 12).toUpperCase()}`,
        fundId,
        instrumentId: data.instrumentId ?? null,
        transactionType: data.transactionType,
        tradeDate: new Date(required(data.tradeDate, "tradeDate")),
        settlementDate: data.settlementDate ? new Date(data.settlementDate) : null,
        quantity: data.quantity != null ? new Decimal(String(data.quantity)) : null,
        unitPrice: data.unitPrice != null ? new Decimal(String(data.unitPrice)) : null,
        grossAmount: new Decimal(String(data.grossAmount ?? data.netAmount)),
        netAmount: new Decimal(String(data.netAmount)),
        currencyCode: required(data.currencyCode, "currencyCode").toUpperCase(),
        status: "POSTED",
        idempotencyKey,
      },
    });
    await InvestmentOpsAuditService.log(
      "MANUAL_ADJUSTMENT_CREATED",
      "InvestmentTransaction",
      adjustment.id,
      { reason: data.reason, transactionType: data.transactionType, fundId },
      userId
    );
    return adjustment;
  }

  static async reverseTransaction(
    id: string,
    reason: string,
    version: string,
    idempotencyKey: string,
    userId: string,
    user: any
  ) {
    required(reason, "reason");
    const original = await this.transaction(id, userId, user);
    expected(original.version, version);
    if (original.status === "REVERSED") {
      const replay = await db.investmentTransaction.findUnique({ where: { idempotencyKey } });
      if (replay) return replay;
      throw new InvestmentOpsError("TRANSACTION_ALREADY_REVERSED", "Transaction is already reversed", 409);
    }
    const reversal = await db.$transaction(async (tx: any) => {
      const replay = await tx.investmentTransaction.findUnique({ where: { idempotencyKey } });
      if (replay) return replay;
      const reversal = await tx.investmentTransaction.create({
        data: {
          transactionRef: `REV-${randomUUID().slice(0, 12).toUpperCase()}`,
          fundId: original.fundId,
          instrumentId: original.instrumentId,
          transactionType: "REVERSAL",
          tradeDate: new Date(),
          settlementDate: original.settlementDate,
          quantity: original.quantity ? new Decimal(original.quantity).negated() : null,
          unitPrice: original.unitPrice,
          grossAmount: new Decimal(original.grossAmount).negated(),
          netAmount: new Decimal(original.netAmount).negated(),
          currencyCode: original.currencyCode,
          status: "POSTED",
          idempotencyKey,
        },
      });
      const changed = await tx.investmentTransaction.updateMany({
        where: { id, version: original.version, status: { not: "REVERSED" } },
        data: { status: "REVERSED", version: { increment: 1 } },
      });
      if (changed.count !== 1) {
        throw new InvestmentOpsError("VERSION_CONFLICT", "Transaction changed during reversal", 409);
      }
      return reversal;
    });
    await InvestmentOpsAuditService.log(
      "TRANSACTION_REVERSED",
      "InvestmentTransaction",
      id,
      { reason, reversalTransactionId: reversal.id },
      userId
    );
    return reversal;
  }

  static async dashboardJob(fundId: string | undefined, key: string, userId: string, user: any) {
    if (fundId) await access(fundId, userId, user);
    const existing = await db.investmentJob.findUnique({ where: { idempotencyKey: key } });
    if (existing) return existing;

    const { InvestmentJobWorkerService } = await import("./InvestmentJobWorkerService");
    const { ensureInvestmentPlatformJobHandlersRegistered } = await import(
      "./InvestmentPlatformJobHandlers"
    );
    ensureInvestmentPlatformJobHandlersRegistered();

    const job = await InvestmentJobWorkerService.enqueue({
      jobType: "INVESTMENT_DASHBOARD_RECALCULATE",
      aggregateType: fundId ? "FUND" : "INVESTMENT_OPS",
      aggregateId: fundId ?? null,
      payloadJson: { fundId: fundId ?? null, requestedById: userId },
      idempotencyKey: key,
      priority: 40,
    });

    // Process inline so Recalculate updates Portfolios NAV immediately (FE poll optional).
    await InvestmentJobWorkerService.processJobById(job.id);
    return InvestmentJobWorkerService.get(job.id, userId, user);
  }
}
