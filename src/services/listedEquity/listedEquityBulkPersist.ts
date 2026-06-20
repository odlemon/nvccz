// @ts-nocheck
import { Prisma } from "@prisma/client";
import { prisma } from "../../utils/database";

export type SecuritySyncRow = {
  symbol: string;
  name: string;
  isin?: string | null;
  providerCode?: string;
  vendorSymbol?: string;
};

/** One read + bulk writes instead of per-symbol round trips. */
export async function bulkSyncListedSecurities(params: {
  exchangeCode: string;
  listingCurrencyCode: string;
  providerCode: string;
  rows: SecuritySyncRow[];
}) {
  const exchangeCode = params.exchangeCode.toUpperCase();
  const normalized = params.rows
    .map((r) => ({
      symbol: String(r.symbol || "").toUpperCase(),
      name: String(r.name || r.symbol || "").slice(0, 512),
      isin: r.isin || null,
      providerCode: r.providerCode,
      vendorSymbol: r.vendorSymbol,
    }))
    .filter((r) => r.symbol);

  if (!normalized.length) return { created: 0, updated: 0, total: 0 };

  const vendorFilters = normalized.map((r) => ({
    providerCode: r.providerCode ?? params.providerCode,
    vendorSymbol: (r.vendorSymbol ?? r.symbol).toUpperCase(),
  }));
  const uniqueVendorFilters = [
    ...new Map(vendorFilters.map((v) => [`${v.providerCode}:${v.vendorSymbol}`, v])).values(),
  ];

  const [existingSecurities, existingVendor] = await Promise.all([
    prisma.listedEquitySecurity.findMany({ where: { exchangeCode } }),
    uniqueVendorFilters.length
      ? prisma.listedEquitySecurityVendorSymbol.findMany({ where: { OR: uniqueVendorFilters } })
      : Promise.resolve([]),
  ]);

  const secBySymbol = new Map(existingSecurities.map((s) => [s.symbol, s]));
  const vendorByKey = new Map(
    existingVendor.map((v) => [`${v.providerCode}:${v.vendorSymbol}`, v])
  );

  const toCreate: Array<{
    symbol: string;
    exchangeCode: string;
    name: string;
    listingCurrencyCode: string;
    isin: string | null;
    isActive: boolean;
  }> = [];
  const nameUpdates: Array<{ id: string; name: string; isin?: string | null }> = [];

  for (const row of normalized) {
    const existing = secBySymbol.get(row.symbol);
    if (!existing) {
      toCreate.push({
        symbol: row.symbol,
        exchangeCode,
        name: row.name,
        listingCurrencyCode: params.listingCurrencyCode,
        isin: row.isin,
        isActive: true,
      });
      continue;
    }
    if (existing.name !== row.name || (row.isin && existing.isin !== row.isin)) {
      nameUpdates.push({
        id: existing.id,
        name: row.name,
        ...(row.isin && existing.isin !== row.isin ? { isin: row.isin } : {}),
      });
    }
  }

  let created = 0;
  if (toCreate.length) {
    const createSymbols = toCreate.map((r) => r.symbol);
    await prisma.listedEquitySecurity.createMany({ data: toCreate, skipDuplicates: true });
    const inserted = await prisma.listedEquitySecurity.findMany({
      where: { exchangeCode, symbol: { in: createSymbols } },
    });
    created = inserted.filter((s) => !existingSecurities.some((e) => e.id === s.id)).length;
    for (const sec of inserted) secBySymbol.set(sec.symbol, sec);
  }

  let updated = 0;
  if (nameUpdates.length) {
    await prisma.$transaction(
      nameUpdates.map((u) =>
        prisma.listedEquitySecurity.update({
          where: { id: u.id },
          data: { name: u.name, ...(u.isin != null ? { isin: u.isin } : {}) },
        })
      )
    );
    updated = nameUpdates.length;
  }

  const vendorCreates: Array<{ securityId: string; providerCode: string; vendorSymbol: string }> = [];
  for (const row of normalized) {
    const sec = secBySymbol.get(row.symbol);
    if (!sec) continue;
    const providerCode = row.providerCode ?? params.providerCode;
    const vendorSymbol = (row.vendorSymbol ?? row.symbol).toUpperCase();
    const vendor = vendorByKey.get(`${providerCode}:${vendorSymbol}`);
    if (vendor?.securityId === sec.id) continue;
    vendorCreates.push({ securityId: sec.id, providerCode, vendorSymbol });
  }
  if (vendorCreates.length) {
    await prisma.listedEquitySecurityVendorSymbol.createMany({
      data: vendorCreates,
      skipDuplicates: true,
    });
  }

  return { created, updated, total: normalized.length };
}

/** Latest APPROVED price per (securityId, priceType) — single SQL round trip. */
export async function loadLatestApprovedPriceMap(
  securityIds: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!securityIds.length) return out;

  const rows = await prisma.$queryRaw<Array<{ security_id: string; price_type: string; price: unknown }>>(
    Prisma.sql`
      SELECT t.security_id, t.price_type, t.price
      FROM listed_equity_price_ticks t
      INNER JOIN (
        SELECT security_id, price_type, MAX(priced_at) AS priced_at
        FROM listed_equity_price_ticks
        WHERE validation_status = 'APPROVED'
          AND security_id IN (${Prisma.join(securityIds)})
        GROUP BY security_id, price_type
      ) latest
        ON t.security_id = latest.security_id
       AND t.price_type = latest.price_type
       AND t.priced_at = latest.priced_at
    `
  );

  for (const row of rows) {
    out.set(`${row.security_id}:${row.price_type}`, Number(row.price));
  }
  return out;
}

export async function loadActiveSecurityMap(exchangeCode: string) {
  const rows = await prisma.listedEquitySecurity.findMany({
    where: { exchangeCode, isActive: true },
  });
  return new Map(rows.map((s) => [s.symbol.toUpperCase(), s]));
}
