// @ts-nocheck
import { prisma } from "../../utils/database";
import { FpaError } from "./FpaError";
import { FpaAccessService } from "./FpaAccessService";
import { FpaAuditService } from "./FpaAuditService";

const MAPPING_STATUSES = new Set(["MAPPED", "UNMAPPED", "SUGGESTED", "TYPE_MISMATCH", "STALE"]);

/** Arcus-owned source systems (FE select). Do not default-seed SaaS connectors. */
export const DEFAULT_SEED_SYSTEMS = [
  "Custom / CSV",
  "Excel",
  "API",
  "Manual",
  "Procurement",
  "Fixed Assets",
  "Stock",
  "Portfolio",
  "Accounting GL",
  "Payroll",
  "CRM",
  "Banking",
  "Loan",
];

const SYSTEM_ALIASES: Record<string, { systemCode: string; name: string }> = {
  // Arcus labels (current FE)
  "CUSTOM / CSV": { systemCode: "CUSTOM_CSV", name: "Custom / CSV" },
  CUSTOM_CSV: { systemCode: "CUSTOM_CSV", name: "Custom / CSV" },
  CUSTOM: { systemCode: "CUSTOM_CSV", name: "Custom / CSV" },
  CSV: { systemCode: "CUSTOM_CSV", name: "Custom / CSV" },
  EXCEL: { systemCode: "EXCEL", name: "Excel" },
  API: { systemCode: "API", name: "API" },
  MANUAL: { systemCode: "MANUAL", name: "Manual" },
  PROCUREMENT: { systemCode: "PROCUREMENT", name: "Procurement" },
  "FIXED ASSETS": { systemCode: "FIXED_ASSETS", name: "Fixed Assets" },
  FIXED_ASSETS: { systemCode: "FIXED_ASSETS", name: "Fixed Assets" },
  STOCK: { systemCode: "STOCK", name: "Stock" },
  INVENTORY: { systemCode: "STOCK", name: "Stock" },
  PORTFOLIO: { systemCode: "PORTFOLIO", name: "Portfolio" },
  "ACCOUNTING GL": { systemCode: "ACCOUNTING_GL", name: "Accounting GL" },
  ACCOUNTING_GL: { systemCode: "ACCOUNTING_GL", name: "Accounting GL" },
  ACCOUNTING: { systemCode: "ACCOUNTING_GL", name: "Accounting GL" },
  PAYROLL: { systemCode: "PAYROLL", name: "Payroll" },
  CRM: { systemCode: "CRM", name: "CRM" },
  BANKING: { systemCode: "BANKING", name: "Banking" },
  LOAN: { systemCode: "LOAN", name: "Loan" },
  // Legacy SaaS names → map create/read still works; seed will not recreate these by default
  "NETSUITE GL": { systemCode: "ACCOUNTING_GL", name: "Accounting GL" },
  NETSUITE_GL: { systemCode: "ACCOUNTING_GL", name: "Accounting GL" },
  SALESFORCE: { systemCode: "CRM", name: "CRM" },
  "WORKDAY HR": { systemCode: "PAYROLL", name: "Payroll" },
  WORKDAY_HR: { systemCode: "PAYROLL", name: "Payroll" },
  WORKDAY: { systemCode: "PAYROLL", name: "Payroll" },
  "PLAID (BANK)": { systemCode: "BANKING", name: "Banking" },
  PLAID_BANK: { systemCode: "BANKING", name: "Banking" },
  PLAID: { systemCode: "BANKING", name: "Banking" },
  "ADP PAYROLL": { systemCode: "PAYROLL", name: "Payroll" },
  ADP: { systemCode: "PAYROLL", name: "Payroll" },
};

function normalizeSystem(raw: string): { systemCode: string; name: string } {
  const key = String(raw || "").trim();
  const hit = SYSTEM_ALIASES[key.toUpperCase()];
  if (hit) return hit;
  const code = key
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 64);
  return { systemCode: code || "CUSTOM_CSV", name: key || "Custom / CSV" };
}

function glAccountRange(from: number, to: number, step = 10): Array<{ fieldKey: string; dataType: string }> {
  const fields: Array<{ fieldKey: string; dataType: string }> = [];
  for (let i = from; i <= to; i += step) fields.push({ fieldKey: `GL_ACCOUNT.${i}`, dataType: "CURRENCY" });
  return fields;
}

function demoCatalogFields(systemCode: string): Array<{ fieldKey: string; dataType: string }> {
  switch (systemCode) {
    case "CUSTOM_CSV":
      return [
        { fieldKey: "CSV.REVENUE", dataType: "CURRENCY" },
        { fieldKey: "CSV.COGS", dataType: "CURRENCY" },
        { fieldKey: "CSV.OPEX", dataType: "CURRENCY" },
        { fieldKey: "CSV.HEADCOUNT", dataType: "NUMBER" },
        { fieldKey: "CSV.UNITS", dataType: "NUMBER" },
      ];
    case "EXCEL":
      return [
        { fieldKey: "XLS.BUDGET_REVENUE", dataType: "CURRENCY" },
        { fieldKey: "XLS.BUDGET_OPEX", dataType: "CURRENCY" },
        { fieldKey: "XLS.FORECAST_UNITS", dataType: "NUMBER" },
        { fieldKey: "XLS.ASSUMPTION_PRICE", dataType: "CURRENCY" },
      ];
    case "API":
      return [
        { fieldKey: "API.METRIC.REVENUE", dataType: "CURRENCY" },
        { fieldKey: "API.METRIC.ARR", dataType: "CURRENCY" },
        { fieldKey: "API.METRIC.CHURN", dataType: "PERCENT" },
        { fieldKey: "API.METRIC.ACTIVE_USERS", dataType: "NUMBER" },
      ];
    case "MANUAL":
      return [
        { fieldKey: "MANUAL.DRIVER.UNITS", dataType: "NUMBER" },
        { fieldKey: "MANUAL.DRIVER.PRICE", dataType: "CURRENCY" },
        { fieldKey: "MANUAL.DRIVER.GROWTH_PCT", dataType: "PERCENT" },
        { fieldKey: "MANUAL.ASSUMPTION.INFLATION", dataType: "PERCENT" },
      ];
    case "PROCUREMENT":
      return [
        { fieldKey: "PROC.PO_SPEND", dataType: "CURRENCY" },
        { fieldKey: "PROC.RECEIPTS", dataType: "CURRENCY" },
        { fieldKey: "PROC.OPEN_COMMITMENTS", dataType: "CURRENCY" },
        { fieldKey: "PROC.VENDOR_COUNT", dataType: "NUMBER" },
      ];
    case "FIXED_ASSETS":
      return [
        { fieldKey: "FA.GROSS_BOOK", dataType: "CURRENCY" },
        { fieldKey: "FA.ACCUM_DEPR", dataType: "CURRENCY" },
        { fieldKey: "FA.NBV", dataType: "CURRENCY" },
        { fieldKey: "FA.CAPEX", dataType: "CURRENCY" },
        { fieldKey: "FA.DEPRECIATION", dataType: "CURRENCY" },
      ];
    case "STOCK":
      return [
        { fieldKey: "INV.ON_HAND", dataType: "NUMBER" },
        { fieldKey: "INV.COGS", dataType: "CURRENCY" },
        { fieldKey: "INV.STOCK_VALUE", dataType: "CURRENCY" },
        { fieldKey: "INV.WRITE_OFF", dataType: "CURRENCY" },
      ];
    case "PORTFOLIO":
      return [
        { fieldKey: "PF.AUM", dataType: "CURRENCY" },
        { fieldKey: "PF.NAV", dataType: "CURRENCY" },
        { fieldKey: "PF.INVESTED_COST", dataType: "CURRENCY" },
        { fieldKey: "PF.UNREALIZED_GAIN", dataType: "CURRENCY" },
        { fieldKey: "PF.DISTRIBUTIONS", dataType: "CURRENCY" },
      ];
    case "ACCOUNTING_GL":
    case "ACCOUNTING":
    case "NETSUITE_GL":
      return [...glAccountRange(4000, 4090), ...glAccountRange(6000, 6090)];
    case "PAYROLL":
    case "WORKDAY_HR":
      return [
        { fieldKey: "PR.HEADCOUNT", dataType: "NUMBER" },
        { fieldKey: "PR.SALARY", dataType: "CURRENCY" },
        { fieldKey: "PR.BENEFITS", dataType: "CURRENCY" },
        { fieldKey: "PR.BONUS", dataType: "CURRENCY" },
        { fieldKey: "PR.EMPLOYER_TAX", dataType: "CURRENCY" },
      ];
    case "CRM":
    case "SALESFORCE":
      return [
        { fieldKey: "CRM.ARR", dataType: "CURRENCY" },
        { fieldKey: "CRM.BOOKINGS", dataType: "CURRENCY" },
        { fieldKey: "CRM.PIPELINE", dataType: "CURRENCY" },
        { fieldKey: "CRM.CHURN", dataType: "PERCENT" },
      ];
    case "BANKING":
    case "PLAID_BANK":
      return [
        { fieldKey: "BANK.CASH", dataType: "CURRENCY" },
        { fieldKey: "BANK.BALANCE", dataType: "CURRENCY" },
        { fieldKey: "BANK.INFLOW", dataType: "CURRENCY" },
        { fieldKey: "BANK.OUTFLOW", dataType: "CURRENCY" },
      ];
    case "LOAN":
      return [
        { fieldKey: "LOAN.PRINCIPAL", dataType: "CURRENCY" },
        { fieldKey: "LOAN.INTEREST", dataType: "CURRENCY" },
        { fieldKey: "LOAN.DRAWDOWN", dataType: "CURRENCY" },
        { fieldKey: "LOAN.REPAYMENT", dataType: "CURRENCY" },
      ];
    default:
      return [];
  }
}

function fuzzyMatchLineItem(
  fieldKey: string,
  lineItems: Array<{ id: string; code: string; name: string; moduleId: string | null }>
) {
  const key = fieldKey.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const token = fieldKey.includes(".") ? fieldKey.split(".").pop()!.toUpperCase() : fieldKey.toUpperCase();
  let best = null;
  let bestScore = 0;
  for (const li of lineItems) {
    const code = String(li.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const name = String(li.name || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    let score = 0;
    if (code && (key.includes(code) || code.includes(token.replace(/[^A-Z0-9]/g, "")))) score = 90;
    else if (name && key.includes(name)) score = 80;
    else if (code && token.includes(code)) score = 70;
    else if (name && (name.includes(token) || token.includes(name.slice(0, 6)))) score = 55;
    if (
      /ARR|BOOKINGS|PIPELINE|REVENUE|SALES|CRM\./.test(fieldKey.toUpperCase()) &&
      /ARR|BOOKINGS|PIPELINE|REVENUE|SALES/.test(`${li.code} ${li.name}`.toUpperCase())
    ) {
      score = Math.max(score, 75);
    }
    if (
      /HEADCOUNT|SALARY|PAYROLL|PR\.|HR_/.test(fieldKey.toUpperCase()) &&
      /HEADCOUNT|SALARY|PAYROLL|WAGE|HR/.test(`${li.code} ${li.name}`.toUpperCase())
    ) {
      score = Math.max(score, 75);
    }
    if (
      /BANK\.|BANK_CASH|BANK_BALANCE|CASH/.test(fieldKey.toUpperCase()) &&
      /CASH|BANK|BALANCE/.test(`${li.code} ${li.name}`.toUpperCase())
    ) {
      score = Math.max(score, 75);
    }
    if (
      /PROC\.|PO_SPEND|COMMITMENT/.test(fieldKey.toUpperCase()) &&
      /PROCURE|PURCHASE|VENDOR|SPEND/.test(`${li.code} ${li.name}`.toUpperCase())
    ) {
      score = Math.max(score, 75);
    }
    if (
      /FA\.|DEPR|CAPEX|NBV/.test(fieldKey.toUpperCase()) &&
      /ASSET|DEPR|CAPEX|PPE/.test(`${li.code} ${li.name}`.toUpperCase())
    ) {
      score = Math.max(score, 75);
    }
    if (
      /INV\.|STOCK|COGS/.test(fieldKey.toUpperCase()) &&
      /INVENTORY|STOCK|COGS/.test(`${li.code} ${li.name}`.toUpperCase())
    ) {
      score = Math.max(score, 75);
    }
    if (
      /PF\.|AUM|NAV|PORTFOLIO/.test(fieldKey.toUpperCase()) &&
      /AUM|NAV|PORTFOLIO|INVEST/.test(`${li.code} ${li.name}`.toUpperCase())
    ) {
      score = Math.max(score, 75);
    }
    if (
      /LOAN\.|INTEREST|PRINCIPAL/.test(fieldKey.toUpperCase()) &&
      /LOAN|INTEREST|DEBT|PRINCIPAL/.test(`${li.code} ${li.name}`.toUpperCase())
    ) {
      score = Math.max(score, 75);
    }
    if (
      /MANUAL\.|UNITS|PRICE|GROWTH/.test(fieldKey.toUpperCase()) &&
      /UNITS|PRICE|GROWTH|DRIVER/.test(`${li.code} ${li.name}`.toUpperCase())
    ) {
      score = Math.max(score, 75);
    }
    if (score > bestScore) {
      bestScore = score;
      best = li;
    }
  }
  return bestScore >= 70 ? best : null;
}

function toEntry(r: any) {
  return {
    id: r.id,
    sourceField: r.sourceField?.fieldKey || null,
    sourceFieldId: r.sourceFieldId,
    sourceSystem: r.sourceField?.dataSource?.name || r.sourceField?.dataSource?.systemCode || null,
    sourceSystemCode: r.sourceField?.dataSource?.systemCode || null,
    targetLineItemId: r.lineItemId,
    targetLineItemName: r.lineItem?.name || null,
    targetLineItemCode: r.lineItem?.code || null,
    moduleId: r.moduleId || r.lineItem?.moduleId || null,
    status: r.status,
    notes: r.notes || null,
    mappedAt: r.mappedAt,
    lastSyncedAt: r.lastSyncedAt,
  };
}

export class FpaDataMappingService {
  static assertBuilder(user: any) {
    FpaAccessService.assertCanApprove(user);
  }

  static async assertModel(modelId: string) {
    const model = await prisma.planningModel.findUnique({ where: { id: modelId } });
    if (!model) throw new FpaError(404, "NOT_FOUND", "Planning model not found");
    return model;
  }

  static async ensureDataSource(modelId: string, sourceSystemRaw: string) {
    const { systemCode, name } = normalizeSystem(sourceSystemRaw);
    const or: any[] = [{ systemCode }, { name }];
    // Prefer Arcus GL source over legacy NetSuite-named rows
    if (systemCode === "ACCOUNTING_GL") {
      or.push({ systemCode: "ACCOUNTING" }, { systemCode: "NETSUITE_GL" }, { name: "NetSuite GL" });
    }
    if (systemCode === "CRM") or.push({ systemCode: "SALESFORCE" }, { name: "Salesforce" });
    if (systemCode === "PAYROLL") or.push({ systemCode: "WORKDAY_HR" }, { name: "Workday HR" }, { systemCode: "ADP" }, { name: "ADP Payroll" });
    if (systemCode === "BANKING") or.push({ systemCode: "PLAID_BANK" }, { name: "Plaid (Bank)" });

    let dataSource = await prisma.planningDataSource.findFirst({
      where: { modelId, OR: or },
    });
    if (!dataSource) {
      dataSource = await prisma.planningDataSource.create({
        data: {
          modelId,
          systemCode,
          name,
          connectorConfig: { provider: systemCode, label: name, seeded: true, arcusOwned: true },
        },
      });
    } else if (
      (systemCode === "ACCOUNTING_GL" && ["NETSUITE_GL", "ACCOUNTING"].includes(dataSource.systemCode)) ||
      (systemCode === "CRM" && dataSource.systemCode === "SALESFORCE") ||
      (systemCode === "PAYROLL" && ["WORKDAY_HR", "ADP"].includes(dataSource.systemCode)) ||
      (systemCode === "BANKING" && dataSource.systemCode === "PLAID_BANK")
    ) {
      // Soft-rename legacy SaaS connector rows to Arcus labels (idempotent)
      dataSource = await prisma.planningDataSource.update({
        where: { id: dataSource.id },
        data: {
          systemCode,
          name,
          connectorConfig: {
            ...(typeof dataSource.connectorConfig === "object" && dataSource.connectorConfig
              ? dataSource.connectorConfig
              : {}),
            provider: systemCode,
            label: name,
            arcusOwned: true,
            renamedFrom: dataSource.systemCode,
          },
        },
      });
    }
    return dataSource;
  }

  static async refresh(modelId: string, user: any, body: any = {}) {
    FpaDataMappingService.assertBuilder(user);
    await FpaDataMappingService.assertModel(modelId);
    const userId = user?.id;
    const replaceExisting = body.replaceExisting === true || body.replaceExisting === "true";

    let dataSource = await prisma.planningDataSource.findFirst({
      where: {
        modelId,
        OR: [
          { systemCode: "ACCOUNTING_GL" },
          { systemCode: "ACCOUNTING" },
          { systemCode: "NETSUITE_GL" },
          { name: "Accounting GL" },
          { name: "NetSuite GL" },
        ],
      },
    });
    if (!dataSource) {
      dataSource = await prisma.planningDataSource.create({
        data: {
          modelId,
          systemCode: "ACCOUNTING_GL",
          name: "Accounting GL",
          connectorConfig: { provider: "ACCOUNTING_GL", label: "Accounting GL", arcusOwned: true },
        },
      });
    } else if (["NETSUITE_GL", "ACCOUNTING"].includes(dataSource.systemCode) || dataSource.name === "NetSuite GL") {
      dataSource = await prisma.planningDataSource.update({
        where: { id: dataSource.id },
        data: {
          systemCode: "ACCOUNTING_GL",
          name: "Accounting GL",
          connectorConfig: {
            ...(typeof dataSource.connectorConfig === "object" && dataSource.connectorConfig
              ? dataSource.connectorConfig
              : {}),
            provider: "ACCOUNTING_GL",
            label: "Accounting GL",
            arcusOwned: true,
          },
        },
      });
    }

    if (replaceExisting) {
      const fields = await prisma.planningSourceField.findMany({
        where: { dataSourceId: dataSource.id },
        select: { id: true },
      });
      const fieldIds = fields.map((f) => f.id);
      if (fieldIds.length) {
        await prisma.planningLineItemMapping.deleteMany({
          where: {
            modelId,
            sourceFieldId: { in: fieldIds },
            status: { in: ["UNMAPPED", "SUGGESTED"] },
          },
        });
      }
    }

    const modelAccounts = await prisma.planningModelAccount.findMany({ where: { modelId } });
    const accountIds = modelAccounts.map((a) => a.accountId);
    const accounts = accountIds.length
      ? await prisma.chartOfAccounts.findMany({
          where: { id: { in: accountIds } },
          select: { id: true, accountNo: true, accountName: true, accountType: true },
        })
      : [];
    const accountById = Object.fromEntries(accounts.map((a) => [a.id, a]));

    const lineItems = await prisma.planningLineItem.findMany({
      where: { modelId },
      select: { id: true, accountId: true, moduleId: true, name: true, code: true },
    });
    const liByAccount = {};
    for (const li of lineItems) {
      if (li.accountId) liByAccount[li.accountId] = li;
    }

    let createdFields = 0;
    let createdMappings = 0;
    let mapped = 0;
    const now = new Date();

    for (const ma of modelAccounts) {
      const acct = accountById[ma.accountId];
      const code = acct?.accountNo || ma.accountId;
      const fieldKey = `GL_ACCOUNT.${code}`;
      let field = await prisma.planningSourceField.findFirst({
        where: { dataSourceId: dataSource.id, fieldKey },
      });
      if (!field) {
        field = await prisma.planningSourceField.create({
          data: {
            dataSourceId: dataSource.id,
            fieldKey,
            dataType: acct?.accountType || "CURRENCY",
          },
        });
        createdFields += 1;
      }

      let mapping = await prisma.planningLineItemMapping.findFirst({
        where: { modelId, sourceFieldId: field.id },
      });
      const matchLi = liByAccount[ma.accountId] || null;
      if (!mapping) {
        mapping = await prisma.planningLineItemMapping.create({
          data: {
            modelId,
            sourceFieldId: field.id,
            lineItemId: matchLi?.id || null,
            moduleId: matchLi?.moduleId || null,
            status: matchLi ? "MAPPED" : "UNMAPPED",
            mappedAt: matchLi ? now : null,
            mappedById: matchLi ? userId : null,
            lastSyncedAt: now,
          },
        });
        createdMappings += 1;
        if (matchLi) mapped += 1;
      } else {
        const data: any = { lastSyncedAt: now };
        // Never wipe manual MAPPED rows; only auto-fill UNMAPPED without a target
        if (matchLi && mapping.status === "UNMAPPED" && !mapping.lineItemId) {
          data.lineItemId = matchLi.id;
          data.moduleId = matchLi.moduleId || null;
          data.status = "MAPPED";
          data.mappedAt = now;
          data.mappedById = userId;
          mapped += 1;
        }
        await prisma.planningLineItemMapping.update({ where: { id: mapping.id }, data });
      }
    }

    await FpaAuditService.log("DATA_MAPPING_REFRESH", userId, {
      modelId,
      entityType: "mapping",
      summary: `Refreshed mappings (${createdFields} fields, ${createdMappings} mappings)`,
      reason: JSON.stringify({ createdFields, createdMappings, mapped, replaceExisting }),
    });

    const list = await FpaDataMappingService.list(modelId, {});
    return {
      createdFields,
      createdMappings,
      summary: list.summary,
      ...list,
    };
  }

  static async seedCatalog(modelId: string, body: any, user: any) {
    FpaDataMappingService.assertBuilder(user);
    await FpaDataMappingService.assertModel(modelId);
    const userId = user?.id;
    const replaceExisting = body.replaceExisting === true || body.replaceExisting === "true";
    const moduleId = body.moduleId ? String(body.moduleId) : null;
    const systemsRaw = Array.isArray(body.systems) && body.systems.length
      ? body.systems.map(String)
      : [...DEFAULT_SEED_SYSTEMS];

    // Never seed third-party SaaS connector catalogs as new default systems
    const BLOCKED_SEED = new Set([
      "NETSUITE GL",
      "NETSUITE_GL",
      "SALESFORCE",
      "WORKDAY HR",
      "WORKDAY_HR",
      "WORKDAY",
      "PLAID (BANK)",
      "PLAID_BANK",
      "PLAID",
      "ADP PAYROLL",
      "ADP",
    ]);
    const systemsFiltered = systemsRaw.filter((s) => !BLOCKED_SEED.has(String(s).trim().toUpperCase()));
    // If caller only sent blocked SaaS names, fall back to Arcus defaults
    const systemsToSeed = systemsFiltered.length ? systemsFiltered : [...DEFAULT_SEED_SYSTEMS];

    const lineItems = await prisma.planningLineItem.findMany({
      where: { modelId, ...(moduleId ? { moduleId } : {}) },
      select: { id: true, code: true, name: true, moduleId: true },
    });

    let createdFields = 0;
    let createdMappings = 0;
    const now = new Date();

    for (const sys of systemsToSeed) {
      const dataSource = await FpaDataMappingService.ensureDataSource(modelId, sys);
      if (replaceExisting) {
        const fields = await prisma.planningSourceField.findMany({
          where: { dataSourceId: dataSource.id },
          select: { id: true },
        });
        const fieldIds = fields.map((f) => f.id);
        if (fieldIds.length) {
          await prisma.planningLineItemMapping.deleteMany({
            where: {
              modelId,
              sourceFieldId: { in: fieldIds },
              status: { in: ["UNMAPPED", "SUGGESTED"] },
            },
          });
        }
      }

      const catalog = demoCatalogFields(dataSource.systemCode);
      for (const item of catalog) {
        let field = await prisma.planningSourceField.findFirst({
          where: { dataSourceId: dataSource.id, fieldKey: item.fieldKey },
        });
        if (!field) {
          field = await prisma.planningSourceField.create({
            data: {
              dataSourceId: dataSource.id,
              fieldKey: item.fieldKey,
              dataType: item.dataType,
            },
          });
          createdFields += 1;
        }

        let mapping = await prisma.planningLineItemMapping.findFirst({
          where: { modelId, sourceFieldId: field.id },
        });
        if (mapping) {
          if (mapping.status === "MAPPED" && mapping.lineItemId) continue;
          const match = fuzzyMatchLineItem(item.fieldKey, lineItems);
          if (match && !mapping.lineItemId) {
            await prisma.planningLineItemMapping.update({
              where: { id: mapping.id },
              data: {
                lineItemId: match.id,
                moduleId: match.moduleId || moduleId,
                status: "MAPPED",
                mappedAt: now,
                mappedById: userId,
                lastSyncedAt: now,
              },
            });
          } else {
            await prisma.planningLineItemMapping.update({
              where: { id: mapping.id },
              data: { lastSyncedAt: now },
            });
          }
          continue;
        }

        const match = fuzzyMatchLineItem(item.fieldKey, lineItems);
        await prisma.planningLineItemMapping.create({
          data: {
            modelId,
            sourceFieldId: field.id,
            lineItemId: match?.id || null,
            moduleId: match?.moduleId || moduleId,
            status: match ? "MAPPED" : "UNMAPPED",
            mappedAt: match ? now : null,
            mappedById: match ? userId : null,
            lastSyncedAt: now,
          },
        });
        createdMappings += 1;
      }
    }

    const list = await FpaDataMappingService.list(modelId, moduleId ? { moduleId } : {});
    await FpaAuditService.log("DATA_MAPPING_SEED_CATALOG", userId, {
      modelId,
      moduleId,
      entityType: "mapping",
      summary: `Seeded connector catalog (${createdFields} fields, ${createdMappings} mappings)`,
      reason: JSON.stringify({
        systems: systemsToSeed,
        blockedSkipped: systemsRaw.length - systemsToSeed.length,
        createdFields,
        createdMappings,
        replaceExisting,
        summary: list.summary,
      }),
    });

    return {
      createdFields,
      createdMappings,
      summary: list.summary,
    };
  }

  static async create(modelId: string, body: any, user: any) {
    FpaDataMappingService.assertBuilder(user);
    await FpaDataMappingService.assertModel(modelId);
    const sourceSystem = body.sourceSystem != null ? String(body.sourceSystem).trim() : "";
    const sourceFieldKey = body.sourceField != null ? String(body.sourceField).trim() : "";
    if (!sourceSystem || !sourceFieldKey) {
      throw new FpaError(400, "VALIDATION", "sourceSystem and sourceField are required");
    }

    const targetLineItemId = body.targetLineItemId ?? body.lineItemId ?? null;
    let status = body.status != null ? String(body.status).toUpperCase() : null;
    if (status && !MAPPING_STATUSES.has(status)) {
      throw new FpaError(400, "VALIDATION", `Invalid status: ${status}`);
    }
    const notes = body.notes != null ? String(body.notes) : null;
    const moduleIdBody = body.moduleId != null ? String(body.moduleId) : null;

    let lineItem = null;
    if (targetLineItemId) {
      lineItem = await prisma.planningLineItem.findFirst({
        where: { id: String(targetLineItemId), modelId },
      });
      if (!lineItem) throw new FpaError(400, "VALIDATION", "targetLineItemId must belong to model");
    }

    if (!status) status = lineItem ? "MAPPED" : "UNMAPPED";

    const dataSource = await FpaDataMappingService.ensureDataSource(modelId, sourceSystem);
    let field = await prisma.planningSourceField.findFirst({
      where: { dataSourceId: dataSource.id, fieldKey: sourceFieldKey },
    });
    if (!field) {
      field = await prisma.planningSourceField.create({
        data: {
          dataSourceId: dataSource.id,
          fieldKey: sourceFieldKey,
          dataType: "CURRENCY",
        },
      });
    }

    const existing = await prisma.planningLineItemMapping.findFirst({
      where: { modelId, sourceFieldId: field.id },
      include: {
        sourceField: { include: { dataSource: true } },
        lineItem: { select: { id: true, code: true, name: true, moduleId: true } },
      },
    });
    if (existing) {
      const err: any = new FpaError(
        409,
        "MAPPING_EXISTS",
        `Mapping already exists for ${sourceSystem} / ${sourceFieldKey}`
      );
      err.existingId = existing.id;
      err.existing = toEntry(existing);
      throw err;
    }

    const now = new Date();
    const created = await prisma.planningLineItemMapping.create({
      data: {
        modelId,
        sourceFieldId: field.id,
        lineItemId: lineItem?.id || null,
        moduleId: moduleIdBody || lineItem?.moduleId || null,
        status,
        notes,
        mappedAt: lineItem && status === "MAPPED" ? now : null,
        mappedById: lineItem && status === "MAPPED" ? user?.id || null : null,
        lastSyncedAt: null,
      },
      include: {
        sourceField: { include: { dataSource: true } },
        lineItem: { select: { id: true, code: true, name: true, moduleId: true } },
      },
    });

    const entry = toEntry(created);
    await FpaAuditService.log("MAPPING_CREATE", user?.id, {
      modelId,
      lineItemId: created.lineItemId,
      moduleId: created.moduleId,
      entityType: "mapping",
      newValue: created.id,
      summary: `Mapped ${sourceFieldKey} → ${entry.targetLineItemName || "(unmapped)"}`,
      reason: JSON.stringify({
        summary: `Mapped ${sourceFieldKey} → ${entry.targetLineItemName || "(unmapped)"}`,
        entityId: created.id,
        sourceSystem,
        sourceField: sourceFieldKey,
        status,
      }),
    });

    return entry;
  }

  static async list(modelId: string, query: any = {}) {
    await FpaDataMappingService.assertModel(modelId);
    const where: any = { modelId };
    if (query.moduleId) where.moduleId = String(query.moduleId);
    if (query.unmappedOnly === true || query.unmappedOnly === "1" || query.unmappedOnly === "true") {
      where.status = "UNMAPPED";
    } else if (query.status) {
      where.status = String(query.status).toUpperCase();
    }

    const take = Math.min(Number(query.limit || query.pageSize || 100), 500);
    const skip = query.page ? (Math.max(1, Number(query.page)) - 1) * take : Number(query.offset || query.cursor || 0);

    const rows = await prisma.planningLineItemMapping.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take,
      skip,
      include: {
        sourceField: { include: { dataSource: true } },
        lineItem: { select: { id: true, code: true, name: true, moduleId: true } },
      },
    });

    let filtered = rows;
    if (query.sourceSystem) {
      const sys = String(query.sourceSystem).toUpperCase();
      filtered = filtered.filter((r) => {
        const code = String(r.sourceField?.dataSource?.systemCode || "").toUpperCase();
        const name = String(r.sourceField?.dataSource?.name || "").toUpperCase();
        return (
          code.includes(sys) ||
          name.includes(sys) ||
          (sys === "NETSUITE" &&
            (code === "ACCOUNTING" ||
              code === "ACCOUNTING_GL" ||
              code === "NETSUITE_GL" ||
              name.includes("NETSUITE") ||
              name.includes("ACCOUNTING"))) ||
          (sys === "ACCOUNTING" && (code.includes("ACCOUNTING") || name.includes("ACCOUNTING")))
        );
      });
    }
    if (query.q) {
      const q = String(query.q).trim().toLowerCase();
      filtered = filtered.filter((r) => {
        const key = String(r.sourceField?.fieldKey || "").toLowerCase();
        const li = String(r.lineItem?.name || r.lineItem?.code || "").toLowerCase();
        const notes = String(r.notes || "").toLowerCase();
        return key.includes(q) || li.includes(q) || notes.includes(q);
      });
    }

    const allForSummary = await prisma.planningLineItemMapping.findMany({
      where: { modelId, ...(query.moduleId ? { moduleId: String(query.moduleId) } : {}) },
      select: { status: true },
    });
    const total = allForSummary.length;
    const mappedCount = allForSummary.filter((r) => r.status === "MAPPED").length;
    const pct = total ? Math.round((mappedCount / total) * 1000) / 10 : 0;

    return {
      summary: { total, mapped: mappedCount, unmapped: total - mappedCount, pct },
      entries: filtered.map(toEntry),
      nextCursor: rows.length === take ? String(skip + take) : null,
    };
  }

  static async update(modelId: string, mappingId: string, body: any, user: any) {
    FpaDataMappingService.assertBuilder(user);
    await FpaDataMappingService.assertModel(modelId);
    const mapping = await prisma.planningLineItemMapping.findFirst({
      where: { id: mappingId, modelId },
      include: {
        sourceField: { include: { dataSource: true } },
        lineItem: { select: { id: true, code: true, name: true } },
      },
    });
    if (!mapping) throw new FpaError(404, "NOT_FOUND", "Mapping not found");

    const data: any = {};
    const targetLineItemId = body.targetLineItemId !== undefined ? body.targetLineItemId : body.lineItemId;

    if (body.sourceSystem != null || body.sourceField != null) {
      const sysRaw = body.sourceSystem != null ? String(body.sourceSystem) : mapping.sourceField?.dataSource?.name;
      const fieldKey = body.sourceField != null ? String(body.sourceField).trim() : mapping.sourceField?.fieldKey;
      if (sysRaw && fieldKey) {
        const dataSource = await FpaDataMappingService.ensureDataSource(modelId, sysRaw);
        let field = await prisma.planningSourceField.findFirst({
          where: { dataSourceId: dataSource.id, fieldKey },
        });
        if (!field) {
          field = await prisma.planningSourceField.create({
            data: { dataSourceId: dataSource.id, fieldKey, dataType: "CURRENCY" },
          });
        }
        if (field.id !== mapping.sourceFieldId) {
          const clash = await prisma.planningLineItemMapping.findFirst({
            where: { modelId, sourceFieldId: field.id, NOT: { id: mappingId } },
          });
          if (clash) {
            const err: any = new FpaError(409, "MAPPING_EXISTS", "Another mapping already uses this source field");
            err.existingId = clash.id;
            throw err;
          }
          data.sourceFieldId = field.id;
        }
      }
    }

    if (targetLineItemId !== undefined) {
      if (targetLineItemId) {
        const li = await prisma.planningLineItem.findFirst({
          where: { id: String(targetLineItemId), modelId },
        });
        if (!li) throw new FpaError(400, "VALIDATION", "targetLineItemId must belong to model");
        data.lineItemId = li.id;
        data.moduleId = body.moduleId != null ? String(body.moduleId) : li.moduleId;
        data.status = "MAPPED";
        data.mappedAt = new Date();
        data.mappedById = user?.id || null;
      } else {
        data.lineItemId = null;
        data.moduleId = body.moduleId != null ? String(body.moduleId) : null;
        data.status = "UNMAPPED";
        data.mappedAt = null;
        data.mappedById = null;
      }
    }
    if (body.moduleId !== undefined && targetLineItemId === undefined) {
      data.moduleId = body.moduleId ? String(body.moduleId) : null;
    }
    if (body.status != null) {
      const st = String(body.status).toUpperCase();
      if (!MAPPING_STATUSES.has(st)) throw new FpaError(400, "VALIDATION", `Invalid status: ${st}`);
      data.status = st;
    }
    if (body.notes !== undefined) {
      data.notes = body.notes != null ? String(body.notes) : null;
    }

    const updated = await prisma.planningLineItemMapping.update({
      where: { id: mappingId },
      data,
      include: {
        sourceField: { include: { dataSource: true } },
        lineItem: { select: { id: true, code: true, name: true, moduleId: true } },
      },
    });

    const entry = toEntry(updated);
    const summary = `Updated mapping ${entry.sourceField} → ${entry.targetLineItemName || "(unmapped)"}`;
    await FpaAuditService.log("MAPPING_UPDATE", user?.id, {
      modelId,
      lineItemId: updated.lineItemId,
      moduleId: updated.moduleId,
      entityType: "mapping",
      newValue: updated.id,
      summary,
      reason: JSON.stringify({
        summary,
        entityId: updated.id,
        before: { status: mapping.status, lineItemId: mapping.lineItemId },
        after: { status: updated.status, lineItemId: updated.lineItemId },
      }),
    });

    return entry;
  }

  static async remove(modelId: string, mappingId: string, user: any) {
    FpaDataMappingService.assertBuilder(user);
    await FpaDataMappingService.assertModel(modelId);
    const mapping = await prisma.planningLineItemMapping.findFirst({
      where: { id: mappingId, modelId },
      include: {
        sourceField: { include: { dataSource: true } },
        lineItem: { select: { id: true, name: true } },
      },
    });
    if (!mapping) throw new FpaError(404, "NOT_FOUND", "Mapping not found");

    await prisma.planningLineItemMapping.delete({ where: { id: mappingId } });

    const fieldKey = mapping.sourceField?.fieldKey || mappingId;
    const liName = mapping.lineItem?.name || "(unmapped)";
    await FpaAuditService.log("MAPPING_DELETE", user?.id, {
      modelId,
      lineItemId: mapping.lineItemId,
      moduleId: mapping.moduleId,
      entityType: "mapping",
      oldValue: mappingId,
      summary: `Removed mapping ${fieldKey} → ${liName}`,
      reason: JSON.stringify({
        summary: `Removed mapping ${fieldKey} → ${liName}`,
        entityId: mappingId,
        sourceField: fieldKey,
      }),
    });

    return { id: mappingId, deleted: true };
  }
}
