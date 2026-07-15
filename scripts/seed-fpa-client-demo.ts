// @ts-nocheck
/**
 * Seed rich FY2026 Arcus Holdings FP&A demo data (Model Builder, Detailed, Planning, Budgeting).
 * Does NOT wipe — run clear-fpa-planning-data.ts first if needed.
 *
 * Run: npx ts-node --transpile-only -r dotenv/config scripts/seed-fpa-client-demo.ts
 * Safety: refuses client1_db unless ALLOW_CLIENT1_FPA_SEED=1
 */
import "dotenv/config";
import { randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/** Lean seed for demo UI (non-scrollable lists): fewer models/cycles/owners/scenarios. */
const LITE = process.env.FPA_DEMO_LITE === "1" || process.env.FPA_DEMO_LITE === "true";

function cuid(): string {
  return `c${Date.now().toString(36)}${randomBytes(8).toString("hex")}`.slice(0, 25);
}

function assertSafeDatabaseUrl(url: string) {
  const lower = url.toLowerCase();
  if (lower.includes("client1_db") && process.env.ALLOW_CLIENT1_FPA_SEED !== "1") {
    throw new Error(
      "Refusing to seed client1_db. Set ALLOW_CLIENT1_FPA_SEED=1 only if intentional."
    );
  }
}

function d(n: number): string {
  return (Math.round(n * 10000) / 10000).toFixed(4);
}

function monthDate(year: number, monthIndex: number): Date {
  return new Date(Date.UTC(year, monthIndex, 1));
}

function floor(n: number): number {
  return Math.floor(n);
}

const SEASONALITY = [0, 40, 80, 60, 20, 100, 140, 120, 90, 110, 130, 150];

type LineDef = {
  code: string;
  name: string;
  lineItemType: string;
  category: string;
  dataType: string;
  summaryMethod: string;
  moduleCode: string;
  isEditable: boolean;
  expression?: string;
  dependsOn?: string[];
};

const PRIMARY_MODULES = [
  { code: "REVENUE", name: "Revenue", calcOrder: 10, sortOrder: 10 },
  { code: "COGS", name: "COGS & Margin", calcOrder: 20, sortOrder: 20 },
  { code: "WORKFORCE", name: "Workforce", calcOrder: 30, sortOrder: 30 },
  { code: "OPEX", name: "Operating Expenses", calcOrder: 40, sortOrder: 40 },
  { code: "CASH", name: "Cash", calcOrder: 50, sortOrder: 50 },
];

const PRIMARY_LINES: LineDef[] = [
  {
    code: "UNITS",
    name: "Units Sold",
    lineItemType: "DRIVER",
    category: "REVENUE",
    dataType: "NUMBER",
    summaryMethod: "SUM",
    moduleCode: "REVENUE",
    isEditable: true,
  },
  {
    code: "PRICE",
    name: "Average Price",
    lineItemType: "INPUT",
    category: "REVENUE",
    dataType: "CURRENCY",
    summaryMethod: "AVG",
    moduleCode: "REVENUE",
    isEditable: true,
  },
  {
    code: "GROSS_REVENUE",
    name: "Gross Revenue",
    lineItemType: "CALC",
    category: "REVENUE",
    dataType: "CURRENCY",
    summaryMethod: "SUM",
    moduleCode: "REVENUE",
    isEditable: false,
    expression: "LINE('UNITS')*LINE('PRICE')",
  },
  {
    code: "DISCOUNTS",
    name: "Discounts",
    lineItemType: "INPUT",
    category: "REVENUE",
    dataType: "CURRENCY",
    summaryMethod: "SUM",
    moduleCode: "REVENUE",
    isEditable: true,
  },
  {
    code: "NET_REVENUE",
    name: "Net Revenue",
    lineItemType: "CALC",
    category: "REVENUE",
    dataType: "CURRENCY",
    summaryMethod: "SUM",
    moduleCode: "REVENUE",
    isEditable: false,
    expression: "LINE('GROSS_REVENUE')-LINE('DISCOUNTS')",
    dependsOn: ["GROSS_REVENUE"],
  },
  {
    code: "COGS",
    name: "Cost of Goods Sold",
    lineItemType: "EXPENSE",
    category: "EXPENSE",
    dataType: "CURRENCY",
    summaryMethod: "SUM",
    moduleCode: "COGS",
    isEditable: true,
  },
  {
    code: "GROSS_PROFIT",
    name: "Gross Profit",
    lineItemType: "CALC",
    category: "REVENUE",
    dataType: "CURRENCY",
    summaryMethod: "SUM",
    moduleCode: "COGS",
    isEditable: false,
    expression: "LINE('NET_REVENUE')-LINE('COGS')",
    dependsOn: ["NET_REVENUE"],
  },
  {
    code: "HEADCOUNT",
    name: "Headcount",
    lineItemType: "DRIVER",
    category: "WORKFORCE",
    dataType: "NUMBER",
    summaryMethod: "AVG",
    moduleCode: "WORKFORCE",
    isEditable: true,
  },
  {
    code: "AVG_SALARY",
    name: "Average Salary",
    lineItemType: "INPUT",
    category: "WORKFORCE",
    dataType: "CURRENCY",
    summaryMethod: "AVG",
    moduleCode: "WORKFORCE",
    isEditable: true,
  },
  {
    code: "SALARIES",
    name: "Salaries",
    lineItemType: "CALC",
    category: "EXPENSE",
    dataType: "CURRENCY",
    summaryMethod: "SUM",
    moduleCode: "WORKFORCE",
    isEditable: false,
    expression: "LINE('HEADCOUNT')*LINE('AVG_SALARY')",
  },
  {
    code: "RENT",
    name: "Rent",
    lineItemType: "EXPENSE",
    category: "EXPENSE",
    dataType: "CURRENCY",
    summaryMethod: "SUM",
    moduleCode: "OPEX",
    isEditable: true,
  },
  {
    code: "MARKETING",
    name: "Marketing",
    lineItemType: "EXPENSE",
    category: "EXPENSE",
    dataType: "CURRENCY",
    summaryMethod: "SUM",
    moduleCode: "OPEX",
    isEditable: true,
  },
  {
    code: "GA",
    name: "G&A",
    lineItemType: "EXPENSE",
    category: "EXPENSE",
    dataType: "CURRENCY",
    summaryMethod: "SUM",
    moduleCode: "OPEX",
    isEditable: true,
  },
  {
    code: "EBITDA",
    name: "EBITDA",
    lineItemType: "CALC",
    category: "REVENUE",
    dataType: "CURRENCY",
    summaryMethod: "SUM",
    moduleCode: "CASH",
    isEditable: false,
    expression:
      "LINE('GROSS_PROFIT')-LINE('SALARIES')-LINE('RENT')-LINE('MARKETING')-LINE('GA')",
    dependsOn: ["GROSS_PROFIT", "SALARIES"],
  },
  {
    code: "OPENING_CASH",
    name: "Opening Cash",
    lineItemType: "CASH",
    category: "CASH",
    dataType: "CURRENCY",
    summaryMethod: "LAST",
    moduleCode: "CASH",
    isEditable: true,
  },
  {
    code: "CLOSING_CASH",
    name: "Closing Cash",
    lineItemType: "CASH",
    category: "CASH",
    dataType: "CURRENCY",
    summaryMethod: "LAST",
    moduleCode: "CASH",
    isEditable: true,
  },
];

const GL_FIELD_BY_LINE: Record<string, string> = {
  UNITS: "GL_ACCOUNT.4100",
  PRICE: "GL_ACCOUNT.4110",
  GROSS_REVENUE: "GL_ACCOUNT.4000",
  NET_REVENUE: "GL_ACCOUNT.4010",
  COGS: "GL_ACCOUNT.5000",
  GROSS_PROFIT: "GL_ACCOUNT.5010",
  HEADCOUNT: "GL_ACCOUNT.6100",
  AVG_SALARY: "GL_ACCOUNT.6110",
  SALARIES: "GL_ACCOUNT.6120",
  RENT: "GL_ACCOUNT.6200",
  MARKETING: "GL_ACCOUNT.6300",
  EBITDA: "GL_ACCOUNT.7000",
  OPENING_CASH: "GL_ACCOUNT.1100",
  CLOSING_CASH: "GL_ACCOUNT.1101",
};

/** UNMAPPED on purpose for Detailed workspace demos */
const UNMAPPED_LINES = new Set(["DISCOUNTS", "GA"]);

type MonthValues = {
  units: number;
  price: number;
  grossRevenue: number;
  discounts: number;
  netRevenue: number;
  cogs: number;
  grossProfit: number;
  headcount: number;
  avgSalary: number;
  salaries: number;
  rent: number;
  marketing: number;
  ga: number;
  ebitda: number;
  openingCash: number;
  closingCash: number;
};

function computeMonthValues(
  m: number,
  opts: { unitsMul?: number; priceMul?: number; marketingMul?: number } = {}
): MonthValues {
  const unitsMul = opts.unitsMul ?? 1;
  const priceMul = opts.priceMul ?? 1;
  const marketingMul = opts.marketingMul ?? 1;

  const units = (1200 + m * 15 + SEASONALITY[m]) * unitsMul;
  const price = 185 * priceMul;
  const grossRevenue = units * price;
  const discounts = grossRevenue * 0.04;
  const netRevenue = grossRevenue - discounts;
  const cogs = netRevenue * 0.42;
  const grossProfit = netRevenue - cogs;
  const headcount = 48 + floor(m / 3);
  const avgSalary = 4200;
  const salaries = headcount * avgSalary;
  const rent = 28000;
  const q4Bump = m >= 9 ? 8000 + (m - 9) * 2000 : 0;
  const marketing = (12000 + q4Bump) * marketingMul;
  const ga = 15000;
  const ebitda = grossProfit - salaries - rent - marketing - ga;

  return {
    units,
    price,
    grossRevenue,
    discounts,
    netRevenue,
    cogs,
    grossProfit,
    headcount,
    avgSalary,
    salaries,
    rent,
    marketing,
    ga,
    ebitda,
    openingCash: 0,
    closingCash: 0,
  };
}

function withCashChain(months: MonthValues[]): MonthValues[] {
  let opening = 850000;
  return months.map((row) => {
    const closing = opening + row.ebitda;
    const next = { ...row, openingCash: opening, closingCash: closing };
    opening = closing;
    return next;
  });
}

async function resolveAdminUser() {
  const byEmail = await prisma.user.findUnique({
    where: { email: "admin@nts.com" },
    include: { role: true },
  });
  if (byEmail) return byEmail;

  const users = await prisma.user.findMany({
    include: { role: true },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  const privileged = users.find((u) => {
    const hay = `${u.role?.name ?? ""} ${u.roleCode ?? ""}`.toUpperCase();
    return (
      hay.includes("ADMIN") || hay.includes("CFO") || hay.includes("SYSADMIN")
    );
  });
  if (privileged) return privileged;
  if (users[0]) return users[0];
  throw new Error("No users found — cannot seed FP&A demo without an owner user");
}

async function resolveDepartments() {
  let depts = await prisma.department.findMany({
    where: { isActive: true },
    take: 3,
    orderBy: { name: "asc" },
  });
  if (depts.length > 0) return depts;

  try {
    const created = await prisma.department.create({
      data: {
        id: cuid(),
        name: "FP&A Demo Finance",
        description: "Seeded for FP&A client demo",
        isActive: true,
      },
    });
    console.log(`[seed-fpa] created minimal department ${created.name}`);
    return [created];
  } catch (err) {
    console.warn(
      `[seed-fpa] could not create department — skipping dept-scoped links: ${
        (err as Error).message
      }`
    );
    return [];
  }
}

async function resolveAccounts() {
  try {
    return await prisma.chartOfAccounts.findMany({
      where: { isActive: true },
      take: 15,
      orderBy: { accountNo: "asc" },
    });
  } catch (err) {
    console.warn(`[seed-fpa] chart accounts unavailable: ${(err as Error).message}`);
    return [];
  }
}

async function ensureDimensions() {
  const catalog = [
    {
      code: "REGION",
      name: "Region",
      dimensionType: "GEOGRAPHY",
      members: [
        { code: "ZW", name: "Zimbabwe", sortOrder: 1 },
        { code: "ZA", name: "South Africa", sortOrder: 2 },
        { code: "US", name: "United States", sortOrder: 3 },
      ],
    },
    {
      code: "PRODUCT",
      name: "Product",
      dimensionType: "PRODUCT",
      members: [
        { code: "EQUITY", name: "Equity", sortOrder: 1 },
        { code: "FIXED_INCOME", name: "Fixed Income", sortOrder: 2 },
        { code: "ALTERNATIVES", name: "Alternatives", sortOrder: 3 },
      ],
    },
    {
      code: "CHANNEL",
      name: "Channel",
      dimensionType: "CHANNEL",
      members: [
        { code: "DIRECT", name: "Direct", sortOrder: 1 },
        { code: "INTERMEDIARY", name: "Intermediary", sortOrder: 2 },
      ],
    },
  ];

  const existing = await prisma.planningDimension.count();
  if (existing === 0) {
    for (const dim of catalog) {
      const row = await prisma.planningDimension.create({
        data: {
          id: cuid(),
          code: dim.code,
          name: dim.name,
          dimensionType: dim.dimensionType,
        },
      });
      for (const m of dim.members) {
        await prisma.planningDimensionMember.create({
          data: {
            id: cuid(),
            dimensionId: row.id,
            code: m.code,
            name: m.name,
            sortOrder: m.sortOrder,
            isActive: true,
          },
        });
      }
    }
    console.log("[seed-fpa] created dimensions REGION / PRODUCT / CHANNEL");
  } else {
    console.log(`[seed-fpa] dimensions already present (${existing}) — leaving catalog`);
  }

  const dims = await prisma.planningDimension.findMany({
    include: { members: { orderBy: { sortOrder: "asc" } } },
  });
  return dims;
}

async function createManyBatched(
  label: string,
  rows: Record<string, unknown>[],
  batchSize: number,
  createBatch: (chunk: Record<string, unknown>[]) => Promise<unknown>
) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    await createBatch(chunk);
    inserted += chunk.length;
  }
  console.log(`[seed-fpa] ${label}: ${inserted} rows`);
}

async function seedPrimaryModel(adminId: string, depts: { id: string }[], accounts: { id: string }[], dims: Awaited<ReturnType<typeof ensureDimensions>>) {
  const now = new Date();
  const modelId = cuid();

  await prisma.planningModel.create({
    data: {
      id: modelId,
      name: "FY2026 Operating P&L",
      code: "FY2026_OPERATING_PL",
      modelType: "BUDGET",
      description:
        "Arcus Holdings primary operating P&L for FY2026 — Model Builder / Planning / Budgeting demo",
      ownerUserId: adminId,
      baseCurrency: "USD",
      startPeriod: monthDate(2026, 0),
      endPeriod: monthDate(2026, 11),
      timeGranularity: "MONTHLY",
      status: "DRAFT",
      baselineMode: "NONE",
      createdById: adminId,
      updatedById: adminId,
    },
  });

  const moduleIds: Record<string, string> = {};
  for (const mod of PRIMARY_MODULES) {
    const id = cuid();
    moduleIds[mod.code] = id;
    await prisma.planningModule.create({
      data: {
        id,
        modelId,
        code: mod.code,
        name: mod.name,
        calcOrder: mod.calcOrder,
        sortOrder: mod.sortOrder,
        status: "ACTIVE",
      },
    });
  }

  const lineIds: Record<string, string> = {};
  let sort = 10;
  for (const line of PRIMARY_LINES) {
    const id = cuid();
    lineIds[line.code] = id;
    await prisma.planningLineItem.create({
      data: {
        id,
        modelId,
        moduleId: moduleIds[line.moduleCode],
        code: line.code,
        name: line.name,
        lineItemType: line.lineItemType,
        category: line.category,
        dataType: line.dataType,
        summaryMethod: line.summaryMethod,
        currencyCode: line.dataType === "CURRENCY" ? "USD" : null,
        isEditable: line.isEditable,
        sortOrder: sort,
        updatedById: adminId,
      },
    });
    sort += 10;
  }

  const formulaIds: Record<string, string> = {};
  for (const line of PRIMARY_LINES) {
    if (!line.expression) continue;
    const id = cuid();
    formulaIds[line.code] = id;
    await prisma.planningFormula.create({
      data: {
        id,
        modelId,
        lineItemId: lineIds[line.code],
        expression: line.expression,
        isValid: true,
        createdById: adminId,
      },
    });
  }

  for (const line of PRIMARY_LINES) {
    if (!line.dependsOn?.length || !formulaIds[line.code]) continue;
    for (const depCode of line.dependsOn) {
      if (!formulaIds[depCode]) continue;
      await prisma.planningFormulaDependency.create({
        data: {
          id: cuid(),
          formulaId: formulaIds[line.code],
          dependsOnFormulaId: formulaIds[depCode],
        },
      });
    }
  }

  const scenarioDefs = LITE
    ? [
        { key: "BASE", name: "Base Case", scenarioType: "BASE", isOfficial: true },
        { key: "UPSIDE", name: "Upside", scenarioType: "UPSIDE", isOfficial: false },
      ]
    : [
        { key: "BASE", name: "Base Case", scenarioType: "BASE", isOfficial: true },
        { key: "UPSIDE", name: "Upside", scenarioType: "UPSIDE", isOfficial: false },
        { key: "DOWNSIDE", name: "Downside", scenarioType: "DOWNSIDE", isOfficial: false },
      ];

  const scenarioIds: Record<string, string> = {};
  for (const s of scenarioDefs) {
    const id = cuid();
    scenarioIds[s.key] = id;
    await prisma.planningScenario.create({
      data: {
        id,
        modelId,
        name: s.name,
        scenarioType: s.scenarioType,
        description: `${s.name} for Arcus FY2026 Operating P&L`,
        isOfficial: s.isOfficial,
        status: "ACTIVE",
        createdById: adminId,
      },
    });
  }

  const publishedVersionId = cuid();
  const workingVersionId = cuid();
  await prisma.planningVersion.create({
    data: {
      id: publishedVersionId,
      modelId,
      name: "FY2026 v1 Published",
      status: "LOCKED",
      lockedAt: now,
      lockedById: adminId,
      publishedAt: now,
      publishedById: adminId,
      publishNotes: "Arcus Holdings FY2026 board-ready published cut",
      createdById: adminId,
    },
  });
  await prisma.planningVersion.create({
    data: {
      id: workingVersionId,
      modelId,
      name: "FY2026 v1 Working",
      status: "DRAFT",
      createdById: adminId,
    },
  });

  await prisma.planningModel.update({
    where: { id: modelId },
    data: {
      status: "PUBLISHED",
      publishedAt: now,
      publishedById: adminId,
      updatedById: adminId,
    },
  });

  // Scope: departments, accounts, dimensions
  for (const dept of depts.slice(0, LITE ? 1 : 2)) {
    await prisma.planningModelDepartment.create({
      data: { id: cuid(), modelId, departmentId: dept.id },
    });
  }
  for (const acct of accounts.slice(0, LITE ? 4 : 8)) {
    await prisma.planningModelAccount.create({
      data: { id: cuid(), modelId, accountId: acct.id },
    });
  }

  const region = dims.find((d) => d.code === "REGION");
  const product = dims.find((d) => d.code === "PRODUCT");
  for (const dim of [region, product].filter(Boolean)) {
    await prisma.planningModelDimension.create({
      data: { id: cuid(), modelId, dimensionId: dim!.id },
    });
    for (const mem of dim!.members.slice(0, 3)) {
      await prisma.planningModelDimensionMember.create({
        data: {
          id: cuid(),
          modelId,
          dimensionId: dim!.id,
          memberId: mem.id,
        },
      });
    }
  }

  const scenarioOpts: Record<string, { unitsMul?: number; priceMul?: number; marketingMul?: number }> = {
    BASE: {},
    UPSIDE: { unitsMul: 1.1, priceMul: 1.02 },
    DOWNSIDE: { unitsMul: 0.9, marketingMul: 0.85 },
  };

  const cellRows: Record<string, unknown>[] = [];
  const driverRows: Record<string, unknown>[] = [];
  // Lite: full grid on working copy only; published keeps BASE so sheets stay light.
  const versions = LITE
    ? [
        { id: publishedVersionId, locked: true, scenarios: ["BASE"] },
        { id: workingVersionId, locked: false, scenarios: Object.keys(scenarioIds) },
      ]
    : [
        { id: publishedVersionId, locked: true, scenarios: Object.keys(scenarioIds) },
        { id: workingVersionId, locked: false, scenarios: Object.keys(scenarioIds) },
      ];

  for (const ver of versions) {
    for (const scenarioKey of ver.scenarios) {
      const scenarioId = scenarioIds[scenarioKey];
      if (!scenarioId) continue;
      const months = withCashChain(
        Array.from({ length: 12 }, (_, m) => computeMonthValues(m, scenarioOpts[scenarioKey] || {}))
      );

      for (let m = 0; m < 12; m++) {
        const v = months[m];
        const periodDate = monthDate(2026, m);
        const byCode: Record<string, { value: number; calc: boolean }> = {
          UNITS: { value: v.units, calc: false },
          PRICE: { value: v.price, calc: false },
          GROSS_REVENUE: { value: v.grossRevenue, calc: true },
          DISCOUNTS: { value: v.discounts, calc: false },
          NET_REVENUE: { value: v.netRevenue, calc: true },
          COGS: { value: v.cogs, calc: false },
          GROSS_PROFIT: { value: v.grossProfit, calc: true },
          HEADCOUNT: { value: v.headcount, calc: false },
          AVG_SALARY: { value: v.avgSalary, calc: false },
          SALARIES: { value: v.salaries, calc: true },
          RENT: { value: v.rent, calc: false },
          MARKETING: { value: v.marketing, calc: false },
          GA: { value: v.ga, calc: false },
          EBITDA: { value: v.ebitda, calc: true },
          OPENING_CASH: { value: v.openingCash, calc: false },
          CLOSING_CASH: { value: v.closingCash, calc: false },
        };

        for (const [code, cell] of Object.entries(byCode)) {
          cellRows.push({
            id: cuid(),
            modelId,
            scenarioId,
            versionId: ver.id,
            lineItemId: lineIds[code],
            periodDate,
            currencyCode: "USD",
            value: d(cell.value),
            valueType: "MANUAL",
            sourceType: cell.calc ? "FORMULA" : "INPUT",
            isEditable: !cell.calc,
            isLocked: ver.locked,
            formulaId: cell.calc ? formulaIds[code] ?? null : null,
            lastUpdatedById: adminId,
            lastUpdatedAt: now,
            lastCalculatedAt: cell.calc ? now : null,
            recordVersion: 1n,
          });
        }

        if (scenarioKey === "BASE" && !ver.locked) {
          driverRows.push({
            id: cuid(),
            modelId,
            scenarioId,
            versionId: ver.id,
            code: "HEADCOUNT",
            name: "Headcount",
            category: "WORKFORCE",
            periodDate,
            value: d(v.headcount),
            unit: "FTE",
            createdById: adminId,
          });
          driverRows.push({
            id: cuid(),
            modelId,
            scenarioId,
            versionId: ver.id,
            code: "PRICE",
            name: "Average Price",
            category: "REVENUE",
            periodDate,
            value: d(v.price),
            unit: "USD",
            createdById: adminId,
          });
        }
      }
    }
  }

  await createManyBatched("planning_cells (primary)", cellRows, 500, (chunk) =>
    prisma.planningCell.createMany({ data: chunk as never, skipDuplicates: true })
  );
  await createManyBatched("planning_drivers (primary)", driverRows, 500, (chunk) =>
    prisma.planningDriver.createMany({ data: chunk as never, skipDuplicates: true })
  );

  // Data mappings (Detailed workspace)
  const dataSourceId = cuid();
  await prisma.planningDataSource.create({
    data: {
      id: dataSourceId,
      modelId,
      systemCode: "NETSUITE_GL",
      name: "NetSuite GL",
      connectorConfig: { system: "NetSuite", ledger: "Arcus Holdings USD" },
    },
  });

  let mappedCount = 0;
  let unmappedCount = 0;
  for (const line of PRIMARY_LINES) {
    const fieldKey = GL_FIELD_BY_LINE[line.code] ?? `GL_ACCOUNT.${line.code}`;
    const fieldId = cuid();
    await prisma.planningSourceField.create({
      data: {
        id: fieldId,
        dataSourceId,
        fieldKey,
        dataType: line.dataType === "NUMBER" ? "NUMBER" : "CURRENCY",
      },
    });
    const unmapped = UNMAPPED_LINES.has(line.code);
    await prisma.planningLineItemMapping.create({
      data: {
        id: cuid(),
        modelId,
        sourceFieldId: fieldId,
        lineItemId: unmapped ? null : lineIds[line.code],
        moduleId: moduleIds[line.moduleCode],
        status: unmapped ? "UNMAPPED" : "MAPPED",
        mappedAt: unmapped ? null : now,
        mappedById: unmapped ? null : adminId,
      },
    });
    if (unmapped) unmappedCount += 1;
    else mappedCount += 1;
  }

  // Audit samples
  const sampleCell = await prisma.planningCell.findFirst({
    where: { modelId, versionId: workingVersionId, scenarioId: scenarioIds.BASE },
  });
  const audits = [
    {
      actionType: "MODEL_CREATE",
      entityType: "MODEL",
      newValue: "FY2026 Operating P&L",
      moduleId: null as string | null,
      lineItemId: null as string | null,
      cellId: null as string | null,
      versionId: null as string | null,
      scenarioId: null as string | null,
    },
    {
      actionType: "MODULE_CREATED",
      entityType: "MODULE",
      newValue: "REVENUE",
      moduleId: moduleIds.REVENUE,
      lineItemId: null,
      cellId: null,
      versionId: null,
      scenarioId: null,
    },
    {
      actionType: "CELL_UPDATE",
      entityType: "CELL",
      newValue: sampleCell ? String(sampleCell.value) : "1200",
      oldValue: "0",
      moduleId: moduleIds.REVENUE,
      lineItemId: lineIds.UNITS,
      cellId: sampleCell?.id ?? null,
      versionId: workingVersionId,
      scenarioId: scenarioIds.BASE,
    },
    {
      actionType: "VERSION_PUBLISHED",
      entityType: "VERSION",
      newValue: "FY2026 v1 Published",
      moduleId: null,
      lineItemId: null,
      cellId: null,
      versionId: publishedVersionId,
      scenarioId: scenarioIds.BASE,
    },
  ];
  for (const a of audits) {
    await prisma.planningAuditLog.create({
      data: {
        id: cuid(),
        modelId,
        scenarioId: a.scenarioId,
        versionId: a.versionId,
        cellId: a.cellId,
        lineItemId: a.lineItemId,
        moduleId: a.moduleId,
        entityType: a.entityType,
        userId: adminId,
        actionType: a.actionType,
        oldValue: a.oldValue ?? null,
        newValue: a.newValue,
        reason: "Arcus demo seed",
      },
    });
  }

  return {
    modelId,
    publishedVersionId,
    workingVersionId,
    scenarioIds,
    moduleIds,
    lineIds,
    mappingSummary: { mappedCount, unmappedCount, dataSourceId, systemCode: "NETSUITE_GL" },
  };
}

async function seedBoardPackModel(adminId: string) {
  const now = new Date();
  const modelId = cuid();
  await prisma.planningModel.create({
    data: {
      id: modelId,
      name: "FY2026 Board Pack Model",
      code: "FY2026_BOARD_PACK",
      modelType: "BUDGET",
      description: "Simplified archived board pack cut for FY2026",
      ownerUserId: adminId,
      baseCurrency: "USD",
      startPeriod: monthDate(2026, 0),
      endPeriod: monthDate(2026, 11),
      timeGranularity: "MONTHLY",
      status: "ARCHIVED",
      publishedAt: now,
      publishedById: adminId,
      createdById: adminId,
      updatedById: adminId,
    },
  });

  const moduleId = cuid();
  await prisma.planningModule.create({
    data: {
      id: moduleId,
      modelId,
      code: "SUMMARY",
      name: "Board Summary",
      calcOrder: 10,
      sortOrder: 10,
      status: "ACTIVE",
    },
  });

  const lines = [
    { code: "REVENUE", name: "Revenue", type: "REVENUE", expr: null as string | null },
    { code: "COGS", name: "COGS", type: "EXPENSE", expr: null },
    {
      code: "GROSS_PROFIT",
      name: "Gross Profit",
      type: "CALC",
      expr: "LINE('REVENUE')-LINE('COGS')",
    },
    {
      code: "EBITDA",
      name: "EBITDA",
      type: "CALC",
      expr: "LINE('GROSS_PROFIT')*0.65",
    },
  ];
  const lineIds: Record<string, string> = {};
  let sort = 10;
  for (const l of lines) {
    const id = cuid();
    lineIds[l.code] = id;
    await prisma.planningLineItem.create({
      data: {
        id,
        modelId,
        moduleId,
        code: l.code,
        name: l.name,
        lineItemType: l.type,
        category: l.type === "EXPENSE" ? "EXPENSE" : "REVENUE",
        dataType: "CURRENCY",
        summaryMethod: "SUM",
        currencyCode: "USD",
        isEditable: !l.expr,
        sortOrder: sort,
        updatedById: adminId,
      },
    });
    sort += 10;
  }

  const formulaIds: Record<string, string> = {};
  for (const l of lines) {
    if (!l.expr) continue;
    const id = cuid();
    formulaIds[l.code] = id;
    await prisma.planningFormula.create({
      data: {
        id,
        modelId,
        lineItemId: lineIds[l.code],
        expression: l.expr,
        isValid: true,
        createdById: adminId,
      },
    });
  }
  if (formulaIds.GROSS_PROFIT && formulaIds.EBITDA) {
    await prisma.planningFormulaDependency.create({
      data: {
        id: cuid(),
        formulaId: formulaIds.EBITDA,
        dependsOnFormulaId: formulaIds.GROSS_PROFIT,
      },
    });
  }

  const scenarioId = cuid();
  await prisma.planningScenario.create({
    data: {
      id: scenarioId,
      modelId,
      name: "Base Case",
      scenarioType: "BASE",
      isOfficial: true,
      status: "ACTIVE",
      createdById: adminId,
    },
  });

  const versionId = cuid();
  await prisma.planningVersion.create({
    data: {
      id: versionId,
      modelId,
      name: "Board Pack Locked",
      status: "LOCKED",
      lockedAt: now,
      lockedById: adminId,
      publishedAt: now,
      publishedById: adminId,
      createdById: adminId,
    },
  });

  const cellRows: Record<string, unknown>[] = [];
  for (let m = 0; m < 12; m++) {
    const base = computeMonthValues(m);
    const revenue = base.netRevenue;
    const cogs = base.cogs;
    const gp = revenue - cogs;
    const ebitda = gp * 0.65;
    const periodDate = monthDate(2026, m);
    const vals: Record<string, { value: number; calc: boolean }> = {
      REVENUE: { value: revenue, calc: false },
      COGS: { value: cogs, calc: false },
      GROSS_PROFIT: { value: gp, calc: true },
      EBITDA: { value: ebitda, calc: true },
    };
    for (const [code, cell] of Object.entries(vals)) {
      cellRows.push({
        id: cuid(),
        modelId,
        scenarioId,
        versionId,
        lineItemId: lineIds[code],
        periodDate,
        currencyCode: "USD",
        value: d(cell.value),
        valueType: "MANUAL",
        sourceType: cell.calc ? "FORMULA" : "INPUT",
        isEditable: !cell.calc,
        isLocked: true,
        formulaId: cell.calc ? formulaIds[code] ?? null : null,
        lastUpdatedById: adminId,
        lastUpdatedAt: now,
        recordVersion: 1n,
      });
    }
  }
  await createManyBatched("planning_cells (board pack)", cellRows, 500, (chunk) =>
    prisma.planningCell.createMany({ data: chunk as never, skipDuplicates: true })
  );

  return { modelId, versionId, scenarioId };
}

async function seedDraft2027Model(adminId: string) {
  const modelId = cuid();
  await prisma.planningModel.create({
    data: {
      id: modelId,
      name: "FY2027 Draft Structure",
      code: "FY2027_DRAFT",
      modelType: "BUDGET",
      description: "Early FY2027 draft — Revenue + Opex skeleton only",
      ownerUserId: adminId,
      baseCurrency: "USD",
      startPeriod: monthDate(2027, 0),
      endPeriod: monthDate(2027, 11),
      timeGranularity: "MONTHLY",
      status: "DRAFT",
      createdById: adminId,
      updatedById: adminId,
    },
  });

  const revMod = cuid();
  const opexMod = cuid();
  await prisma.planningModule.createMany({
    data: [
      {
        id: revMod,
        modelId,
        code: "REVENUE",
        name: "Revenue",
        calcOrder: 10,
        sortOrder: 10,
        status: "DRAFT",
      },
      {
        id: opexMod,
        modelId,
        code: "OPEX",
        name: "Operating Expenses",
        calcOrder: 20,
        sortOrder: 20,
        status: "DRAFT",
      },
    ],
  });

  const lineDefs = [
    { code: "NET_REVENUE", name: "Net Revenue", moduleId: revMod, type: "REVENUE", editable: true },
    { code: "MARKETING", name: "Marketing", moduleId: opexMod, type: "EXPENSE", editable: true },
    { code: "GA", name: "G&A", moduleId: opexMod, type: "EXPENSE", editable: true },
  ];
  const lineIds: Record<string, string> = {};
  let sort = 10;
  for (const l of lineDefs) {
    const id = cuid();
    lineIds[l.code] = id;
    await prisma.planningLineItem.create({
      data: {
        id,
        modelId,
        moduleId: l.moduleId,
        code: l.code,
        name: l.name,
        lineItemType: l.type,
        category: l.type === "EXPENSE" ? "EXPENSE" : "REVENUE",
        dataType: "CURRENCY",
        summaryMethod: "SUM",
        currencyCode: "USD",
        isEditable: l.editable,
        sortOrder: sort,
        updatedById: adminId,
      },
    });
    sort += 10;
  }

  const scenarioId = cuid();
  await prisma.planningScenario.create({
    data: {
      id: scenarioId,
      modelId,
      name: "Base Case",
      scenarioType: "BASE",
      isOfficial: true,
      status: "DRAFT",
      createdById: adminId,
    },
  });

  const versionId = cuid();
  await prisma.planningVersion.create({
    data: {
      id: versionId,
      modelId,
      name: "FY2027 Draft v0",
      status: "DRAFT",
      createdById: adminId,
    },
  });

  // Sparse cells — Q1 only (Jan–Mar)
  const cellRows: Record<string, unknown>[] = [];
  const now = new Date();
  for (let m = 0; m < 3; m++) {
    const base = computeMonthValues(m);
    const periodDate = monthDate(2027, m);
    const vals = {
      NET_REVENUE: base.netRevenue * 1.05,
      MARKETING: base.marketing,
      GA: 15000,
    };
    for (const [code, value] of Object.entries(vals)) {
      cellRows.push({
        id: cuid(),
        modelId,
        scenarioId,
        versionId,
        lineItemId: lineIds[code],
        periodDate,
        currencyCode: "USD",
        value: d(value),
        valueType: "MANUAL",
        sourceType: "INPUT",
        isEditable: true,
        isLocked: false,
        lastUpdatedById: adminId,
        lastUpdatedAt: now,
        recordVersion: 1n,
      });
    }
  }
  await createManyBatched("planning_cells (fy2027 draft)", cellRows, 500, (chunk) =>
    prisma.planningCell.createMany({ data: chunk as never, skipDuplicates: true })
  );

  return { modelId, versionId, scenarioId };
}

async function seedBudgetCycles(
  adminId: string,
  primary: Awaited<ReturnType<typeof seedPrimaryModel>>,
  depts: { id: string; name?: string }[]
) {
  const cycleIds: Record<string, string> = {};
  const now = new Date();

  // Dedicated historical version so closed FY2025 is NOT bound to the FY2026 LOCKED publish.
  // Otherwise Planning sheets that resolve cycle-by-version land on the wrong worksheet.
  const fy2025VersionId = cuid();
  await prisma.planningVersion.create({
    data: {
      id: fy2025VersionId,
      modelId: primary.modelId,
      name: "FY2025 Final (Locked)",
      status: "LOCKED",
      lockedAt: new Date("2024-12-20T00:00:00.000Z"),
      lockedById: adminId,
      publishedAt: new Date("2024-12-15T00:00:00.000Z"),
      publishedById: adminId,
      publishNotes: "Historical closed FY2025 budget book",
      createdById: adminId,
    },
  });

  const fy2025Lines = await prisma.planningLineItem.findMany({
    where: { modelId: primary.modelId },
    select: { id: true, code: true, lineItemType: true },
  });
  const fy2025Cells: Record<string, unknown>[] = [];
  const months = withCashChain(Array.from({ length: 12 }, (_, m) => computeMonthValues(m)));
  const byCodeVal = (m: number) => {
    const v = months[m];
    return {
      UNITS: v.units,
      PRICE: v.price,
      GROSS_REVENUE: v.grossRevenue,
      DISCOUNTS: v.discounts,
      NET_REVENUE: v.netRevenue,
      COGS: v.cogs,
      GROSS_PROFIT: v.grossProfit,
      HEADCOUNT: v.headcount,
      AVG_SALARY: v.avgSalary,
      SALARIES: v.salaries,
      RENT: v.rent,
      MARKETING: v.marketing,
      GA: v.ga,
      EBITDA: v.ebitda,
      OPENING_CASH: v.openingCash,
      CLOSING_CASH: v.closingCash,
    } as Record<string, number>;
  };
  for (let m = 0; m < 12; m++) {
    // Lite: only Jan/Apr/Jul/Oct so closed book is visible without flooding grids
    if (LITE && ![0, 3, 6, 9].includes(m)) continue;
    const vals = byCodeVal(m);
    const periodDate = monthDate(2025, m);
    for (const li of fy2025Lines) {
      if (vals[li.code] == null) continue;
      const calc = ["CALC", "CALCULATED"].includes(String(li.lineItemType).toUpperCase());
      fy2025Cells.push({
        id: cuid(),
        modelId: primary.modelId,
        scenarioId: primary.scenarioIds.BASE,
        versionId: fy2025VersionId,
        lineItemId: li.id,
        periodDate,
        currencyCode: "USD",
        value: d(vals[li.code] * 0.88),
        valueType: "MANUAL",
        sourceType: calc ? "FORMULA" : "INPUT",
        isEditable: !calc,
        isLocked: true,
        lastUpdatedById: adminId,
        lastUpdatedAt: now,
        recordVersion: 1n,
      });
    }
  }
  await createManyBatched("planning_cells (fy2025 closed)", fy2025Cells, 500, (chunk) =>
    prisma.planningCell.createMany({ data: chunk as never, skipDuplicates: true })
  );

  const ownerCategorySets: string[][] = [
    ["REVENUE", "OPERATING_EXPENSES"],
    ["PAYROLL"],
    ["OPERATING_EXPENSES"],
  ];

  const cycleDefsAll = [
    {
      key: "FY2025 Annual Budget (Closed)",
      name: "FY2025 Annual Budget (Closed)",
      fiscalYear: 2025,
      status: "LOCKED",
      currentStage: "LOCK",
      planningType: "ANNUAL_BUDGET",
      versionId: fy2025VersionId,
      scenarioId: primary.scenarioIds.BASE,
      openedAt: new Date("2024-09-01T00:00:00.000Z"),
      approvedAt: new Date("2024-12-15T00:00:00.000Z"),
      lockedAt: new Date("2024-12-20T00:00:00.000Z"),
      startDate: monthDate(2025, 0),
      endDate: monthDate(2025, 11),
      submissionDeadline: new Date("2024-11-30T00:00:00.000Z"),
      ownerStatuses: ["APPROVED", "APPROVED", "APPROVED"] as string[],
      taskStatuses: ["APPROVED", "APPROVED", "APPROVED"] as string[],
      workflowStage: "LOCKED",
    },
    {
      key: "FY2026 Annual Budget — Open",
      name: "FY2026 Annual Budget — Open",
      fiscalYear: 2026,
      status: "OPEN_FOR_INPUT",
      currentStage: "OWNER_INPUT",
      planningType: "ANNUAL_BUDGET",
      versionId: primary.workingVersionId,
      scenarioId: primary.scenarioIds.BASE,
      openedAt: new Date("2025-09-01T00:00:00.000Z"),
      approvedAt: null as Date | null,
      lockedAt: null as Date | null,
      startDate: monthDate(2026, 0),
      endDate: monthDate(2026, 11),
      submissionDeadline: new Date("2025-11-15T00:00:00.000Z"),
      ownerStatuses: ["PENDING", "SUBMITTED", "RETURNED"],
      taskStatuses: ["PENDING", "SUBMITTED", "RETURNED"],
      workflowStage: "DEPARTMENT_INPUT",
    },
    {
      key: "FY2026 Mid-Year — Returned",
      name: "FY2026 Mid-Year — Returned",
      fiscalYear: 2026,
      status: "RETURNED_FOR_CORRECTION",
      currentStage: "FPA_REVIEW",
      planningType: "REFORECAST",
      versionId: primary.workingVersionId,
      scenarioId: primary.scenarioIds.BASE,
      openedAt: new Date("2026-06-01T00:00:00.000Z"),
      approvedAt: null,
      lockedAt: null,
      startDate: monthDate(2026, 6),
      endDate: monthDate(2026, 11),
      submissionDeadline: new Date("2026-07-15T00:00:00.000Z"),
      ownerStatuses: ["RETURNED", "SUBMITTED", "PENDING"],
      taskStatuses: ["RETURNED", "SUBMITTED", "PENDING"],
      workflowStage: "FPA_REVIEW",
    },
    {
      key: "FY2026 Board Review",
      name: "FY2026 Board Review",
      fiscalYear: 2026,
      status: "PENDING_CFO_REVIEW",
      currentStage: "CFO_REVIEW",
      planningType: "ANNUAL_BUDGET",
      versionId: primary.publishedVersionId,
      scenarioId: primary.scenarioIds.BASE,
      openedAt: new Date("2025-11-01T00:00:00.000Z"),
      approvedAt: null,
      lockedAt: null,
      startDate: monthDate(2026, 0),
      endDate: monthDate(2026, 11),
      submissionDeadline: new Date("2025-12-01T00:00:00.000Z"),
      ownerStatuses: ["APPROVED", "APPROVED", "SUBMITTED"],
      taskStatuses: ["APPROVED", "APPROVED", "SUBMITTED"],
      workflowStage: "CFO_APPROVAL",
    },
  ];

  // Lite: Open + Closed only (2 cards) so budgeting lists stay short
  const cycleDefs = LITE
    ? cycleDefsAll.filter((c) =>
        ["FY2025 Annual Budget (Closed)", "FY2026 Annual Budget — Open"].includes(c.key)
      )
    : cycleDefsAll;

  for (const def of cycleDefs) {
    const workflowId = cuid();
    await prisma.planningWorkflow.create({
      data: {
        id: workflowId,
        modelId: primary.modelId,
        name: `${def.name} Workflow`,
        workflowType: "BUDGET",
        stage: def.workflowStage,
        status: def.status === "LOCKED" ? "COMPLETED" : "ACTIVE",
        startDate: def.startDate,
        endDate: def.endDate,
        createdById: adminId,
      },
    });

    const cycleId = cuid();
    cycleIds[def.key] = cycleId;
    await prisma.planningBudgetCycle.create({
      data: {
        id: cycleId,
        name: def.name,
        modelId: primary.modelId,
        versionId: def.versionId,
        scenarioId: def.scenarioId,
        workflowId,
        fiscalYear: def.fiscalYear,
        planningType: def.planningType,
        status: def.status,
        currentStage: def.currentStage,
        startDate: def.startDate,
        endDate: def.endDate,
        submissionDeadline: def.submissionDeadline,
        baseCurrency: "USD",
        cycleOwnerId: adminId,
        openedAt: def.openedAt,
        approvedAt: def.approvedAt,
        approvedById: def.approvedAt ? adminId : null,
        lockedAt: def.lockedAt,
        lockedById: def.lockedAt ? adminId : null,
        fpaReviewAt: def.currentStage === "FPA_REVIEW" ? now : null,
        cfoReviewAt: def.currentStage === "CFO_REVIEW" ? now : null,
        createdById: adminId,
      },
    });

    const taskTitles = [
      "Revenue input — Finance",
      "Workforce input — HR",
      "Opex input — Operations",
    ];
    const ownerDepts = depts.slice(0, LITE ? 2 : 3);
    const taskIds: string[] = [];

    for (let i = 0; i < Math.max(ownerDepts.length, 1); i++) {
      const dept = ownerDepts[i];
      const taskId = cuid();
      taskIds.push(taskId);
      await prisma.planningTask.create({
        data: {
          id: taskId,
          workflowId,
          title: taskTitles[i] ?? `Budget input — Dept ${i + 1}`,
          departmentId: dept?.id ?? null,
          assigneeId: adminId,
          status: def.taskStatuses[i] ?? "PENDING",
          priority: i === 0 ? "HIGH" : "NORMAL",
          dueDate: def.submissionDeadline,
          submittedAt:
            (def.taskStatuses[i] ?? "") === "PENDING"
              ? null
              : new Date(def.submissionDeadline.getTime() - 3 * 86400000),
          changeNotes:
            (def.taskStatuses[i] ?? "") === "RETURNED"
              ? "Please revise marketing phasing for Q4"
              : null,
        },
      });

      if (dept) {
        await prisma.planningBudgetCycleOwner.create({
          data: {
            id: cuid(),
            cycleId,
            departmentId: dept.id,
            assigneeId: adminId,
            taskId,
            categoriesJson: ownerCategorySets[i] ?? ["REVENUE", "OPERATING_EXPENSES"],
            baselineMethod: "PRIOR_YEAR_BUDGET",
            status: def.ownerStatuses[i] ?? "PENDING",
          },
        });
      }
    }

    if (taskIds[0]) {
      await prisma.planningApproval.create({
        data: {
          id: cuid(),
          workflowId,
          taskId: taskIds[0],
          actorId: adminId,
          action: def.status === "RETURNED_FOR_CORRECTION" ? "RETURN" : "APPROVE",
          comment:
            def.status === "RETURNED_FOR_CORRECTION"
              ? "Returned — tighten headcount ramp and marketing ROI notes"
              : "Looks coherent with Arcus FY plan assumptions",
        },
      });
    }
    if (taskIds[1] && def.status !== "OPEN_FOR_INPUT") {
      await prisma.planningApproval.create({
        data: {
          id: cuid(),
          workflowId,
          taskId: taskIds[1],
          actorId: adminId,
          action: "APPROVE",
          comment: "Workforce plan accepted",
        },
      });
    }

    if (def.status === "OPEN_FOR_INPUT" || def.status === "RETURNED_FOR_CORRECTION") {
      await prisma.planningComment.create({
        data: {
          id: cuid(),
          modelId: primary.modelId,
          cycleId,
          taskId: taskIds[0] ?? null,
          visibility: "ALL",
          body:
            def.status === "RETURNED_FOR_CORRECTION"
              ? "FP&A: please re-submit marketing after Q4 campaign lock."
              : "Reminder: submit Revenue input by the deadline.",
          status: "OPEN",
          createdById: adminId,
        },
      });
    }
  }

  return cycleIds;
}

async function seedModelPlanningCycles(
  adminId: string,
  primary: Awaited<ReturnType<typeof seedPrimaryModel>>
) {
  const cycleIds: Record<string, string> = {};
  const defs = LITE
    ? [
        {
          key: "FY2026 Annual Budget Planning",
          name: "FY2026 Annual Budget Planning",
          financialYear: 2026,
          planningType: "ANNUAL_BUDGET",
          status: "OPEN",
        },
      ]
    : [
        {
          key: "FY2026 Annual Budget Planning",
          name: "FY2026 Annual Budget Planning",
          financialYear: 2026,
          planningType: "ANNUAL_BUDGET",
          status: "OPEN",
        },
        {
          key: "FY2026 Rolling Forecast Q2",
          name: "FY2026 Rolling Forecast Q2",
          financialYear: 2026,
          planningType: "ROLLING_FORECAST",
          status: "DRAFT",
        },
        {
          key: "FY2027 Long Range Plan",
          name: "FY2027 Long Range Plan",
          financialYear: 2027,
          planningType: "LONG_RANGE_PLAN",
          status: "DRAFT",
        },
      ];

  for (const def of defs) {
    const existing = await prisma.modelPlanningCycle.findFirst({
      where: { name: def.name, sourceModelId: primary.modelId },
      select: { id: true },
    });
    if (existing) {
      cycleIds[def.key] = existing.id;
      continue;
    }

    const id = cuid();
    cycleIds[def.key] = id;
    await prisma.modelPlanningCycle.create({
      data: {
        id,
        name: def.name,
        financialYear: def.financialYear,
        planningType: def.planningType,
        sourceModelId: primary.modelId,
        sourceModelVersionId: primary.publishedVersionId,
        actualsCutoffPeriod: monthDate(2025, 11),
        forecastStartPeriod: monthDate(2026, 0),
        planningHorizon: 12,
        baseScenarioId: primary.scenarioIds.BASE,
        submissionDeadline: new Date("2026-02-28T00:00:00.000Z"),
        planningOwnerId: adminId,
        status: def.status,
        createdById: adminId,
        updatedById: adminId,
      },
    });
  }

  return cycleIds;
}

async function main() {
  const url = process.env.DATABASE_URL || "";
  if (!url) throw new Error("DATABASE_URL is required");
  assertSafeDatabaseUrl(url);

  const dbName = (await prisma.$queryRawUnsafe<Array<{ d: string }>>(`SELECT DATABASE() AS d`))[0]
    ?.d;
  console.log(`[seed-fpa] database=${dbName} lite=${LITE}`);
  console.log("[seed-fpa] wipe is NOT performed — ensure clear-fpa-planning-data ran if needed");

  const admin = await resolveAdminUser();
  console.log(`[seed-fpa] admin user=${admin.email} (${admin.id})`);

  const depts = await resolveDepartments();
  console.log(`[seed-fpa] departments=${depts.length}`);

  const accounts = await resolveAccounts();
  console.log(`[seed-fpa] chart accounts=${accounts.length}`);

  const dims = await ensureDimensions();

  const primary = await seedPrimaryModel(admin.id, depts, accounts, dims);
  console.log(`[seed-fpa] primary model=${primary.modelId}`);

  let boardPackModelId: string | null = null;
  let draft2027ModelId: string | null = null;
  if (!LITE) {
    const board = await seedBoardPackModel(admin.id);
    boardPackModelId = board.modelId;
    console.log(`[seed-fpa] board pack model=${board.modelId}`);

    const draft2027 = await seedDraft2027Model(admin.id);
    draft2027ModelId = draft2027.modelId;
    console.log(`[seed-fpa] fy2027 draft model=${draft2027.modelId}`);
  } else {
    console.log("[seed-fpa] lite: skipping Board Pack + FY2027 draft models");
  }

  const cycleIds = await seedBudgetCycles(admin.id, primary, depts);
  console.log(`[seed-fpa] budget cycles=${Object.keys(cycleIds).length}`);

  const modelPlanningCycleIds = await seedModelPlanningCycles(admin.id, primary);
  console.log(`[seed-fpa] model planning cycles=${Object.keys(modelPlanningCycleIds).length}`);

  const summary = {
    lite: LITE,
    primaryModelId: primary.modelId,
    publishedVersionId: primary.publishedVersionId,
    workingVersionId: primary.workingVersionId,
    scenarioIds: primary.scenarioIds,
    moduleIds: primary.moduleIds,
    boardPackModelId,
    draft2027ModelId,
    cycleIds,
    modelPlanningCycleIds,
    mappingSummary: primary.mappingSummary,
  };

  console.log("[seed-fpa] SUMMARY");
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((err) => {
    console.error("[seed-fpa] FAILED", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
