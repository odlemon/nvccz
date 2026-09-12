// @ts-nocheck
import { InvestmentOpsError } from "../../middleware/investmentOpsFoundation";
import { SpCashPositionService } from "./SpCashPositionService";
import {
  assertMakerNotChecker,
  assertVersion,
  db,
  emitCash,
  encryptExternalId,
  fingerprint,
  hideOrForbidden,
  maskAccount,
  moneyPair,
  paginated,
  parseDateOnly,
  parsePagination,
  requireStr,
  withIdempotency,
} from "./spCashSupport";

function presentAccount(row: any, balances?: { cashBalance?: any; availableBalance?: any }) {
  return {
    accountId: row.id,
    id: row.id,
    tenantId: row.tenantId,
    legalEntityId: row.legalEntityId,
    clientOrVehicleId: row.clientOrVehicleId,
    mandateId: row.mandateId,
    portfolioId: row.portfolioId,
    ownerModel: row.ownerModel,
    moneyClass: row.moneyClass,
    accountType: row.accountType,
    providerId: row.providerId,
    maskedIdentifier: row.maskedIdentifier || row.accountNumberMasked,
    accountNumberMasked: row.accountNumberMasked || row.maskedIdentifier,
    clientName: row.clientName,
    baseCurrency: row.currency,
    currency: row.currency,
    status: row.status,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
    calendarId: row.calendarId,
    timezone: row.timezone,
    tolerancePolicyId: row.tolerancePolicyId,
    glMappingId: row.glMappingId,
    reconciliationHealth: row.reconciliationHealth,
    version: row.version,
    cashBalance: balances?.cashBalance ?? null,
    availableBalance: balances?.availableBalance ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function attachBalances(row: any) {
  if (String(row.status) !== "ACTIVE") {
    return presentAccount(row, {
      cashBalance: moneyPair(0, row.currency),
      availableBalance: moneyPair(0, row.currency),
    });
  }
  try {
    const pos = await SpCashPositionService.compute({
      portfolioId: row.portfolioId,
      cashAccountId: row.id,
      currency: row.currency,
    });
    return presentAccount(row, {
      cashBalance: moneyPair(pos.postedSettledCash, row.currency),
      availableBalance: moneyPair(pos.orderEligibleAvailableCash, row.currency),
    });
  } catch {
    return presentAccount(row, {
      cashBalance: moneyPair(0, row.currency),
      availableBalance: moneyPair(0, row.currency),
    });
  }
}

export class SpCashAccountService {
  static async list(query: any = {}) {
    const { page, pageSize, skip, take } = parsePagination(query);
    const where: any = {};
    if (query.portfolioId) where.portfolioId = String(query.portfolioId);
    if (query.clientOrVehicleId) where.clientOrVehicleId = String(query.clientOrVehicleId);
    if (query.client) where.clientOrVehicleId = String(query.client);
    if (query.status) where.status = String(query.status);
    if (query.providerId) where.providerId = String(query.providerId);
    if (query.currency) where.currency = String(query.currency).toUpperCase();
    if (query.tenantId) where.tenantId = String(query.tenantId);
    if (query.search) {
      const s = String(query.search);
      where.OR = [
        { clientName: { contains: s } },
        { maskedIdentifier: { contains: s } },
        { accountNumberMasked: { contains: s } },
      ];
    }

    const [rows, total] = await Promise.all([
      db.spCashClientAccount.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip,
        take,
      }),
      db.spCashClientAccount.count({ where }),
    ]);

    const items = [];
    for (const row of rows) {
      items.push(await attachBalances(row));
    }
    return paginated(items, total, page, pageSize);
  }

  static async get(accountId: string, scope: { clientOrVehicleId?: string; tenantId?: string } = {}) {
    const row = await db.spCashClientAccount.findUnique({ where: { id: accountId } });
    hideOrForbidden(row, scope);
    // Isolation: when filter client mismatches account — already 404 via hideOrForbidden
    return attachBalances(row);
  }

  static async create(body: any, actorId: string, idempotencyKey?: string) {
    const payload = {
      legalEntityId: requireStr(body.legalEntityId, "legalEntityId"),
      clientOrVehicleId: requireStr(body.clientOrVehicleId, "clientOrVehicleId"),
      portfolioId: requireStr(body.portfolioId, "portfolioId"),
      ownerModel: requireStr(body.ownerModel, "ownerModel"),
      moneyClass: requireStr(body.moneyClass, "moneyClass"),
      accountType: requireStr(body.accountType, "accountType"),
      providerId: requireStr(body.providerId, "providerId"),
      currency: requireStr(body.currency, "currency").toUpperCase(),
      externalAccountIdentifier: requireStr(
        body.externalAccountIdentifier || body.externalIdentifier,
        "externalAccountIdentifier"
      ),
      effectiveFrom: body.effectiveFrom,
    };

    return withIdempotency(
      "sp-cash:account:create",
      idempotencyKey || body.idempotencyKey,
      payload,
      async () => {
        const ext = payload.externalAccountIdentifier;
        const fp = fingerprint([payload.providerId, ext, payload.currency]);
        const encrypted = encryptExternalId(ext);
        const masked = maskAccount(ext);

        const created = await db.spCashClientAccount.create({
          data: {
            tenantId: String(body.tenantId || body.legalEntityId),
            legalEntityId: payload.legalEntityId,
            clientOrVehicleId: payload.clientOrVehicleId,
            mandateId: body.mandateId || null,
            portfolioId: payload.portfolioId,
            ownerModel: payload.ownerModel,
            moneyClass: payload.moneyClass,
            accountType: payload.accountType,
            providerId: payload.providerId,
            externalIdentifierEncrypted: encrypted,
            externalFingerprint: fp,
            maskedIdentifier: masked,
            accountNumberMasked: masked,
            currency: payload.currency,
            status: "DRAFT",
            effectiveFrom: parseDateOnly(payload.effectiveFrom, "effectiveFrom") || new Date(),
            effectiveTo: parseDateOnly(body.effectiveTo, "effectiveTo"),
            calendarId: body.calendarId || null,
            timezone: body.timezone || null,
            tolerancePolicyId: body.tolerancePolicyId || null,
            glMappingId: body.glMappingId || null,
            clientName: body.clientName || null,
            createdById: actorId,
            version: 1,
          },
        });

        await emitCash({
          eventType: "cash.account.created",
          aggregateType: "SpCashClientAccount",
          aggregateId: created.id,
          aggregateVersion: created.version,
          actorId,
          payload: { status: created.status, currency: created.currency },
          tenantId: created.tenantId,
          legalEntityId: created.legalEntityId,
        });

        return presentAccount(created);
      },
      201
    );
  }

  static async submit(accountId: string, body: any, actorId: string) {
    const row = await db.spCashClientAccount.findUnique({ where: { id: accountId } });
    hideOrForbidden(row, {
      clientOrVehicleId: body?.clientOrVehicleId,
      tenantId: body?.tenantId,
    });
    if (!["DRAFT", "REJECTED"].includes(row.status)) {
      throw new InvestmentOpsError(
        "INVALID_STATUS",
        `Cannot submit account in status ${row.status}`,
        409
      );
    }
    if (body?.expectedVersion != null) assertVersion(row, body.expectedVersion);

    const updated = await db.spCashClientAccount.update({
      where: { id: accountId },
      data: { status: "PENDING_APPROVAL", version: { increment: 1 } },
    });
    await emitCash({
      eventType: "cash.account.submitted",
      aggregateType: "SpCashClientAccount",
      aggregateId: updated.id,
      aggregateVersion: updated.version,
      actorId,
      tenantId: updated.tenantId,
      legalEntityId: updated.legalEntityId,
    });
    return presentAccount(updated);
  }

  static async approve(accountId: string, body: any, actorId: string) {
    const row = await db.spCashClientAccount.findUnique({ where: { id: accountId } });
    hideOrForbidden(row);
    if (row.status !== "PENDING_APPROVAL") {
      throw new InvestmentOpsError(
        "INVALID_STATUS",
        `Cannot approve account in status ${row.status}`,
        409
      );
    }
    assertMakerNotChecker(row.createdById, actorId);
    if (body?.expectedVersion != null) assertVersion(row, body.expectedVersion);

    const updated = await db.spCashClientAccount.update({
      where: { id: accountId },
      data: {
        status: "ACTIVE",
        approvedById: actorId,
        version: { increment: 1 },
        reconciliationHealth: row.reconciliationHealth || "HEALTHY",
      },
    });

    await emitCash({
      eventType: "cash.account.approved",
      aggregateType: "SpCashClientAccount",
      aggregateId: updated.id,
      aggregateVersion: updated.version,
      actorId,
      payload: {
        ownershipScope: {
          clientOrVehicleId: updated.clientOrVehicleId,
          portfolioId: updated.portfolioId,
        },
        currency: updated.currency,
        effectiveFrom: updated.effectiveFrom,
      },
      tenantId: updated.tenantId,
      legalEntityId: updated.legalEntityId,
    });
    return presentAccount(updated);
  }

  static async reject(accountId: string, body: any, actorId: string) {
    const row = await db.spCashClientAccount.findUnique({ where: { id: accountId } });
    hideOrForbidden(row);
    if (row.status !== "PENDING_APPROVAL") {
      throw new InvestmentOpsError(
        "INVALID_STATUS",
        `Cannot reject account in status ${row.status}`,
        409
      );
    }
    assertMakerNotChecker(row.createdById, actorId);
    if (body?.expectedVersion != null) assertVersion(row, body.expectedVersion);

    const updated = await db.spCashClientAccount.update({
      where: { id: accountId },
      data: { status: "REJECTED", version: { increment: 1 } },
    });
    await emitCash({
      eventType: "cash.account.rejected",
      aggregateType: "SpCashClientAccount",
      aggregateId: updated.id,
      aggregateVersion: updated.version,
      actorId,
      reason: body?.reason || null,
      tenantId: updated.tenantId,
      legalEntityId: updated.legalEntityId,
    });
    return presentAccount(updated);
  }

  static async suspend(accountId: string, body: any, actorId: string) {
    const row = await db.spCashClientAccount.findUnique({ where: { id: accountId } });
    hideOrForbidden(row);
    if (row.status !== "ACTIVE") {
      throw new InvestmentOpsError(
        "INVALID_STATUS",
        `Cannot suspend account in status ${row.status}`,
        409
      );
    }
    if (body?.expectedVersion != null) assertVersion(row, body.expectedVersion);
    const updated = await db.spCashClientAccount.update({
      where: { id: accountId },
      data: { status: "SUSPENDED", version: { increment: 1 } },
    });
    await emitCash({
      eventType: "cash.account.suspended",
      aggregateType: "SpCashClientAccount",
      aggregateId: updated.id,
      aggregateVersion: updated.version,
      actorId,
      reason: body?.reason || null,
    });
    return presentAccount(updated);
  }

  static async close(accountId: string, body: any, actorId: string) {
    const row = await db.spCashClientAccount.findUnique({ where: { id: accountId } });
    hideOrForbidden(row);
    if (!["ACTIVE", "SUSPENDED"].includes(row.status)) {
      throw new InvestmentOpsError(
        "INVALID_STATUS",
        `Cannot close account in status ${row.status}`,
        409
      );
    }
    if (body?.expectedVersion != null) assertVersion(row, body.expectedVersion);
    const updated = await db.spCashClientAccount.update({
      where: { id: accountId },
      data: {
        status: "CLOSED",
        effectiveTo: parseDateOnly(body?.effectiveTo) || new Date(),
        version: { increment: 1 },
      },
    });
    await emitCash({
      eventType: "cash.account.closed",
      aggregateType: "SpCashClientAccount",
      aggregateId: updated.id,
      aggregateVersion: updated.version,
      actorId,
      reason: body?.reason || null,
    });
    return presentAccount(updated);
  }
}
