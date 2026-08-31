// @ts-nocheck
/**
 * Builds the Arcus Group FY2026 presentation dataset after a complete FP&A reset.
 *
 * Run only against the empty DEV nts planning schema.
 * Shared users, departments, entities, and chart accounts are read but never changed.
 */
import "dotenv/config";
import { randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";
import { assertDevDatabase } from "./lib/assert-dev-database";

if (process.env.DATABASE_URL) {
  const seedDatabaseUrl = new URL(process.env.DATABASE_URL);
  seedDatabaseUrl.searchParams.set("connection_limit", "3");
  seedDatabaseUrl.searchParams.set("pool_timeout", "60");
  process.env.DATABASE_URL = seedDatabaseUrl.toString();
}

const prisma = new PrismaClient();
const FIXED_NOW = new Date("2026-07-15T09:00:00.000Z");
const FORBIDDEN_VISIBLE = /\b(?:uat|test|demo|placeholder)\b|[\u2013\u2014]/i;

function id(prefix = "c"): string {
  return `${prefix}${Date.now().toString(36)}${randomBytes(8).toString("hex")}`.slice(0, 25);
}

function month(year: number, zeroBasedMonth: number): Date {
  return new Date(Date.UTC(year, zeroBasedMonth, 1));
}

function amount(value: number): string {
  return (Math.round(value * 10000) / 10000).toFixed(4);
}

function inspectVisible(value: unknown, path = "payload"): void {
  if (typeof value === "string" && FORBIDDEN_VISIBLE.test(value)) {
    throw new Error(`Forbidden visible content at ${path}: ${JSON.stringify(value)}`);
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectVisible(item, `${path}[${index}]`));
    return;
  }
  if (value && typeof value === "object" && !(value instanceof Date) && !Buffer.isBuffer(value)) {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      inspectVisible(child, `${path}.${key}`);
    }
  }
}

async function create(delegate: any, data: Record<string, unknown>) {
  inspectVisible(data);
  return delegate.create({ data });
}

async function createMany(delegate: any, rows: Record<string, unknown>[], label: string) {
  inspectVisible(rows, label);
  const batchSize = 1000;
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    await delegate.createMany({
      data: rows.slice(offset, offset + batchSize),
      skipDuplicates: true,
    });
  }
  console.log(`[seed-fpa] ${label}=${rows.length}`);
}

async function upsert(delegate: any, where: Record<string, unknown>, data: Record<string, unknown>) {
  inspectVisible(data);
  return delegate.upsert({ where, create: data, update: data });
}

type Person = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role?: { name?: string | null } | null;
  roleCode?: string | null;
};

type Master = { id: string; name: string };

const MODULES = [
  { code: "REVENUE", name: "Revenue and Growth", order: 10 },
  { code: "WORKFORCE", name: "Workforce Planning", order: 20 },
  { code: "OPEX", name: "Operating Expenses", order: 30 },
  { code: "CASH", name: "Cash and Investment", order: 40 },
];

type LineDefinition = {
  code: string;
  name: string;
  module: string;
  category: string;
  type: string;
  dataType?: string;
  summary?: string;
  expression?: string;
  dependsOn?: string[];
};

const LINES: LineDefinition[] = [
  { code: "VOLUME", name: "Client Mandates", module: "REVENUE", category: "REVENUE", type: "DRIVER", dataType: "NUMBER" },
  { code: "AVERAGE_FEE", name: "Average Monthly Fee", module: "REVENUE", category: "REVENUE", type: "DRIVER" },
  { code: "RECURRING_REVENUE", name: "Recurring Advisory Revenue", module: "REVENUE", category: "REVENUE", type: "INPUT" },
  { code: "PROJECT_REVENUE", name: "Project and Transaction Revenue", module: "REVENUE", category: "REVENUE", type: "INPUT" },
  {
    code: "REVENUE",
    name: "Revenue",
    module: "REVENUE",
    category: "REVENUE",
    type: "CALC",
    expression: "LINE('RECURRING_REVENUE')+LINE('PROJECT_REVENUE')",
  },
  { code: "HEADCOUNT", name: "Headcount", module: "WORKFORCE", category: "WORKFORCE", type: "DRIVER", dataType: "NUMBER", summary: "LAST" },
  { code: "NEW_HIRES", name: "New Hires", module: "WORKFORCE", category: "WORKFORCE", type: "DRIVER", dataType: "NUMBER" },
  { code: "AVERAGE_COST_PER_FTE", name: "Average Cost per FTE", module: "WORKFORCE", category: "WORKFORCE", type: "DRIVER" },
  {
    code: "PAYROLL",
    name: "Payroll and Benefits",
    module: "WORKFORCE",
    category: "EXPENSE",
    type: "CALC",
    expression: "LINE('HEADCOUNT')*LINE('AVERAGE_COST_PER_FTE')",
  },
  { code: "MARKETING", name: "Market Development", module: "OPEX", category: "EXPENSE", type: "INPUT" },
  { code: "TECHNOLOGY", name: "Technology and Data", module: "OPEX", category: "EXPENSE", type: "INPUT" },
  { code: "FACILITIES", name: "Facilities and Operations", module: "OPEX", category: "EXPENSE", type: "INPUT" },
  { code: "PROFESSIONAL_FEES", name: "Professional Fees", module: "OPEX", category: "EXPENSE", type: "INPUT" },
  {
    code: "OPEX",
    name: "Operating Expenses",
    module: "OPEX",
    category: "EXPENSE",
    type: "CALC",
    expression: "LINE('PAYROLL')+LINE('MARKETING')+LINE('TECHNOLOGY')+LINE('FACILITIES')+LINE('PROFESSIONAL_FEES')",
    dependsOn: ["PAYROLL"],
  },
  {
    code: "EBITDA",
    name: "EBITDA",
    module: "OPEX",
    category: "PROFIT",
    type: "CALC",
    expression: "LINE('REVENUE')-LINE('OPEX')",
    dependsOn: ["REVENUE", "OPEX"],
  },
  { code: "OPENING_CASH", name: "Opening Cash", module: "CASH", category: "CASH", type: "INPUT", summary: "FIRST" },
  {
    code: "OPERATING_CASH_FLOW",
    name: "Operating Cash Flow",
    module: "CASH",
    category: "CASH",
    type: "CALC",
    expression: "LINE('EBITDA')*0.86",
    dependsOn: ["EBITDA"],
  },
  { code: "CAPEX", name: "Capital Expenditure", module: "CASH", category: "CASH", type: "INPUT" },
  { code: "FINANCING_CASH_FLOW", name: "Financing Cash Flow", module: "CASH", category: "CASH", type: "INPUT" },
  {
    code: "CLOSING_CASH",
    name: "Closing Cash",
    module: "CASH",
    category: "CASH",
    type: "CALC",
    summary: "LAST",
    expression: "LINE('OPENING_CASH')+LINE('OPERATING_CASH_FLOW')-LINE('CAPEX')+LINE('FINANCING_CASH_FLOW')",
    dependsOn: ["OPERATING_CASH_FLOW"],
  },
];

const SCENARIOS = [
  { key: "BASE", name: "Management Base Case", type: "BASE", multiplier: 1, official: true },
  { key: "GROWTH", name: "Accelerated Growth", type: "UPSIDE", multiplier: 1.09, official: false },
  { key: "RESILIENCE", name: "Market Resilience", type: "DOWNSIDE", multiplier: 0.92, official: false },
  { key: "INVESTMENT", name: "Strategic Investment", type: "CUSTOM", multiplier: 1.04, official: false },
];

const VERSION_DEFINITIONS = [
  { key: "WORKING", name: "FY2026 Management Plan", status: "DRAFT" },
  { key: "PUBLISHED", name: "FY2026 Board Approved Plan", status: "LOCKED" },
  { key: "PRIOR", name: "FY2025 Final Comparative", status: "LOCKED" },
  { key: "MPC_DRAFT", name: "FY2026 Planning Intake", status: "DRAFT" },
  { key: "MPC_OPEN", name: "FY2026 Department Input", status: "DRAFT" },
  { key: "MPC_SUBMITTED", name: "FY2026 Consolidated Submission", status: "SUBMITTED" },
  { key: "MPC_REVIEW", name: "FY2026 Finance Review", status: "SUBMITTED" },
  { key: "MPC_RETURNED", name: "FY2026 Revision Request", status: "DRAFT" },
  { key: "MPC_APPROVED", name: "FY2026 Executive Approval", status: "PUBLISHED" },
  { key: "MPC_LOCKED", name: "FY2026 Locked Baseline", status: "LOCKED" },
];

function monthlyValues(monthIndex: number, scenarioMultiplier: number, factor = 1) {
  const seasonal = [0.93, 0.96, 1.01, 0.98, 1.03, 1.07, 1.04, 1.06, 1.08, 1.12, 1.16, 1.21][monthIndex];
  const recurring = 720000 * seasonal * scenarioMultiplier * factor;
  const projects = (155000 + monthIndex * 8500) * scenarioMultiplier * factor;
  const revenue = recurring + projects;
  const headcount = Math.round((82 + Math.floor(monthIndex / 2)) * (scenarioMultiplier > 1.05 ? 1.04 : 1));
  const hires = monthIndex % 3 === 0 ? 4 : 2;
  const fteCost = 7250;
  const payroll = headcount * fteCost;
  const investment = scenarioMultiplier === 1.04 ? 1.2 : 1;
  const marketing = (68000 + monthIndex * 1800) * investment * factor;
  const technology = (94000 + monthIndex * 1200) * investment * factor;
  const facilities = 57000 * factor;
  const professionalFees = (42000 + (monthIndex % 3) * 5500) * factor;
  const opex = payroll + marketing + technology + facilities + professionalFees;
  const ebitda = revenue - opex;
  const operatingCashFlow = ebitda * 0.86;
  const capex = (monthIndex === 2 || monthIndex === 8 ? 185000 : 52000) * investment * factor;
  const financingCashFlow = monthIndex === 0 ? 250000 * factor : 0;
  return {
    VOLUME: 118 + monthIndex * 3,
    AVERAGE_FEE: recurring / Math.max(1, 118 + monthIndex * 3),
    RECURRING_REVENUE: recurring,
    PROJECT_REVENUE: projects,
    REVENUE: revenue,
    HEADCOUNT: headcount,
    NEW_HIRES: hires,
    AVERAGE_COST_PER_FTE: fteCost,
    PAYROLL: payroll,
    MARKETING: marketing,
    TECHNOLOGY: technology,
    FACILITIES: facilities,
    PROFESSIONAL_FEES: professionalFees,
    OPEX: opex,
    EBITDA: ebitda,
    OPENING_CASH: 0,
    OPERATING_CASH_FLOW: operatingCashFlow,
    CAPEX: capex,
    FINANCING_CASH_FLOW: financingCashFlow,
    CLOSING_CASH: 0,
  } as Record<string, number>;
}

async function requireEmptyPlanningSchema() {
  const counts = await Promise.all([
    prisma.planningModel.count(),
    prisma.modelPlanningCycle.count(),
    prisma.planningBudgetCycle.count(),
  ]);
  if (counts.some((count) => count !== 0)) {
    throw new Error(
      `FP&A reset required before seeding: models=${counts[0]}, modelPlanningCycles=${counts[1]}, budgetCycles=${counts[2]}`
    );
  }
}

async function resolvePeople(): Promise<{
  people: Person[];
  roles: Record<string, Person>;
}> {
  const all = (await prisma.user.findMany({
    include: { role: true },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
  })) as Person[];
  const clean = all.filter((person) => {
    const identity = `${person.firstName} ${person.lastName} ${person.email}`;
    return !FORBIDDEN_VISIBLE.test(identity) && person.firstName && person.lastName;
  });
  if (!clean.length) {
    throw new Error("No suitable professional user identity is available");
  }
  const score = (person: Person, terms: string[]) => {
    const text = `${person.role?.name || ""} ${person.roleCode || ""} ${person.firstName} ${person.lastName}`.toUpperCase();
    return terms.reduce((total, term) => total + (text.includes(term) ? 10 : 0), 0);
  };
  const pick = (terms: string[], used: Set<string>) => {
    const candidates = [...clean].sort((a, b) => score(b, terms) - score(a, terms));
    const selected = candidates.find((candidate) => !used.has(candidate.id)) || candidates[0];
    used.add(selected.id);
    return selected;
  };
  const used = new Set<string>();
  return {
    people: clean,
    roles: {
      executiveSponsor: pick(["CFO", "FINANCE DIRECTOR", "ADMIN"], used),
      planningLead: pick(["FP&A", "FINANCE", "CONTROLLER"], used),
      businessPartner: pick(["FINANCE", "MANAGER", "ACCOUNT"], used),
      departmentOwner: pick(["MANAGER", "HEAD", "DIRECTOR"], used),
    },
  };
}

async function resolveMasters() {
  let entities = await prisma.forecastEntity.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });
  if (entities.filter((entity) => !FORBIDDEN_VISIBLE.test(entity.name)).length < 2) {
    const creator = await prisma.user.findFirst({
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!creator) {
      throw new Error("Cannot seed forecast entities without an active user");
    }
    const defaults = [
      { name: "Arcus Group Holdings", type: "INTERNAL_SUBSIDIARY", isDefault: true },
      { name: "Arcus Capital Partners", type: "INTERNAL_SUBSIDIARY", isDefault: false },
      { name: "Arcus Advisory Limited", type: "INTERNAL_SUBSIDIARY", isDefault: false },
    ];
    for (const row of defaults) {
      const existing = await prisma.forecastEntity.findFirst({ where: { name: row.name } });
      if (existing) {
        await prisma.forecastEntity.update({
          where: { id: existing.id },
          data: { isActive: true, isDefault: row.isDefault, baseCurrency: "USD" },
        });
      } else {
        await prisma.forecastEntity.create({
          data: {
            name: row.name,
            type: row.type,
            baseCurrency: "USD",
            isActive: true,
            isDefault: row.isDefault,
            createdById: creator.id,
          },
        });
      }
    }
    entities = await prisma.forecastEntity.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });
  }

  const [departments, accounts] = await Promise.all([
    prisma.department.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.chartOfAccounts.findMany({
      where: { isActive: true },
      select: { id: true, accountNo: true, accountName: true },
      orderBy: { accountNo: "asc" },
      take: 24,
    }),
  ]);
  const cleanDepartments = departments.filter((department) => !FORBIDDEN_VISIBLE.test(department.name));
  const cleanEntities = entities.filter((entity) => !FORBIDDEN_VISIBLE.test(entity.name));
  if (cleanDepartments.length < 3 || cleanEntities.length < 2) {
    throw new Error(
      `At least three professional departments and two active forecast entities are required; got departments=${cleanDepartments.length} entities=${cleanEntities.length}`
    );
  }
  return {
    departments: cleanDepartments.slice(0, 4),
    entities: cleanEntities.slice(0, 3),
    accounts,
  };
}

async function seedDimensions() {
  const definitions = [
    {
      code: "REGION",
      name: "Operating Region",
      type: "GEOGRAPHY",
      members: [
        ["SOUTHERN_AFRICA", "Southern Africa"],
        ["EAST_AFRICA", "East Africa"],
        ["INTERNATIONAL", "International Markets"],
      ],
    },
    {
      code: "SERVICE_LINE",
      name: "Service Line",
      type: "PRODUCT",
      members: [
        ["ADVISORY", "Investment Advisory"],
        ["CAPITAL_MARKETS", "Capital Markets"],
        ["TREASURY", "Treasury Solutions"],
      ],
    },
    {
      code: "CLIENT_CHANNEL",
      name: "Client Channel",
      type: "CHANNEL",
      members: [
        ["INSTITUTIONAL", "Institutional"],
        ["CORPORATE", "Corporate"],
        ["PRIVATE_CLIENT", "Private Client"],
      ],
    },
  ];
  inspectVisible(definitions, "dimensionDefinitions");
  const dimensions: Record<string, { id: string; memberIds: string[] }> = {};
  for (const definition of definitions) {
    const dimension = await create(prisma.planningDimension, {
      id: id(),
      code: definition.code,
      name: definition.name,
      dimensionType: definition.type,
    });
    const memberIds: string[] = [];
    for (let index = 0; index < definition.members.length; index += 1) {
      const memberId = id();
      memberIds.push(memberId);
      await create(prisma.planningDimensionMember, {
        id: memberId,
        dimensionId: dimension.id,
        code: definition.members[index][0],
        name: definition.members[index][1],
        sortOrder: index + 1,
        isActive: true,
      });
    }
    dimensions[definition.code] = { id: dimension.id, memberIds };
  }
  return dimensions;
}

async function seedPrimaryModel(
  roles: Record<string, Person>,
  departments: Master[],
  entities: Master[],
  accounts: Array<{ id: string }>,
  dimensions: Record<string, { id: string; memberIds: string[] }>
) {
  const modelId = id();
  await create(prisma.planningModel, {
    id: modelId,
    name: "Arcus Group FY2026 Integrated Plan",
    code: "ARCUS_GROUP_FY2026",
    modelType: "INTEGRATED_PLAN",
    description: "Integrated revenue, workforce, operating expense, cash, and capital plan for Arcus Group",
    ownerUserId: roles.planningLead.id,
    baseCurrency: "USD",
    startPeriod: month(2026, 0),
    endPeriod: month(2026, 11),
    timeGranularity: "MONTHLY",
    status: "PUBLISHED",
    baselineMode: "PRIOR_YEAR_ACTUAL",
    publishedAt: FIXED_NOW,
    publishedById: roles.executiveSponsor.id,
    createdById: roles.planningLead.id,
    updatedById: roles.planningLead.id,
  });

  const moduleIds: Record<string, string> = {};
  for (const definition of MODULES) {
    const moduleId = id();
    moduleIds[definition.code] = moduleId;
    await create(prisma.planningModule, {
      id: moduleId,
      modelId,
      code: definition.code,
      name: definition.name,
      description: `${definition.name} schedule for the FY2026 integrated plan`,
      calcOrder: definition.order,
      sortOrder: definition.order,
      status: "ACTIVE",
      dimensionKeys: ["ENTITY", "DEPARTMENT", "REGION", "SERVICE_LINE"],
    });
  }

  const lineIds: Record<string, string> = {};
  const formulaIds: Record<string, string> = {};
  for (let index = 0; index < LINES.length; index += 1) {
    const line = LINES[index];
    const lineId = id();
    lineIds[line.code] = lineId;
    await create(prisma.planningLineItem, {
      id: lineId,
      modelId,
      moduleId: moduleIds[line.module],
      code: line.code,
      name: line.name,
      description: `${line.name} for management planning and performance review`,
      lineItemType: line.type,
      category: line.category,
      dataType: line.dataType || "CURRENCY",
      summaryMethod: line.summary || (line.dataType === "NUMBER" ? "SUM" : "SUM"),
      format: line.dataType === "NUMBER" ? "NUMBER" : "CURRENCY",
      currencyCode: line.dataType === "NUMBER" ? null : "USD",
      decimalPlaces: line.dataType === "NUMBER" ? 0 : 2,
      dimensionKeys: ["ENTITY", "DEPARTMENT"],
      isEditable: !line.expression,
      sortOrder: (index + 1) * 10,
      accountId: accounts[index % Math.max(accounts.length, 1)]?.id || null,
      updatedById: roles.planningLead.id,
    });
    if (line.expression) {
      const formulaId = id();
      formulaIds[line.code] = formulaId;
      await create(prisma.planningFormula, {
        id: formulaId,
        modelId,
        lineItemId: lineId,
        expression: line.expression,
        isValid: true,
        validationMsg: "Validated for FY2026 monthly calculation",
        createdById: roles.planningLead.id,
      });
    }
  }
  for (const line of LINES) {
    for (const dependencyCode of line.dependsOn || []) {
      if (formulaIds[line.code] && formulaIds[dependencyCode]) {
        await create(prisma.planningFormulaDependency, {
          id: id(),
          formulaId: formulaIds[line.code],
          dependsOnFormulaId: formulaIds[dependencyCode],
        });
      }
    }
  }

  const scenarioIds: Record<string, string> = {};
  for (const scenario of SCENARIOS) {
    const scenarioId = id();
    scenarioIds[scenario.key] = scenarioId;
    await create(prisma.planningScenario, {
      id: scenarioId,
      modelId,
      name: scenario.name,
      scenarioType: scenario.type,
      description: `${scenario.name} assumptions for Arcus Group FY2026`,
      isOfficial: scenario.official,
      status: "ACTIVE",
      parentScenarioId: scenario.key === "BASE" ? null : scenarioIds.BASE,
      createdById: roles.planningLead.id,
    });
  }

  const versionIds: Record<string, string> = {};
  for (const definition of VERSION_DEFINITIONS) {
    const versionId = id();
    versionIds[definition.key] = versionId;
    const locked = definition.status === "LOCKED";
    const published = ["LOCKED", "PUBLISHED"].includes(definition.status);
    await create(prisma.planningVersion, {
      id: versionId,
      modelId,
      name: definition.name,
      status: definition.status,
      lockedAt: locked ? FIXED_NOW : null,
      lockedById: locked ? roles.executiveSponsor.id : null,
      publishedAt: published ? FIXED_NOW : null,
      publishedById: published ? roles.executiveSponsor.id : null,
      checksum: `arcus-fy2026-${definition.key.toLowerCase()}`,
      publishNotes: published ? "Approved management planning baseline" : null,
      createdById: roles.planningLead.id,
    });
  }
  await prisma.planningModel.update({
    where: { id: modelId },
    data: {
      baselineSourceVersionId: versionIds.PRIOR,
      baselineSourceScenarioId: scenarioIds.BASE,
    },
  });

  for (const entity of entities) {
    await create(prisma.planningModelEntity, { id: id(), modelId, entityId: entity.id });
  }
  for (const department of departments) {
    await create(prisma.planningModelDepartment, { id: id(), modelId, departmentId: department.id });
  }
  for (const account of accounts) {
    await create(prisma.planningModelAccount, { id: id(), modelId, accountId: account.id });
  }
  for (const dimension of Object.values(dimensions)) {
    await create(prisma.planningModelDimension, {
      id: id(),
      modelId,
      dimensionId: dimension.id,
    });
    for (const memberId of dimension.memberIds) {
      await create(prisma.planningModelDimensionMember, {
        id: id(),
        modelId,
        dimensionId: dimension.id,
        memberId,
      });
    }
  }

  const selectedEntities = entities.slice(0, 2);
  const selectedDepartments = departments.slice(0, 3);
  const coordinates = selectedEntities.flatMap((entity, entityIndex) =>
    selectedDepartments.map((department, departmentIndex) => ({
      entity,
      department,
      weight: [0.28, 0.2, 0.14, 0.16, 0.13, 0.09][entityIndex * 3 + departmentIndex] || 0.1,
    }))
  );
  const coordinateWeight = coordinates.reduce((sum, coordinate) => sum + coordinate.weight, 0);
  coordinates.forEach((coordinate) => {
    coordinate.weight /= coordinateWeight;
  });

  const cellRows: Record<string, unknown>[] = [];
  const driverRows: Record<string, unknown>[] = [];
  const versionPlans = [
    { key: "WORKING", scenarios: SCENARIOS.map((scenario) => scenario.key), factor: 1 },
    { key: "PUBLISHED", scenarios: ["BASE", "GROWTH"], factor: 0.99 },
    { key: "MPC_DRAFT", scenarios: ["BASE"], factor: 0.96 },
    { key: "MPC_OPEN", scenarios: ["BASE"], factor: 0.975 },
    { key: "MPC_SUBMITTED", scenarios: ["BASE"], factor: 0.985 },
    { key: "MPC_REVIEW", scenarios: ["BASE"], factor: 0.99 },
    { key: "MPC_RETURNED", scenarios: ["BASE"], factor: 0.982 },
    { key: "MPC_APPROVED", scenarios: ["BASE"], factor: 0.995 },
    { key: "MPC_LOCKED", scenarios: ["BASE"], factor: 1 },
  ];
  for (const plan of versionPlans) {
    for (const scenarioKey of plan.scenarios) {
      const scenario = SCENARIOS.find((item) => item.key === scenarioKey)!;
      let openingCash = 2650000 * plan.factor;
      for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
        const values = monthlyValues(monthIndex, scenario.multiplier, plan.factor);
        values.OPENING_CASH = openingCash;
        values.CLOSING_CASH =
          openingCash + values.OPERATING_CASH_FLOW - values.CAPEX + values.FINANCING_CASH_FLOW;
        openingCash = values.CLOSING_CASH;
        for (const coordinate of coordinates) {
          for (const line of LINES) {
            const isNumber = line.dataType === "NUMBER";
            const value =
              isNumber && ["HEADCOUNT", "VOLUME"].includes(line.code)
                ? values[line.code] * coordinate.weight
                : values[line.code] * coordinate.weight;
            cellRows.push({
              id: id(),
              modelId,
              scenarioId: scenarioIds[scenarioKey],
              versionId: versionIds[plan.key],
              lineItemId: lineIds[line.code],
              periodDate: month(2026, monthIndex),
              entityId: coordinate.entity.id,
              departmentId: coordinate.department.id,
              accountId: accounts[LINES.indexOf(line) % Math.max(accounts.length, 1)]?.id || null,
              currencyCode: "USD",
              value: amount(value),
              valueType: line.expression ? "CALCULATED" : "PLAN",
              sourceType: line.expression ? "FORMULA" : "INPUT",
              isEditable: !line.expression && !["PUBLISHED", "MPC_LOCKED"].includes(plan.key),
              isLocked: ["PUBLISHED", "MPC_LOCKED"].includes(plan.key),
              formulaId: formulaIds[line.code] || null,
              lastUpdatedById: roles.businessPartner.id,
              lastUpdatedAt: FIXED_NOW,
              lastCalculatedAt: line.expression ? FIXED_NOW : null,
              recordVersion: 1n,
            });
          }
        }
        if (plan.key === "WORKING" && scenarioKey === "BASE") {
          for (const driver of [
            { code: "CLIENT_MANDATES", name: "Client Mandates", category: "REVENUE", value: values.VOLUME, unit: "MANDATES", method: "SEASONAL" },
            { code: "AVERAGE_MONTHLY_FEE", name: "Average Monthly Fee", category: "REVENUE", value: values.AVERAGE_FEE, unit: "USD", method: "PRIOR_YEAR" },
            { code: "HEADCOUNT", name: "Headcount", category: "WORKFORCE", value: values.HEADCOUNT, unit: "FTE", method: "MANUAL" },
            { code: "FTE_COST", name: "Average Cost per FTE", category: "WORKFORCE", value: values.AVERAGE_COST_PER_FTE, unit: "USD", method: "RUN_RATE" },
            { code: "CAPEX_PROGRAM", name: "Capital Program", category: "CAPEX", value: values.CAPEX, unit: "USD", method: "CUSTOM_WEIGHT" },
          ]) {
            driverRows.push({
              id: id(),
              modelId,
              scenarioId: scenarioIds.BASE,
              versionId: versionIds.WORKING,
              code: driver.code,
              name: driver.name,
              category: driver.category,
              periodDate: month(2026, monthIndex),
              value: amount(driver.value),
              unit: driver.unit,
              requiresApproval: driver.code === "CAPEX_PROGRAM",
              confidence: monthIndex < 6 ? "HIGH" : "MEDIUM",
              spreadingMethod: driver.method,
              createdById: roles.planningLead.id,
            });
          }
        }
      }
    }
  }

  let priorOpeningCash = 2240000;
  for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
    const values = monthlyValues(monthIndex, 0.91, 0.97);
    values.OPENING_CASH = priorOpeningCash;
    values.CLOSING_CASH =
      priorOpeningCash + values.OPERATING_CASH_FLOW - values.CAPEX + values.FINANCING_CASH_FLOW;
    priorOpeningCash = values.CLOSING_CASH;
    for (const coordinate of coordinates) {
      for (const line of LINES) {
        cellRows.push({
          id: id(),
          modelId,
          scenarioId: scenarioIds.BASE,
          versionId: versionIds.PRIOR,
          lineItemId: lineIds[line.code],
          periodDate: month(2025, monthIndex),
          entityId: coordinate.entity.id,
          departmentId: coordinate.department.id,
          accountId: accounts[LINES.indexOf(line) % Math.max(accounts.length, 1)]?.id || null,
          currencyCode: "USD",
          value: amount(values[line.code] * coordinate.weight),
          valueType: "ACTUAL",
          sourceType: "ACTUALS_SNAPSHOT",
          isEditable: false,
          isLocked: true,
          formulaId: formulaIds[line.code] || null,
          lastUpdatedById: roles.planningLead.id,
          lastUpdatedAt: FIXED_NOW,
          lastCalculatedAt: line.expression ? FIXED_NOW : null,
          recordVersion: 1n,
        });
      }
    }
  }
  await createMany(prisma.planningCell, cellRows, "planningCells");
  await createMany(prisma.planningDriver, driverRows, "planningDrivers");

  const actualRows: Record<string, unknown>[] = [];
  let actualOpeningCash = 2650000;
  for (let monthIndex = 0; monthIndex < 6; monthIndex += 1) {
    const actualValues = monthlyValues(monthIndex, 1.015, 1);
    actualValues.OPENING_CASH = actualOpeningCash;
    actualValues.CLOSING_CASH =
      actualOpeningCash +
      actualValues.OPERATING_CASH_FLOW -
      actualValues.CAPEX +
      actualValues.FINANCING_CASH_FLOW;
    actualOpeningCash = actualValues.CLOSING_CASH;
    for (const coordinate of coordinates) {
      for (const line of LINES.filter((item) =>
        ["REVENUE", "OPEX", "EBITDA", "HEADCOUNT", "CLOSING_CASH", "CAPEX", "PAYROLL", "MARKETING"].includes(item.code)
      )) {
        actualRows.push({
          id: id(),
          modelId,
          periodDate: month(2026, monthIndex),
          entityId: coordinate.entity.id,
          accountId: accounts[LINES.indexOf(line) % Math.max(accounts.length, 1)]?.id || null,
          lineItemId: lineIds[line.code],
          currencyCode: "USD",
          amount: amount(actualValues[line.code] * coordinate.weight),
          sourceModule: line.code === "HEADCOUNT" ? "HRIS" : "GENERAL_LEDGER",
        });
      }
    }
  }
  await createMany(prisma.planningActualsSnapshot, actualRows, "actualsSnapshots");

  const dataSource = await create(prisma.planningDataSource, {
    id: id(),
    modelId,
    systemCode: "ARCUS_ERP",
    name: "Arcus Finance Ledger",
    connectorConfig: {
      ledger: "Arcus Group Consolidated",
      currency: "USD",
      refreshCadence: "MONTHLY_CLOSE",
    },
  });
  for (let index = 0; index < LINES.length; index += 1) {
    const line = LINES[index];
    const sourceField = await create(prisma.planningSourceField, {
      id: id(),
      dataSourceId: dataSource.id,
      fieldKey: `FINANCE.${String(4000 + index * 10)}`,
      dataType: line.dataType || "CURRENCY",
    });
    await create(prisma.planningLineItemMapping, {
      id: id(),
      modelId,
      sourceFieldId: sourceField.id,
      lineItemId: lineIds[line.code],
      moduleId: moduleIds[line.module],
      status: "MAPPED",
      mappedAt: FIXED_NOW,
      mappedById: roles.planningLead.id,
    });
  }

  return {
    modelId,
    moduleIds,
    lineIds,
    formulaIds,
    scenarioIds,
    versionIds,
    coordinates,
    dataSourceId: dataSource.id,
  };
}

async function seedCompanionModel(
  input: {
    name: string;
    code: string;
    description: string;
    status: string;
    year: number;
    versionName: string;
  },
  ownerId: string
) {
  const model = await create(prisma.planningModel, {
    id: id(),
    name: input.name,
    code: input.code,
    modelType: "BUDGET",
    description: input.description,
    ownerUserId: ownerId,
    baseCurrency: "USD",
    startPeriod: month(input.year, 0),
    endPeriod: month(input.year, 11),
    timeGranularity: "MONTHLY",
    status: input.status,
    createdById: ownerId,
    updatedById: ownerId,
  });
  const module = await create(prisma.planningModule, {
    id: id(),
    modelId: model.id,
    code: "SUMMARY",
    name: "Management Summary",
    description: "Concise management planning structure",
    calcOrder: 10,
    sortOrder: 10,
    status: input.status === "ARCHIVED" ? "ARCHIVED" : "DRAFT",
  });
  const lines: Record<string, string> = {};
  for (const [index, line] of [
    ["REVENUE", "Revenue"],
    ["OPEX", "Operating Expenses"],
    ["EBITDA", "EBITDA"],
    ["CLOSING_CASH", "Closing Cash"],
  ].entries()) {
    const row = await create(prisma.planningLineItem, {
      id: id(),
      modelId: model.id,
      moduleId: module.id,
      code: line[0],
      name: line[1],
      description: `${line[1]} management summary`,
      lineItemType: "INPUT",
      category: line[0] === "OPEX" ? "EXPENSE" : "SUMMARY",
      dataType: "CURRENCY",
      summaryMethod: line[0] === "CLOSING_CASH" ? "LAST" : "SUM",
      currencyCode: "USD",
      isEditable: input.status !== "ARCHIVED",
      sortOrder: (index + 1) * 10,
      updatedById: ownerId,
    });
    lines[line[0]] = row.id;
  }
  const scenario = await create(prisma.planningScenario, {
    id: id(),
    modelId: model.id,
    name: "Management Base Case",
    scenarioType: "BASE",
    description: "Primary management planning assumptions",
    isOfficial: true,
    status: input.status === "ARCHIVED" ? "ARCHIVED" : "DRAFT",
    createdById: ownerId,
  });
  const version = await create(prisma.planningVersion, {
    id: id(),
    modelId: model.id,
    name: input.versionName,
    status: input.status === "ARCHIVED" ? "LOCKED" : "DRAFT",
    lockedAt: input.status === "ARCHIVED" ? FIXED_NOW : null,
    lockedById: input.status === "ARCHIVED" ? ownerId : null,
    publishedAt: input.status === "ARCHIVED" ? FIXED_NOW : null,
    publishedById: input.status === "ARCHIVED" ? ownerId : null,
    publishNotes: input.status === "ARCHIVED" ? "Retained for historical comparison" : null,
    createdById: ownerId,
  });
  return { modelId: model.id, versionId: version.id, scenarioId: scenario.id, lineIds: lines };
}

async function seedModelPlanningCycles(
  primary: Awaited<ReturnType<typeof seedPrimaryModel>>,
  roles: Record<string, Person>,
  departments: Master[]
) {
  const definitions = [
    { key: "DRAFT", name: "FY2026 Planning Framework", status: "DRAFT", stage: "SETUP", version: "MPC_DRAFT" },
    { key: "OPEN", name: "FY2026 Department Planning", status: "OPEN", stage: "OWNER_INPUT", version: "MPC_OPEN" },
    { key: "SUBMITTED", name: "FY2026 Consolidated Plan", status: "SUBMITTED", stage: "FPA_REVIEW", version: "MPC_SUBMITTED" },
    { key: "UNDER_REVIEW", name: "FY2026 Finance Review", status: "UNDER_REVIEW", stage: "CFO_REVIEW", version: "MPC_REVIEW" },
    { key: "RETURNED_FOR_CORRECTION", name: "FY2026 Management Revisions", status: "RETURNED_FOR_CORRECTION", stage: "OWNER_INPUT", version: "MPC_RETURNED" },
    { key: "APPROVED", name: "FY2026 Executive Approved Plan", status: "APPROVED", stage: "APPROVED", version: "MPC_APPROVED" },
    { key: "LOCKED", name: "FY2026 Locked Operating Plan", status: "LOCKED", stage: "LOCKED", version: "MPC_LOCKED" },
  ];
  inspectVisible(definitions, "modelPlanningDefinitions");
  const cycleIds: Record<string, string> = {};
  const workflowIds: Record<string, string> = {};
  for (let index = 0; index < definitions.length; index += 1) {
    const definition = definitions[index];
    const workflow = await create(prisma.planningWorkflow, {
      id: id(),
      modelId: primary.modelId,
      name: `${definition.name} Workflow`,
      workflowType: "MODEL_PLANNING",
      stage: definition.stage,
      status: ["APPROVED", "LOCKED"].includes(definition.status) ? "COMPLETED" : "ACTIVE",
      startDate: month(2025, 8),
      endDate: month(2026, 11),
      createdById: roles.planningLead.id,
    });
    workflowIds[definition.key] = workflow.id;
    const cycle = await create(prisma.modelPlanningCycle, {
      id: id(),
      name: definition.name,
      financialYear: 2026,
      planningType: index === 4 ? "REFORECAST" : "ANNUAL_BUDGET",
      sourceModelId: primary.modelId,
      sourceModelVersionId: primary.versionIds[definition.version],
      actualsCutoffPeriod: month(2026, 5),
      forecastStartPeriod: month(2026, 6),
      planningHorizon: 12,
      materialVariancePct: amount(5),
      baseScenarioId: primary.scenarioIds.BASE,
      submissionDeadline: new Date("2026-09-30T00:00:00.000Z"),
      workflowId: workflow.id,
      planningOwnerId: roles.planningLead.id,
      status: definition.status,
      currentStage: definition.stage,
      submittedAt: ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "LOCKED"].includes(definition.status) ? new Date("2026-09-28T14:00:00.000Z") : null,
      submittedById: ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "LOCKED"].includes(definition.status) ? roles.businessPartner.id : null,
      approvedAt: ["APPROVED", "LOCKED"].includes(definition.status) ? new Date("2026-10-20T15:00:00.000Z") : null,
      approvedById: ["APPROVED", "LOCKED"].includes(definition.status) ? roles.executiveSponsor.id : null,
      lockedAt: definition.status === "LOCKED" ? new Date("2026-10-24T12:00:00.000Z") : null,
      lockedById: definition.status === "LOCKED" ? roles.executiveSponsor.id : null,
      createdById: roles.planningLead.id,
      updatedById: roles.planningLead.id,
    });
    cycleIds[definition.key] = cycle.id;
    for (let departmentIndex = 0; departmentIndex < Math.min(3, departments.length); departmentIndex += 1) {
      const department = departments[departmentIndex];
      const status =
        definition.status === "RETURNED_FOR_CORRECTION"
          ? "RETURNED"
          : ["APPROVED", "LOCKED"].includes(definition.status)
            ? "APPROVED"
            : ["SUBMITTED", "UNDER_REVIEW"].includes(definition.status)
              ? "SUBMITTED"
              : definition.status === "OPEN"
                ? "IN_PROGRESS"
                : "OPEN";
      const task = await create(prisma.planningTask, {
        id: id(),
        workflowId: workflow.id,
        title: `${department.name} FY2026 operating plan`,
        departmentId: department.id,
        assigneeId: departmentIndex === 0 ? roles.departmentOwner.id : roles.businessPartner.id,
        reviewerId: roles.planningLead.id,
        status,
        priority: departmentIndex === 0 ? "HIGH" : "NORMAL",
        dueDate: new Date("2026-09-30T00:00:00.000Z"),
        submittedAt: ["SUBMITTED", "RETURNED", "APPROVED"].includes(status) ? new Date("2026-09-28T14:00:00.000Z") : null,
        changeNotes: status === "RETURNED" ? "Revise the second half hiring sequence and link each role to signed client mandates." : null,
      });
      await create(prisma.modelPlanningCycleOwner, {
        id: id(),
        cycleId: cycle.id,
        departmentId: department.id,
        assigneeId: departmentIndex === 0 ? roles.departmentOwner.id : roles.businessPartner.id,
        taskId: task.id,
        dueDate: new Date("2026-09-30T00:00:00.000Z"),
        status,
      });
      if (["SUBMITTED", "UNDER_REVIEW", "RETURNED_FOR_CORRECTION", "APPROVED", "LOCKED"].includes(definition.status)) {
        await create(prisma.planningApproval, {
          id: id(),
          workflowId: workflow.id,
          taskId: task.id,
          actorId: roles.planningLead.id,
          action: definition.status === "RETURNED_FOR_CORRECTION" ? "RETURN" : definition.status === "UNDER_REVIEW" ? "REVIEW" : "APPROVE",
          comment:
            definition.status === "RETURNED_FOR_CORRECTION"
              ? "Revenue assumptions are sound. Please align the hiring sequence to mandate activation dates."
              : "Department submission is complete and supported by clear operating assumptions.",
        });
      }
    }
  }
  return { cycleIds, workflowIds };
}

async function seedLegacyCycles(
  primary: Awaited<ReturnType<typeof seedPrimaryModel>>,
  roles: Record<string, Person>,
  departments: Master[]
) {
  const definitions = [
    { key: "RETURNED", name: "FY2026 Budget Revision", status: "RETURNED_FOR_CORRECTION", stage: "FPA_REVIEW", version: "MPC_RETURNED" },
    { key: "OPEN", name: "FY2026 Budget Input", status: "OPEN_FOR_INPUT", stage: "OWNER_INPUT", version: "MPC_OPEN" },
    { key: "REVIEW", name: "FY2026 Executive Budget Review", status: "PENDING_CFO_REVIEW", stage: "CFO_REVIEW", version: "MPC_REVIEW" },
    { key: "LOCKED", name: "FY2025 Closed Budget", status: "LOCKED", stage: "LOCK", version: "PRIOR" },
  ];
  inspectVisible(definitions, "legacyCycleDefinitions");
  const cycleIds: Record<string, string> = {};
  for (const definition of definitions) {
    const workflow = await create(prisma.planningWorkflow, {
      id: id(),
      modelId: primary.modelId,
      name: `${definition.name} Workflow`,
      workflowType: "BUDGET",
      stage: definition.stage,
      status: definition.status === "LOCKED" ? "COMPLETED" : "ACTIVE",
      startDate: definition.key === "LOCKED" ? month(2024, 8) : month(2025, 8),
      endDate: definition.key === "LOCKED" ? month(2025, 11) : month(2026, 11),
      createdById: roles.planningLead.id,
    });
    const cycle = await create(prisma.planningBudgetCycle, {
      id: id(),
      name: definition.name,
      modelId: primary.modelId,
      versionId: primary.versionIds[definition.version],
      scenarioId: primary.scenarioIds.BASE,
      workflowId: workflow.id,
      fiscalYear: definition.key === "LOCKED" ? 2025 : 2026,
      planningType: "ANNUAL_BUDGET",
      status: definition.status,
      currentStage: definition.stage,
      startDate: definition.key === "LOCKED" ? month(2025, 0) : month(2026, 0),
      endDate: definition.key === "LOCKED" ? month(2025, 11) : month(2026, 11),
      actualsCutoffDate: definition.key === "LOCKED" ? month(2024, 11) : month(2026, 5),
      forecastStartPeriod: definition.key === "LOCKED" ? month(2025, 0) : month(2026, 6),
      submissionDeadline: definition.key === "LOCKED" ? new Date("2024-11-30T00:00:00.000Z") : new Date("2026-09-30T00:00:00.000Z"),
      baseCurrency: "USD",
      cycleOwnerId: roles.planningLead.id,
      entityIdsJson: primary.coordinates.map((coordinate) => coordinate.entity.id),
      baselineMode: "PRIOR_YEAR_ACTUAL",
      baselineSourceVersionId: primary.versionIds.PRIOR,
      loadPriorActualsOnOpen: true,
      loadBaselineOnOpen: true,
      inputCategoriesJson: ["REVENUE", "WORKFORCE", "OPEX", "CASH", "CAPEX"],
      openedAt: definition.status !== "DRAFT" ? new Date("2026-08-15T09:00:00.000Z") : null,
      cfoReviewAt: definition.status === "PENDING_CFO_REVIEW" ? new Date("2026-10-14T09:00:00.000Z") : null,
      lockedAt: definition.status === "LOCKED" ? new Date("2024-12-20T12:00:00.000Z") : null,
      lockedById: definition.status === "LOCKED" ? roles.executiveSponsor.id : null,
      approvedAt: definition.status === "LOCKED" ? new Date("2024-12-18T12:00:00.000Z") : null,
      approvedById: definition.status === "LOCKED" ? roles.executiveSponsor.id : null,
      createdById: roles.planningLead.id,
    });
    cycleIds[definition.key] = cycle.id;
    for (let index = 0; index < Math.min(3, departments.length); index += 1) {
      const department = departments[index];
      const task = await create(prisma.planningTask, {
        id: id(),
        workflowId: workflow.id,
        title: `${department.name} budget submission`,
        departmentId: department.id,
        assigneeId: index === 0 ? roles.departmentOwner.id : roles.businessPartner.id,
        reviewerId: roles.planningLead.id,
        status: definition.status === "LOCKED" ? "APPROVED" : definition.status === "PENDING_CFO_REVIEW" ? "SUBMITTED" : definition.status === "RETURNED_FOR_CORRECTION" ? "RETURNED" : definition.status === "OPEN_FOR_INPUT" ? "IN_PROGRESS" : "PENDING",
        priority: index === 0 ? "HIGH" : "NORMAL",
        dueDate: new Date("2026-09-30T00:00:00.000Z"),
        submittedAt: ["LOCKED", "PENDING_CFO_REVIEW"].includes(definition.status) ? new Date("2026-09-28T14:00:00.000Z") : null,
      });
      await create(prisma.planningBudgetCycleOwner, {
        id: id(),
        cycleId: cycle.id,
        departmentId: department.id,
        assigneeId: index === 0 ? roles.departmentOwner.id : roles.businessPartner.id,
        taskId: task.id,
        categoriesJson: index === 0 ? ["REVENUE", "WORKFORCE"] : ["OPEX", "CASH", "CAPEX"],
        baselineMethod: "PRIOR_YEAR_ACTUAL",
        status: definition.status === "LOCKED" ? "APPROVED" : definition.status === "PENDING_CFO_REVIEW" ? "SUBMITTED" : definition.status === "RETURNED_FOR_CORRECTION" ? "RETURNED" : "PENDING",
      });
    }
  }
  return cycleIds;
}

async function seedCollaborationAndVariance(
  primary: Awaited<ReturnType<typeof seedPrimaryModel>>,
  roles: Record<string, Person>,
  mpc: Awaited<ReturnType<typeof seedModelPlanningCycles>>
) {
  const varianceIds: string[] = [];
  let planClosingCash = 2650000;
  let actualClosingCash = 2650000;
  for (let monthIndex = 0; monthIndex < 6; monthIndex += 1) {
    const plan = monthlyValues(monthIndex, 1, 1);
    const actual = monthlyValues(monthIndex, 1.015, 1);
    plan.OPENING_CASH = planClosingCash;
    plan.CLOSING_CASH =
      planClosingCash + plan.OPERATING_CASH_FLOW - plan.CAPEX + plan.FINANCING_CASH_FLOW;
    planClosingCash = plan.CLOSING_CASH;
    actual.OPENING_CASH = actualClosingCash;
    actual.CLOSING_CASH =
      actualClosingCash + actual.OPERATING_CASH_FLOW - actual.CAPEX + actual.FINANCING_CASH_FLOW;
    actualClosingCash = actual.CLOSING_CASH;
    for (const code of ["REVENUE", "OPEX", "EBITDA", "HEADCOUNT", "CAPEX", "CLOSING_CASH"]) {
      const actualValue = actual[code];
      const planValue = plan[code];
      const variance = actualValue - planValue;
      const variancePercent = planValue === 0 ? 0 : (variance / Math.abs(planValue)) * 100;
      const row = await create(prisma.planningVarianceResult, {
        id: id(),
        modelId: primary.modelId,
        lineItemId: primary.lineIds[code],
        periodDate: month(2026, monthIndex),
        entityId: primary.coordinates[monthIndex % primary.coordinates.length].entity.id,
        departmentId: primary.coordinates[monthIndex % primary.coordinates.length].department.id,
        varianceType: "ACTUAL_VS_PLAN",
        actualValue: amount(actualValue),
        planValue: amount(planValue),
        varianceAmount: amount(variance),
        variancePercent: amount(variancePercent),
        direction: variance >= 0 ? "FAVORABLE" : "UNFAVORABLE",
        commentaryRequired: Math.abs(variancePercent) >= 3,
      });
      varianceIds.push(row.id);
      if (Math.abs(variancePercent) >= 3 || ["EBITDA", "CAPEX"].includes(code)) {
        const parent = await create(prisma.planningComment, {
          id: id(),
          modelId: primary.modelId,
          varianceId: row.id,
          cycleId: mpc.cycleIds.UNDER_REVIEW,
          visibility: "ALL",
          body:
            code === "CAPEX"
              ? "Capital spend reflects the approved data platform milestone and remains within the annual envelope."
              : `${LINES.find((line) => line.code === code)?.name} movement reflects current trading and operating cadence.`,
          correctiveAction:
            code === "EBITDA"
              ? "Maintain weekly margin reviews and align discretionary spend to confirmed revenue conversion."
              : "Track the monthly run rate and escalate any change to the management outlook.",
          status: "OPEN",
          createdById: roles.businessPartner.id,
        });
        await create(prisma.planningComment, {
          id: id(),
          modelId: primary.modelId,
          varianceId: row.id,
          cycleId: mpc.cycleIds.UNDER_REVIEW,
          parentCommentId: parent.id,
          visibility: "ALL",
          body: "Finance has reviewed the supporting schedule. Include this explanation in the monthly performance pack.",
          correctiveAction: "Confirm the next forecast update after month end close.",
          status: "RESOLVED",
          createdById: roles.planningLead.id,
        });
      }
    }
  }

  const activities = [
    ["MODEL_CREATED", "MODEL", "Integrated FY2026 model structure established"],
    ["VERSION_PUBLISHED", "VERSION", "Board approved plan published"],
    ["ACTUALS_SYNCED", "ACTUALS", "January through June actuals synchronized"],
    ["DRIVER_UPDATED", "DRIVER", "Client mandate and workforce assumptions refreshed"],
    ["OWNER_ASSIGNED", "CYCLE", "Department planning ownership confirmed"],
    ["SUBMISSION_RECEIVED", "CYCLE", "Consolidated department submission received"],
    ["REVIEW_STARTED", "CYCLE", "Finance review commenced"],
    ["VARIANCE_EXPLAINED", "VARIANCE", "Material performance movement explained"],
    ["PLAN_APPROVED", "CYCLE", "Executive approval recorded"],
    ["BASELINE_LOCKED", "VERSION", "Operating baseline locked"],
  ];
  for (let index = 0; index < activities.length; index += 1) {
    const activity = activities[index];
    await create(prisma.planningAuditLog, {
      id: id(),
      modelId: primary.modelId,
      scenarioId: primary.scenarioIds.BASE,
      versionId: index > 7 ? primary.versionIds.MPC_LOCKED : primary.versionIds.WORKING,
      lineItemId: index === 3 ? primary.lineIds.HEADCOUNT : null,
      entityType: activity[1],
      userId: index > 7 ? roles.executiveSponsor.id : roles.planningLead.id,
      actionType: activity[0],
      oldValue: null,
      newValue: activity[2],
      reason: "FY2026 planning governance",
      ipAddress: "127.0.0.1",
    });
  }
  return varianceIds;
}

async function seedSettings(primary: Awaited<ReturnType<typeof seedPrimaryModel>>, userId: string) {
  await upsert(
    prisma.fpaSettings,
    { id: "default" },
    {
      id: "default",
      varianceJson: {
        commentaryThresholdPct: 5,
        enforceCommentary: true,
        blockSubmitWithoutCommentary: false,
        favorableColor: "GREEN",
        unfavorableColor: "RED",
        defaultComparison: "ACTUAL_VS_PLAN",
        requireCorrectiveAction: true,
      },
      workflowJson: {
        path: "LINEAR",
        requireCfoSignature: true,
        allowRerunAfterReturn: true,
        submissionReminderDays: [7, 3, 1],
        reviewSequence: ["DEPARTMENT_OWNER", "FINANCE_REVIEW", "EXECUTIVE_APPROVAL"],
        lockAfterApproval: true,
        requireVarianceCommentary: true,
      },
      updatedById: userId,
    }
  );
  const sources = [
    {
      id: "netsuite",
      label: "NetSuite",
      status: "DISCONNECTED",
      lastSyncAt: null,
      configJson: null,
    },
    {
      id: "general-ledger",
      label: "General Ledger",
      status: "CONNECTED",
      lastSyncAt: new Date("2026-07-14T22:00:00.000Z"),
      configJson: { cadence: "DAILY", scope: "ACTUALS_AND_BALANCES" },
    },
    {
      id: "workforce",
      label: "Workforce Management",
      status: "CONNECTED",
      lastSyncAt: new Date("2026-07-14T20:30:00.000Z"),
      configJson: { cadence: "WEEKLY", scope: "HEADCOUNT_AND_COMPENSATION" },
    },
    {
      id: "sales-pipeline",
      label: "Client Revenue Pipeline",
      status: "CONNECTED",
      lastSyncAt: new Date("2026-07-14T18:00:00.000Z"),
      configJson: { cadence: "DAILY", scope: "MANDATES_AND_FEES" },
    },
  ];
  for (const source of sources) {
    await upsert(prisma.fpaSyncSource, { id: source.id }, { ...source, lastError: null, updatedById: userId });
  }
  const rollingId = "arcus-fy2026-rolling";
  const rollingParameters = [
    rollingId,
    primary.modelId,
    primary.versionIds.WORKING,
    month(2026, 5),
    month(2026, 6),
    12,
    "DRIVER",
    userId,
    userId,
  ];
  inspectVisible(rollingParameters, "rollingForecastSettings");
  const rollingTable = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fpa_rolling_forecast_settings'`
  );
  if (Number(rollingTable[0]?.c ?? 0) > 0) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO fpa_rolling_forecast_settings
        (id, model_id, version_id, actuals_cutoff, forecast_start, horizon_months, active_method, created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))
       ON DUPLICATE KEY UPDATE
         version_id=VALUES(version_id),
         actuals_cutoff=VALUES(actuals_cutoff),
         forecast_start=VALUES(forecast_start),
         horizon_months=VALUES(horizon_months),
         active_method=VALUES(active_method),
         updated_by=VALUES(updated_by),
         updated_at=NOW(3)`,
      ...rollingParameters
    );
  } else {
    console.log("[seed-fpa] skip rolling forecast settings (table missing)");
  }
  return { syncSourceIds: sources.map((source) => source.id), rollingSettingsId: rollingId };
}

async function createExports(
  primary: Awaited<ReturnType<typeof seedPrimaryModel>>,
  userId: string,
  legacyCycleIds: Record<string, string>
) {
  const { FpaExportService } = await import("../src/services/fpa/FpaExportService");
  const exportTypes = ["BOARD_PACK", "MANAGEMENT_REPORT", "FINANCIAL_STATEMENTS", "DEPT_EXPENSES"];
  const jobs: Array<{ id: string; exportType: string; filename: string }> = [];
  for (const exportType of exportTypes) {
    const input = {
      modelId: primary.modelId,
      versionId: primary.versionIds.PUBLISHED,
      exportType,
      period: 2026,
      meta: {
        fiscalYear: 2026,
        budgetCycleId: legacyCycleIds.REVIEW,
        title: `Arcus Group FY2026 ${exportType.replaceAll("_", " ")}`,
      },
    };
    inspectVisible(input, `export.${exportType}`);
    const job = await FpaExportService.createBoardPack(input, userId, "127.0.0.1");
    jobs.push({ id: job.id, exportType, filename: job.filename });
  }
  return jobs;
}

async function main() {
  const database = await assertDevDatabase(prisma, "seed:fpa-client-presentation");
  if (database !== "nts" && database !== "arcus_dev") {
    throw new Error(`FP&A presentation seed is restricted to nts|arcus_dev; got ${database}`);
  }
  console.log("[seed-fpa] safety checks: database confirmed");
  await requireEmptyPlanningSchema();
  inspectVisible(
    {
      modules: MODULES,
      lines: LINES,
      scenarios: SCENARIOS,
      versions: VERSION_DEFINITIONS,
    },
    "presentationCatalog"
  );
  console.log("[seed-fpa] safety checks: empty schema and visible copy confirmed");

  const { roles } = await resolvePeople();
  const masters = await resolveMasters();
  console.log("[seed-fpa] shared masters: users, departments, entities, and accounts resolved");
  const dimensions = await seedDimensions();
  console.log("[seed-fpa] dimensions: planning dimensions created");
  const primary = await seedPrimaryModel(
    roles,
    masters.departments,
    masters.entities,
    masters.accounts,
    dimensions
  );
  console.log("[seed-fpa] primary model: integrated FY2026 dataset created");
  const draftModel = await seedCompanionModel(
    {
      name: "Arcus Group FY2027 Planning Framework",
      code: "ARCUS_GROUP_FY2027_FRAMEWORK",
      description: "Lightweight structure for the next annual planning horizon",
      status: "DRAFT",
      year: 2027,
      versionName: "FY2027 Initial Framework",
    },
    roles.planningLead.id
  );
  const historyModel = await seedCompanionModel(
    {
      name: "Arcus Group FY2024 Historical Plan",
      code: "ARCUS_GROUP_FY2024_HISTORY",
      description: "Retained historical planning structure for management comparison",
      status: "ARCHIVED",
      year: 2024,
      versionName: "FY2024 Final Archive",
    },
    roles.planningLead.id
  );
  console.log("[seed-fpa] companion models: draft and history structures created");
  const modelPlanning = await seedModelPlanningCycles(primary, roles, masters.departments);
  console.log("[seed-fpa] model planning: seven lifecycle cycles created");
  const legacyCycleIds = await seedLegacyCycles(primary, roles, masters.departments);
  console.log("[seed-fpa] budget planning: legacy lifecycle created");
  const varianceIds = await seedCollaborationAndVariance(primary, roles, modelPlanning);
  console.log("[seed-fpa] collaboration: variance, comments, approvals, and activity created");
  const settings = await seedSettings(primary, roles.planningLead.id);
  console.log("[seed-fpa] settings: variance, workflow, sync, and rolling forecast configured");
  const exportJobs = await createExports(primary, roles.planningLead.id, legacyCycleIds);
  console.log("[seed-fpa] exports: four XLSX workbooks created");

  const summary = {
    database: "nts",
    generatedFor: "Arcus Group FY2026 presentation",
    primary: {
      modelId: primary.modelId,
      moduleIds: primary.moduleIds,
      lineIds: primary.lineIds,
      scenarioIds: primary.scenarioIds,
      versionIds: primary.versionIds,
      dataSourceId: primary.dataSourceId,
    },
    companionModels: {
      draft: draftModel,
      history: historyModel,
    },
    modelPlanningCycleIds: modelPlanning.cycleIds,
    legacyBudgetCycleIds: legacyCycleIds,
    varianceIds,
    exportJobs,
    settings,
    presentationRoles: Object.fromEntries(
      Object.entries(roles).map(([role, person]) => [
        role,
        {
          userId: person.id,
          name: `${person.firstName} ${person.lastName}`,
          email: person.email,
        },
      ])
    ),
    sharedMasters: {
      entityIds: masters.entities.map((entity) => entity.id),
      departmentIds: masters.departments.map((department) => department.id),
      accountIds: masters.accounts.map((account) => account.id),
    },
  };
  inspectVisible(summary, "summary");
  console.log("[seed-fpa] SUMMARY");
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error("[seed-fpa] FAILED", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
