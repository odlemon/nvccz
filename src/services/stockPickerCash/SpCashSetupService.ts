// @ts-nocheck
import { InvestmentOpsError } from "../../middleware/investmentOpsFoundation";
import {
  assertMakerNotChecker,
  assertVersion,
  d,
  db,
  emitCash,
  moneyStr,
  paginated,
  parseDateOnly,
  parsePagination,
  requireStr,
  withIdempotency,
} from "./spCashSupport";

type Resource =
  | "providers"
  | "file-layouts"
  | "account-mappings"
  | "tolerance-policies"
  | "match-weight-policies";

function modelFor(resource: Resource) {
  switch (resource) {
    case "providers":
      return { client: db.spCashProvider, name: "SpCashProvider" };
    case "file-layouts":
      return { client: db.spCashFileLayout, name: "SpCashFileLayout" };
    case "account-mappings":
      return { client: db.spCashAccountMapping, name: "SpCashAccountMapping" };
    case "tolerance-policies":
      return { client: db.spCashTolerancePolicy, name: "SpCashTolerancePolicy" };
    case "match-weight-policies":
      return { client: db.spCashMatchWeightPolicy, name: "SpCashMatchWeightPolicy" };
    default:
      throw new InvestmentOpsError("NOT_FOUND", `Unknown setup resource ${resource}`, 404);
  }
}

function serializeRow(resource: Resource, row: any) {
  if (!row) return row;
  const out = { ...row };
  if (resource === "tolerance-policies" && out.amountTolerance != null) {
    out.amountTolerance = moneyStr(out.amountTolerance);
  }
  if (resource === "match-weight-policies") {
    for (const f of [
      "amountWeight",
      "dateWeight",
      "referenceWeight",
      "counterpartyWeight",
      "autoMatchThreshold",
      "suggestThreshold",
      "weakThreshold",
    ]) {
      if (out[f] != null) out[f] = Number(out[f]);
    }
  }
  return out;
}

function createData(resource: Resource, body: any, actorId: string) {
  switch (resource) {
    case "providers":
      return {
        tenantId: requireStr(body.tenantId || body.legalEntityId || "default", "tenantId"),
        code: requireStr(body.code, "code"),
        displayName: requireStr(body.displayName, "displayName"),
        providerType: requireStr(body.providerType, "providerType"),
        status: "DRAFT",
        version: 1,
      };
    case "file-layouts":
      return {
        providerId: requireStr(body.providerId, "providerId"),
        layoutCode: requireStr(body.layoutCode, "layoutCode"),
        versionNo: Number(body.versionNo) || 1,
        signMapJson: body.signMapJson || body.signMap || { Debit: "NEGATIVE", Credit: "POSITIVE" },
        dateMapJson: body.dateMapJson || body.dateMap || { valueDate: "value_date" },
        status: "DRAFT",
        effectiveFrom: parseDateOnly(body.effectiveFrom) || new Date(),
        effectiveTo: parseDateOnly(body.effectiveTo),
      };
    case "account-mappings":
      return {
        providerId: requireStr(body.providerId, "providerId"),
        layoutId: body.layoutId || null,
        externalFingerprint: requireStr(body.externalFingerprint, "externalFingerprint"),
        currency: requireStr(body.currency, "currency").toUpperCase(),
        cashAccountId: body.cashAccountId || null,
        status: "DRAFT",
        version: 1,
        effectiveFrom: parseDateOnly(body.effectiveFrom) || new Date(),
        effectiveTo: parseDateOnly(body.effectiveTo),
      };
    case "tolerance-policies":
      return {
        code: requireStr(body.code, "code"),
        currency: requireStr(body.currency, "currency").toUpperCase(),
        amountTolerance: d(body.amountTolerance ?? 0),
        dateToleranceDays: Number(body.dateToleranceDays) || 0,
        status: "DRAFT",
        version: 1,
        effectiveFrom: parseDateOnly(body.effectiveFrom) || new Date(),
        effectiveTo: parseDateOnly(body.effectiveTo),
        configJson: body.configJson || null,
      };
    case "match-weight-policies":
      return {
        code: requireStr(body.code, "code"),
        amountWeight: d(body.amountWeight ?? 0.5),
        dateWeight: d(body.dateWeight ?? 0.2),
        referenceWeight: d(body.referenceWeight ?? 0.2),
        counterpartyWeight: d(body.counterpartyWeight ?? 0.1),
        autoMatchThreshold: d(body.autoMatchThreshold ?? 0.95),
        suggestThreshold: d(body.suggestThreshold ?? 0.7),
        weakThreshold: d(body.weakThreshold ?? 0.5),
        status: "DRAFT",
        version: 1,
        effectiveFrom: parseDateOnly(body.effectiveFrom) || new Date(),
        effectiveTo: parseDateOnly(body.effectiveTo),
      };
    default:
      return body;
  }
}

export class SpCashSetupService {
  static async list(resource: Resource, query: any = {}) {
    const { client } = modelFor(resource);
    const { page, pageSize, skip, take } = parsePagination(query);
    const where: any = {};
    if (query.status) where.status = String(query.status);
    if (query.providerId) where.providerId = String(query.providerId);
    if (query.code) where.code = String(query.code);

    const [items, total] = await Promise.all([
      client.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
      client.count({ where }),
    ]);
    return paginated(
      items.map((r: any) => serializeRow(resource, r)),
      total,
      page,
      pageSize
    );
  }

  static async get(resource: Resource, id: string) {
    const { client } = modelFor(resource);
    const row = await client.findUnique({ where: { id } });
    if (!row) throw new InvestmentOpsError("NOT_FOUND", `${resource} not found`, 404);
    return serializeRow(resource, row);
  }

  static async create(resource: Resource, body: any, actorId: string, idempotencyKey?: string) {
    const { client, name } = modelFor(resource);
    const data = createData(resource, body, actorId);
    return withIdempotency(
      `sp-cash:setup:${resource}:create`,
      idempotencyKey || body.idempotencyKey,
      data,
      async () => {
        const created = await client.create({ data });
        await emitCash({
          eventType: "cash.config.created",
          aggregateType: name,
          aggregateId: created.id,
          aggregateVersion: created.version || created.versionNo || 1,
          actorId,
          payload: { resource, status: created.status },
        });
        return serializeRow(resource, created);
      },
      201
    );
  }

  static async activate(resource: Resource, id: string, body: any, actorId: string) {
    const { client, name } = modelFor(resource);
    const row = await client.findUnique({ where: { id } });
    if (!row) throw new InvestmentOpsError("NOT_FOUND", `${resource} not found`, 404);
    if (body?.expectedVersion != null && row.version != null) {
      assertVersion(row, body.expectedVersion);
    }
    if (row.createdById) assertMakerNotChecker(row.createdById, actorId);

    // Deactivate prior ACTIVE siblings with same code when applicable
    if (row.code) {
      const supersedeData: any = { status: "SUPERSEDED" };
      if ("effectiveTo" in row) {
        supersedeData.effectiveTo = parseDateOnly(body.effectiveFrom) || new Date();
      }
      if ("version" in row && row.version != null) {
        /* leave version as-is on superseded rows */
      }
      await client.updateMany({
        where: { code: row.code, status: "ACTIVE", id: { not: id } },
        data: supersedeData,
      });
    }

    const activateData: any = { status: "ACTIVE" };
    if ("version" in row && row.version != null) {
      activateData.version = { increment: 1 };
    }
    const updated = await client.update({
      where: { id },
      data: activateData,
    });

    await emitCash({
      eventType: "cash.config.activated",
      aggregateType: name,
      aggregateId: id,
      aggregateVersion: updated.version || updated.versionNo || 1,
      actorId,
      payload: { resource },
    });
    return serializeRow(resource, updated);
  }

  // Convenience wrappers
  static listProviders(q: any) {
    return this.list("providers", q);
  }
  static createProvider(b: any, a: string, k?: string) {
    return this.create("providers", b, a, k);
  }
  static listFileLayouts(q: any) {
    return this.list("file-layouts", q);
  }
  static createFileLayout(b: any, a: string, k?: string) {
    return this.create("file-layouts", b, a, k);
  }
  static listAccountMappings(q: any) {
    return this.list("account-mappings", q);
  }
  static createAccountMapping(b: any, a: string, k?: string) {
    return this.create("account-mappings", b, a, k);
  }
  static listTolerancePolicies(q: any) {
    return this.list("tolerance-policies", q);
  }
  static createTolerancePolicy(b: any, a: string, k?: string) {
    return this.create("tolerance-policies", b, a, k);
  }
  static listMatchWeightPolicies(q: any) {
    return this.list("match-weight-policies", q);
  }
  static createMatchWeightPolicy(b: any, a: string, k?: string) {
    return this.create("match-weight-policies", b, a, k);
  }
}
