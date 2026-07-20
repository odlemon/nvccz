// @ts-nocheck
import { randomUUID } from "crypto";
import { InvestmentOpsError } from "../../middleware/investmentOpsFoundation";
import { prisma } from "../../utils/database";
import { paginatedResult, parsePagination } from "./investmentOpsSupport";

const db = prisma as any;

type DirectSpec = {
  delegate: string;
  codeField?: string;
  nameField: string;
  activeField: string;
  allowed: string[];
};

const DIRECT: Record<string, DirectSpec> = {
  countries: {
    delegate: "investmentCountry",
    codeField: "countryCode",
    nameField: "countryName",
    activeField: "isActive",
    allowed: ["countryCode", "countryName", "region", "isActive"],
  },
  currencies: {
    delegate: "currency",
    codeField: "code",
    nameField: "name",
    activeField: "isActive",
    allowed: ["code", "name", "symbol", "decimalPlaces", "isDefault", "isActive"],
  },
  issuers: {
    delegate: "investmentIssuer",
    codeField: "issuerCode",
    nameField: "legalName",
    activeField: "isActive",
    allowed: ["issuerCode", "legalName", "countryCode", "sector", "isActive"],
  },
  markets: {
    delegate: "investmentMarket",
    codeField: "marketCode",
    nameField: "marketName",
    activeField: "isActive",
    allowed: ["marketCode", "marketName", "countryCode", "exchangeCode", "isActive"],
  },
  stakeholders: {
    delegate: "listedEquityStakeholderProfile",
    nameField: "name",
    activeField: "isActive",
    allowed: ["profileType", "name", "contactEmail", "deliveryMode", "isActive"],
  },
  commissions: {
    delegate: "investmentBrokerCommission",
    nameField: "stakeholderProfileId",
    activeField: "isActive",
    allowed: [
      "stakeholderProfileId",
      "instrumentTypeCode",
      "rateBps",
      "flatFee",
      "currencyCode",
      "isActive",
    ],
  },
  "instrument-types": {
    delegate: "investmentInstrumentType",
    codeField: "typeCode",
    nameField: "displayName",
    activeField: "isActive",
    allowed: ["typeCode", "displayName", "isActive"],
  },
  "price-sources": {
    delegate: "listedEquityMarketDataSourceConfig",
    codeField: "sourceCode",
    nameField: "displayName",
    activeField: "isEnabled",
    allowed: ["sourceCode", "displayName", "sourceUrl", "cronWindows", "isEnabled"],
  },
};

export const SETTING_REFERENCE_TYPES = new Set([
  "settlement-accounts",
  "ssis",
  "instrument-subcategories",
  "instrument-mappings",
  "tags",
  "coupon-frequencies",
  "corporate-action-mappings",
  "icons",
]);

function spec(type: string) {
  const value = DIRECT[type];
  if (!value && !SETTING_REFERENCE_TYPES.has(type)) {
    throw new InvestmentOpsError("UNKNOWN_REFERENCE_TYPE", `Unknown reference type ${type}`, 404);
  }
  return value;
}

function clean(data: any, allowed: string[]) {
  return Object.fromEntries(allowed.filter((key) => data[key] !== undefined).map((key) => [key, data[key]]));
}

function directVersion(item: any) {
  return String(new Date(item.updatedAt ?? item.createdAt).getTime());
}

function presentDirect(item: any) {
  const base = { ...item, version: directVersion(item) };
  if (item?.code != null && item?.symbol != null && item?.decimalPlaces == null) {
    // Currency rows before DDL backfill
    return { ...base, decimalPlaces: 2, decimals: 2 };
  }
  if (item?.decimalPlaces != null) {
    return { ...base, decimals: item.decimalPlaces };
  }
  return base;
}

function validatePayload(type: string, data: any) {
  const direct = DIRECT[type];
  const nameField = direct?.nameField ?? "name";
  if (!String(data?.[nameField] ?? "").trim()) {
    throw new InvestmentOpsError("VALIDATION_ERROR", `${nameField} is required`, 400, { field: nameField });
  }
  if (direct?.codeField && !String(data?.[direct.codeField] ?? "").trim()) {
    throw new InvestmentOpsError("VALIDATION_ERROR", `${direct.codeField} is required`, 400, {
      field: direct.codeField,
    });
  }
}

async function settingCatalog(type: string) {
  const key = `reference.${type}`;
  const row = await db.investmentOpsSetting.findUnique({ where: { settingKey: key } });
  const value = row?.settingValue as any;
  return {
    row,
    key,
    version: Number(value?.version ?? 1),
    items: Array.isArray(value?.items) ? value.items : [],
  };
}

export class InvestmentOpsReferenceService {
  static types() {
    return [...Object.keys(DIRECT), ...SETTING_REFERENCE_TYPES].sort();
  }

  static async list(type: string, query: any) {
    const direct = spec(type);
    const page = parsePagination(query);
    const includeArchived = String(query.includeArchived) === "true";
    if (!direct) {
      const catalog = await settingCatalog(type);
      let items = catalog.items.filter((item: any) => includeArchived || item.isActive !== false);
      if (page.search) {
        const search = page.search.toLowerCase();
        items = items.filter((item: any) =>
          Object.values(item).some((value) => String(value ?? "").toLowerCase().includes(search))
        );
      }
      const direction = page.sortDirection === "asc" ? 1 : -1;
      const sortBy = page.sortBy === "createdAt" ? "name" : page.sortBy;
      items.sort((a: any, b: any) => String(a[sortBy] ?? "").localeCompare(String(b[sortBy] ?? "")) * direction);
      return paginatedResult(
        items.slice(page.skip, page.skip + page.take),
        items.length,
        page.page,
        page.pageSize
      );
    }
    const delegate = db[direct.delegate];
    const where: any = {
      ...(includeArchived ? {} : { [direct.activeField]: true }),
      ...(page.search
        ? {
            OR: [
              { [direct.nameField]: { contains: page.search } },
              ...(direct.codeField ? [{ [direct.codeField]: { contains: page.search } }] : []),
            ],
          }
        : {}),
    };
    const allowedSort = new Set(["createdAt", "updatedAt", direct.nameField, direct.codeField].filter(Boolean));
    const sortBy = allowedSort.has(page.sortBy) ? page.sortBy : direct.nameField;
    const [items, total] = await Promise.all([
      delegate.findMany({
        where,
        skip: page.skip,
        take: page.take,
        orderBy: { [sortBy]: page.sortDirection },
      }),
      delegate.count({ where }),
    ]);
    return paginatedResult(items.map(presentDirect), total, page.page, page.pageSize);
  }

  static async get(type: string, id: string) {
    const direct = spec(type);
    if (!direct) {
      const catalog = await settingCatalog(type);
      const item = catalog.items.find((candidate: any) => candidate.id === id);
      if (!item) throw new InvestmentOpsError("REFERENCE_NOT_FOUND", "Reference item not found", 404);
      return item;
    }
    const item = await db[direct.delegate].findUnique({ where: { id } });
    if (!item) throw new InvestmentOpsError("REFERENCE_NOT_FOUND", "Reference item not found", 404);
    return presentDirect(item);
  }

  static async create(type: string, data: any, userId: string) {
    const direct = spec(type);
    validatePayload(type, data);
    if (direct) {
      return presentDirect(await db[direct.delegate].create({ data: clean(data, direct.allowed) }));
    }
    const catalog = await settingCatalog(type);
    const now = new Date().toISOString();
    const item = {
      ...data,
      id: randomUUID(),
      version: 1,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    await db.investmentOpsSetting.upsert({
      where: { settingKey: catalog.key },
      create: {
        settingKey: catalog.key,
        settingValue: { version: catalog.version + 1, items: [...catalog.items, item] },
        updatedById: userId,
      },
      update: {
        settingValue: { version: catalog.version + 1, items: [...catalog.items, item] },
        updatedById: userId,
      },
    });
    return item;
  }

  static async update(type: string, id: string, data: any, expectedVersion: string, userId: string) {
    const direct = spec(type);
    if (direct) {
      const current = await this.get(type, id);
      const currentVersion = current.version;
      if (String(currentVersion) !== expectedVersion) {
        throw new InvestmentOpsError("VERSION_CONFLICT", "Reference item has changed", 409, {
          expectedVersion,
          currentVersion: String(currentVersion),
        });
      }
      return presentDirect(await db[direct.delegate].update({
        where: { id },
        data: clean(data, direct.allowed.filter((key) => key !== direct.codeField)),
      }));
    }
    const catalog = await settingCatalog(type);
    const index = catalog.items.findIndex((item: any) => item.id === id);
    if (index < 0) throw new InvestmentOpsError("REFERENCE_NOT_FOUND", "Reference item not found", 404);
    const current = catalog.items[index];
    if (String(current.version) !== expectedVersion) {
      throw new InvestmentOpsError("VERSION_CONFLICT", "Reference item has changed", 409, {
        expectedVersion,
        currentVersion: String(current.version),
      });
    }
    const updated = {
      ...current,
      ...data,
      id,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    const items = [...catalog.items];
    items[index] = updated;
    await db.investmentOpsSetting.upsert({
      where: { settingKey: catalog.key },
      create: {
        settingKey: catalog.key,
        settingValue: { version: catalog.version + 1, items },
        updatedById: userId,
      },
      update: {
        settingValue: { version: catalog.version + 1, items },
        updatedById: userId,
      },
    });
    return updated;
  }

  static async archive(type: string, id: string, expectedVersion: string, userId: string) {
    const direct = spec(type);
    if (direct) {
      const current = await this.get(type, id);
      const currentVersion = current.version;
      if (String(currentVersion) !== expectedVersion) {
        throw new InvestmentOpsError("VERSION_CONFLICT", "Reference item has changed", 409);
      }
      return presentDirect(await db[direct.delegate].update({
        where: { id },
        data: { [direct.activeField]: false },
      }));
    }
    return this.update(type, id, { isActive: false }, expectedVersion, userId);
  }
}
