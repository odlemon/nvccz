// @ts-nocheck
import { Decimal } from "@prisma/client/runtime/library";
import { randomUUID } from "crypto";
import { InvestmentOpsError } from "../../middleware/investmentOpsFoundation";
import { prisma } from "../../utils/database";
import { ListedEquityAccessService } from "../listedEquity/ListedEquityAccessService";
import { ListedEquityPortfolioService } from "../listedEquity/ListedEquityPortfolioService";
import { paginatedResult, parsePagination } from "./investmentOpsSupport";

const db = prisma as any;
const APPROVAL_ROUTES_KEY = "order_approval_routes";

function required(value: unknown, field: string) {
  const text = String(value ?? "").trim();
  if (!text) throw new InvestmentOpsError("VALIDATION_ERROR", `${field} is required`, 400);
  return text;
}

function versioned(value: any) {
  return { version: Number(value?.version || 0) + 1, routes: Array.isArray(value?.routes) ? value.routes : [] };
}

async function routesSetting() {
  return db.investmentOpsSetting.findUnique({ where: { settingKey: APPROVAL_ROUTES_KEY } });
}

async function saveRoutes(value: any, userId: string) {
  return db.investmentOpsSetting.upsert({
    where: { settingKey: APPROVAL_ROUTES_KEY },
    create: { settingKey: APPROVAL_ROUTES_KEY, settingValue: value, updatedById: userId },
    update: { settingValue: value, updatedById: userId },
  });
}

export class InvestmentTradingPhase2Service {
  static async orderConfiguration(fundId: string, userId: string, user: any) {
    await ListedEquityAccessService.assertFundAccess(userId, fundId, user);
    const [portfolio, fund, setting] = await Promise.all([
      db.investmentPortfolioConfig.findUnique({ where: { fundId } }),
      db.listedEquityFundConfig.findUnique({ where: { fundId } }),
      routesSetting(),
    ]);
    if (!portfolio) throw new InvestmentOpsError("PORTFOLIO_CONFIG_NOT_FOUND", "Configuration not found", 404);
    return {
      fundId,
      version: portfolio.version,
      baseCurrencyCode: portfolio.baseCurrencyCode,
      approvalPolicy: portfolio.approvalPolicyJson,
      settlementPolicy: portfolio.settlementPolicyJson,
      defaultBrokerProfileId: fund?.brokerProfileId || null,
      defaultCustodianProfileId: fund?.custodianProfileId || null,
      approvalRoutesVersion: Number((setting?.settingValue as any)?.version || 0),
    };
  }

  static async updateOrderConfiguration(
    fundId: string,
    data: any,
    expectedVersion: string,
    userId: string,
    user: any
  ) {
    await ListedEquityAccessService.assertFundAccess(userId, fundId, user);
    const config = await db.investmentPortfolioConfig.findUnique({ where: { fundId } });
    if (!config) throw new InvestmentOpsError("PORTFOLIO_CONFIG_NOT_FOUND", "Configuration not found", 404);
    if (String(config.version) !== String(expectedVersion)) {
      throw new InvestmentOpsError("VERSION_CONFLICT", "Configuration changed", 409);
    }
    return db.investmentPortfolioConfig.update({
      where: { id: config.id },
      data: {
        ...(data.approvalPolicy !== undefined ? { approvalPolicyJson: data.approvalPolicy } : {}),
        ...(data.settlementPolicy !== undefined ? { settlementPolicyJson: data.settlementPolicy } : {}),
        version: { increment: 1 },
        updatedById: userId,
      },
    });
  }

  static async approvalRoutes() {
    const row = await routesSetting();
    return row?.settingValue || { version: 0, routes: [] };
  }

  static async createApprovalRoute(data: any, expectedVersion: string, userId: string) {
    const current = (await this.approvalRoutes()) as any;
    if (String(current.version) !== String(expectedVersion)) {
      throw new InvestmentOpsError("VERSION_CONFLICT", "Approval routes changed", 409);
    }
    const next = versioned(current);
    const route = {
      id: randomUUID(),
      name: required(data.name, "name"),
      priority: Number(data.priority || 100),
      criteria: data.criteria || {},
      steps: Array.isArray(data.steps) ? data.steps : [],
      isActive: data.isActive !== false,
    };
    next.routes = [...current.routes, route];
    await saveRoutes(next, userId);
    return route;
  }

  static async updateApprovalRoute(id: string, data: any, expectedVersion: string, userId: string) {
    const current = (await this.approvalRoutes()) as any;
    if (String(current.version) !== String(expectedVersion)) {
      throw new InvestmentOpsError("VERSION_CONFLICT", "Approval routes changed", 409);
    }
    const index = current.routes.findIndex((route: any) => route.id === id);
    if (index < 0) throw new InvestmentOpsError("APPROVAL_ROUTE_NOT_FOUND", "Approval route not found", 404);
    const next = versioned(current);
    next.routes = [...current.routes];
    next.routes[index] = { ...next.routes[index], ...data, id };
    await saveRoutes(next, userId);
    return next.routes[index];
  }

  static async removeApprovalRoute(id: string, expectedVersion: string, userId: string) {
    return this.updateApprovalRoute(id, { isActive: false }, expectedVersion, userId);
  }

  static async applicableApprovalRoutes(orderId: string, userId: string, user: any) {
    const order = await db.investmentOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new InvestmentOpsError("ORDER_NOT_FOUND", "Order not found", 404);
    await ListedEquityAccessService.assertFundAccess(userId, order.fundId, user);
    const current = (await this.approvalRoutes()) as any;
    const amount = new Decimal(order.quantity).mul(order.executionPrice || order.limitPrice || 0);
    return current.routes
      .filter((route: any) => route.isActive)
      .filter((route: any) => !route.criteria?.fundId || route.criteria.fundId === order.fundId)
      .filter((route: any) => !route.criteria?.side || route.criteria.side === order.side)
      .filter((route: any) => route.criteria?.minAmount == null || amount.gte(route.criteria.minAmount))
      .sort((a: any, b: any) => a.priority - b.priority);
  }

  static async blotters(query: any, userId: string, user: any) {
    const scope = await ListedEquityAccessService.getAccessibleFundIds(userId, user);
    if (query.fundId) await ListedEquityAccessService.assertFundAccess(userId, query.fundId, user);
    const page = parsePagination(query);
    const where = {
      ...(query.fundId ? { fundId: query.fundId } : scope === "ALL" ? {} : { fundId: { in: scope } }),
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await Promise.all([
      db.investmentBlotter.findMany({
        where,
        include: { items: { include: { order: true }, orderBy: { lineNo: "asc" } } },
        orderBy: { blotterDate: "desc" },
        skip: page.skip,
        take: page.take,
      }),
      db.investmentBlotter.count({ where }),
    ]);
    const userIds = [
      ...new Set(
        items
          .flatMap((b: any) => [b.createdById, b.closedById])
          .filter(Boolean)
      ),
    ];
    const users = userIds.length
      ? await db.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const nameById = Object.fromEntries(
      users.map((u: any) => [
        u.id,
        `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email || u.id,
      ])
    );
    const presented = items.map((b: any) => {
      const ownerId = b.createdById || b.closedById || null;
      const ownerName = ownerId ? nameById[ownerId] || null : null;
      return {
        ...b,
        ownerId,
        ownerName,
        createdByName: b.createdById ? nameById[b.createdById] || null : null,
        closedByName: b.closedById ? nameById[b.closedById] || null : null,
      };
    });
    return paginatedResult(presented, total, page.page, page.pageSize);
  }

  static async createBlotter(data: any, userId: string, user: any) {
    await ListedEquityAccessService.assertFundAccess(userId, data.fundId, user);
    return db.investmentBlotter.create({
      data: {
        fundId: required(data.fundId, "fundId"),
        blotterDate: new Date(required(data.blotterDate, "blotterDate")),
        blotterType: required(data.blotterType, "blotterType"),
        createdById: userId,
      },
    });
  }

  static async getBlotter(id: string, userId: string, user: any) {
    const row = await db.investmentBlotter.findUnique({
      where: { id },
      include: { items: { include: { order: true }, orderBy: { lineNo: "asc" } } },
    });
    if (!row) throw new InvestmentOpsError("BLOTTER_NOT_FOUND", "Blotter not found", 404);
    await ListedEquityAccessService.assertFundAccess(userId, row.fundId, user);
    return row;
  }

  static async updateBlotter(id: string, data: any, expectedVersion: string, userId: string, user: any) {
    const row = await this.getBlotter(id, userId, user);
    if (String(row.version) !== String(expectedVersion)) {
      throw new InvestmentOpsError("VERSION_CONFLICT", "Blotter changed", 409);
    }
    return db.investmentBlotter.update({
      where: { id },
      data: {
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.blotterType !== undefined ? { blotterType: data.blotterType } : {}),
        ...(data.status === "CLOSED" ? { closedById: userId, closedAt: new Date() } : {}),
        version: { increment: 1 },
      },
    });
  }

  static async addBlotterOrder(id: string, orderId: string, expectedVersion: string, userId: string, user: any) {
    const blotter = await this.getBlotter(id, userId, user);
    if (String(blotter.version) !== String(expectedVersion)) {
      throw new InvestmentOpsError("VERSION_CONFLICT", "Blotter changed", 409);
    }
    const order = await db.investmentOrder.findFirst({ where: { id: orderId, fundId: blotter.fundId } });
    if (!order) throw new InvestmentOpsError("ORDER_NOT_FOUND", "Order not found in blotter fund", 404);
    const lineNo = Math.max(0, ...blotter.items.map((item: any) => item.lineNo)) + 1;
    await db.$transaction([
      db.investmentBlotterItem.create({
        data: {
          blotterId: id,
          orderId,
          lineNo,
          snapshotJson: {
            orderRef: order.orderRef,
            revisionNo: order.currentRevisionNo,
            side: order.side,
            quantity: order.quantity.toString(),
            status: order.status,
          },
        },
      }),
      db.investmentBlotter.update({ where: { id }, data: { version: { increment: 1 } } }),
    ]);
    return this.getBlotter(id, userId, user);
  }

  static async removeBlotterOrder(
    id: string,
    orderId: string,
    expectedVersion: string,
    userId: string,
    user: any
  ) {
    const blotter = await this.getBlotter(id, userId, user);
    if (String(blotter.version) !== String(expectedVersion)) {
      throw new InvestmentOpsError("VERSION_CONFLICT", "Blotter changed", 409);
    }
    await db.$transaction([
      db.investmentBlotterItem.delete({ where: { blotterId_orderId: { blotterId: id, orderId } } }),
      db.investmentBlotter.update({ where: { id }, data: { version: { increment: 1 } } }),
    ]);
    return this.getBlotter(id, userId, user);
  }

  static async positions(fundId: string, userId: string, user: any) {
    return ListedEquityPortfolioService.getHoldings(fundId, userId, user);
  }

  static async positionSummary(fundId: string, userId: string, user: any) {
    const items = await this.positions(fundId, userId, user);
    const marketValue = items.reduce(
      (sum: Decimal, item: any) => sum.plus(String(item.marketValue ?? 0)),
      new Decimal(0)
    );
    const unrealizedPnl = items.reduce(
      (sum: Decimal, item: any) => sum.plus(String(item.unrealizedPnl ?? 0)),
      new Decimal(0)
    );
    return {
      fundId,
      positionCount: items.length,
      marketValue: marketValue.toString(),
      unrealizedPnl: unrealizedPnl.toString(),
    };
  }

  static async recalculatePositions(fundId: string, key: string, userId: string, user: any) {
    await ListedEquityAccessService.assertFundAccess(userId, fundId, user);
    const replay = await db.investmentJob.findUnique({ where: { idempotencyKey: key } });
    if (replay) return replay;
    return db.investmentJob.create({
      data: {
        jobType: "TRADING_POSITIONS_RECALCULATE",
        aggregateType: "FUND",
        aggregateId: fundId,
        payloadJson: { fundId, requestedById: userId },
        idempotencyKey: key,
      },
    });
  }

  static savedViews(viewType: string, userId: string) {
    return db.investmentSavedView.findMany({ where: { userId, viewType }, orderBy: { name: "asc" } });
  }

  static createSavedView(viewType: string, data: any, userId: string) {
    return db.investmentSavedView.create({
      data: {
        userId,
        viewType,
        name: required(data.name, "name"),
        filterJson: data.filter || {},
        columnJson: data.columns,
        sortJson: data.sort,
        isDefault: Boolean(data.isDefault),
      },
    });
  }

  static async updateSavedView(id: string, data: any, version: string, userId: string) {
    const view = await db.investmentSavedView.findFirst({ where: { id, userId } });
    if (!view) throw new InvestmentOpsError("SAVED_VIEW_NOT_FOUND", "Saved view not found", 404);
    if (String(view.version) !== String(version)) throw new InvestmentOpsError("VERSION_CONFLICT", "Saved view changed", 409);
    return db.investmentSavedView.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.filter !== undefined ? { filterJson: data.filter } : {}),
        ...(data.columns !== undefined ? { columnJson: data.columns } : {}),
        ...(data.sort !== undefined ? { sortJson: data.sort } : {}),
        ...(data.isDefault !== undefined ? { isDefault: Boolean(data.isDefault) } : {}),
        version: { increment: 1 },
      },
    });
  }

  static async deleteSavedView(id: string, version: string, userId: string) {
    const view = await db.investmentSavedView.findFirst({ where: { id, userId } });
    if (!view) throw new InvestmentOpsError("SAVED_VIEW_NOT_FOUND", "Saved view not found", 404);
    if (String(view.version) !== String(version)) throw new InvestmentOpsError("VERSION_CONFLICT", "Saved view changed", 409);
    await db.investmentSavedView.delete({ where: { id } });
    return { id, deleted: true };
  }
}
