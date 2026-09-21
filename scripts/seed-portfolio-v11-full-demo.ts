/**
 * Expand Portfolio module demo data beyond deals:
 * - PortfolioCompany rows (companies + dashboard)
 * - Fund report templates / schedules / distribution lists (reporting + mailer)
 * - Open SpCashReservation rows (reservations)
 * - SpCashStatementImport + external statement stubs (statement imports)
 *
 * Prerequisites (run first):
 *   npm run db:seed:portfolio-v11-local-demo
 *   npm run db:seed:investments-v2-demo
 *   npm run db:seed:stock-picker-cash
 *   npm run db:seed:lp-portal-srd
 *   npm run db:seed:fundraising-client-demo
 *
 * Usage: npx ts-node --transpile-only -r dotenv/config scripts/seed-portfolio-v11-full-demo.ts
 */
// @ts-nocheck
import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient, Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { assertDevDatabase } from "./lib/assert-dev-database";

const prisma = new PrismaClient() as any;

const COMPANIES = [
  {
    email: "company.nts@arcus.co.zw",
    password: "admin123",
    name: "NTS",
    registrationNumber: "REG-NTS-2026-0002",
    industry: "FinTech",
    address: "123 road, Harare, Zimbabwe",
    contactPerson: "Nyasha Karata",
    contactEmail: "nyashakarata1@gmail.com",
    contactPhone: "0772669677",
    fundingStage: "SEED",
    status: "ACTIVE",
    employeeCount: 12,
    annualRevenue: 420000,
  },
  {
    email: "company.arcusdemo@arcus.co.zw",
    password: "admin123",
    name: "Arcus Demo Investee Co",
    registrationNumber: "REG-ARCUS-DEMO-0001",
    industry: "Technology",
    address: "1 Demo Street, Harare",
    contactPerson: "Investee Tester",
    contactEmail: "investee.test@arcus.co.zw",
    contactPhone: "+263770000001",
    fundingStage: "SERIES_A",
    status: "ACTIVE",
    employeeCount: 28,
    annualRevenue: 890000,
  },
  {
    email: "company.greenorbit@arcus.co.zw",
    password: "admin123",
    name: "GreenOrbit Energy",
    registrationNumber: "REG-GREEN-2026-0003",
    industry: "Energy",
    address: "45 Samora Machel Ave, Harare",
    contactPerson: "Tariro Moyo",
    contactEmail: "tariro@greenorbit.example",
    contactPhone: "+263771112233",
    fundingStage: "GROWTH",
    status: "ACTIVE",
    employeeCount: 64,
    annualRevenue: 2100000,
  },
  {
    email: "company.mukuru@arcus.co.zw",
    password: "admin123",
    name: "Mukuru Logistics",
    registrationNumber: "REG-MUKURU-2026-0004",
    industry: "Logistics",
    address: "8 Industrial Rd, Bulawayo",
    contactPerson: "Farai Chikore",
    contactEmail: "farai@mukuru.example",
    contactPhone: "+263772223344",
    fundingStage: "SERIES_B",
    status: "ACTIVE",
    employeeCount: 110,
    annualRevenue: 5400000,
  },
];

async function ensureRole() {
  let role = await prisma.role.findFirst({ where: { name: "INVESTEE" } });
  if (!role) {
    role = await prisma.role.findFirst({ where: { name: { contains: "Investee" } } });
  }
  if (!role) {
    role = await prisma.role.findFirst({ where: { name: "USER" } });
  }
  if (!role) {
    role = await prisma.role.create({
      data: { name: "INVESTEE", description: "Portfolio company user", permissions: {} },
    });
  }
  return role;
}

async function ensureFund() {
  let fund = await prisma.fund.findFirst({ where: { name: "Matanho Growth Fund I" } });
  if (!fund) {
    fund = await prisma.fund.findFirst({ orderBy: { createdAt: "asc" } });
  }
  return fund;
}

async function ensureCompanies(fundId: string | null) {
  const role = await ensureRole();
  const out = [];
  for (const c of COMPANIES) {
    let user = await prisma.user.findUnique({ where: { email: c.email } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: c.email,
          password: await bcrypt.hash(c.password, 10),
          firstName: c.contactPerson.split(" ")[0] || "Company",
          lastName: c.contactPerson.split(" ").slice(1).join(" ") || "User",
          roleId: role.id,
        },
      });
    }
    let company = await prisma.portfolioCompany.findUnique({ where: { userId: user.id } });
    if (!company) {
      company = await prisma.portfolioCompany.findFirst({
        where: { registrationNumber: c.registrationNumber },
      });
    }
    if (!company) {
      company = await prisma.portfolioCompany.create({
        data: {
          userId: user.id,
          name: c.name,
          registrationNumber: c.registrationNumber,
          industry: c.industry,
          foundingDate: new Date("2020-01-15T00:00:00.000Z"),
          address: c.address,
          description: `${c.name} — Portfolio V11 full demo company`,
          status: c.status,
          companySize: "MEDIUM",
          employeeCount: c.employeeCount,
          annualRevenue: new Decimal(c.annualRevenue),
          fundingStage: c.fundingStage,
          contactPerson: c.contactPerson,
          contactPhone: c.contactPhone,
          contactEmail: c.contactEmail,
          fundId: fundId || null,
          socialMedia: {},
        },
      });
      console.log(`[ok] created company ${c.name} (${company.id})`);
    } else {
      company = await prisma.portfolioCompany.update({
        where: { id: company.id },
        data: {
          name: c.name,
          industry: c.industry,
          status: c.status,
          fundId: fundId || company.fundId,
          annualRevenue: new Decimal(c.annualRevenue),
          employeeCount: c.employeeCount,
        },
      });
      console.log(`[ok] updated company ${c.name} (${company.id})`);
    }
    out.push(company);
  }
  return out;
}

async function ensureCompanyInvestments(fundId: string, adminId: string, companies: any[]) {
  const amounts = {
    NTS: 1_250_000,
    "Arcus Demo Investee Co": 2_400_000,
    "GreenOrbit Energy": 1_800_000,
    "Mukuru Logistics": 3_100_000,
  };

  for (const company of companies) {
    let app = await prisma.application.findFirst({
      where: { businessName: company.name },
      orderBy: { createdAt: "desc" },
    });
    if (!app) {
      app = await prisma.application.create({
        data: {
          fundId,
          requestedAmount: new Decimal(amounts[company.name] || 1_000_000),
          currentStage: "ACTIVE_DD",
          submittedAt: new Date("2026-01-15T10:00:00.000Z"),
          applicantAddress: company.address || "Harare",
          applicantEmail: company.contactEmail || `ops@${company.name.replace(/\s+/g, "").toLowerCase()}.example`,
          applicantName: company.contactPerson || company.name,
          applicantPhone: company.contactPhone || "+263770000000",
          businessDescription: `${company.name} portfolio investment for V11 demo`,
          businessName: company.name,
          businessStage: company.fundingStage || "GROWTH",
          industry: company.industry || "Technology",
          foundingDate: company.foundingDate || new Date("2020-01-15"),
          complianceCleared: true,
          kycVerified: true,
          dealReference: `PV11-${company.registrationNumber || company.id.slice(-6)}`,
        },
      });
      console.log(`[ok] application for ${company.name}`);
    }

    let impl = await prisma.investmentImplementation.findUnique({
      where: { portfolioCompanyId: company.id },
    });
    if (!impl) {
      const byApp = await prisma.investmentImplementation.findUnique({
        where: { applicationId: app.id },
      });
      if (byApp) {
        console.log(`[skip] implementation already on app ${app.id} for different company`);
        continue;
      }
      impl = await prisma.investmentImplementation.create({
        data: {
          portfolioCompanyId: company.id,
          applicationId: app.id,
          fundId,
          initiatedById: adminId,
          finalDueDiligence: true,
          contractsSigned: true,
          fundsDisbursed: true,
          status: "COMPLETED",
          disbursementMode: "ONE_TIME",
          totalCommittedAmount: new Decimal(amounts[company.name] || 1_000_000),
          notes: "Portfolio V11 full demo investment",
          completedAt: new Date("2026-03-01T00:00:00.000Z"),
        },
      });
      console.log(`[ok] investment implementation ${company.name}`);
    }

    const existingDisb = await prisma.fundDisbursement.findFirst({
      where: { investmentImplementationId: impl.id },
    });
    if (!existingDisb) {
      await prisma.fundDisbursement.create({
        data: {
          fundId,
          investmentImplementationId: impl.id,
          amount: new Decimal(amounts[company.name] || 1_000_000),
          disbursementDate: new Date("2026-03-15T00:00:00.000Z"),
          disbursementType: "EQUITY",
          status: "DISBURSED",
          disbursedById: adminId,
          disbursedAt: new Date("2026-03-15T00:00:00.000Z"),
          notes: "PV11 full demo disbursement",
          transactionReference: `PV11-DISB-${company.registrationNumber || company.id.slice(-6)}`,
        },
      });
      console.log(`[ok] disbursement ${company.name}`);
    }
  }
}

async function ensureReportingAndMailer(fundId: string, adminId: string) {
  let template = await prisma.fundReportTemplate.findFirst({
    where: { name: "ILPA Quarterly LP Pack", fundId },
  });
  if (!template) {
    template = await prisma.fundReportTemplate.create({
      data: {
        fundId,
        name: "ILPA Quarterly LP Pack",
        reportLevel: "FUND",
        description: "Quarterly LP pack for Portfolio module demo",
        sectionConfig: {
          sections: ["Cover", "Performance", "Cash Flows", "Portfolio", "Notes"],
        },
        isActive: true,
        createdById: adminId,
      },
    });
    console.log(`[ok] report template ${template.id}`);
  }

  let list = await prisma.fundReportDistributionList.findFirst({
    where: { fundId, name: "Primary LP Distribution" },
  });
  if (!list) {
    list = await prisma.fundReportDistributionList.create({
      data: {
        fundId,
        name: "Primary LP Distribution",
        sourceType: "ROLE_CODES",
        roleCodes: ["LP_SIGNATORY", "LP_VIEWER"],
        isActive: true,
      },
    });
    console.log(`[ok] mailer list ${list.id}`);
  }

  let list2 = await prisma.fundReportDistributionList.findFirst({
    where: { fundId, name: "Board & IC Distribution" },
  });
  if (!list2) {
    list2 = await prisma.fundReportDistributionList.create({
      data: {
        fundId,
        name: "Board & IC Distribution",
        sourceType: "ROLE_CODES",
        roleCodes: ["CEO", "CIO", "BOARD"],
        isActive: true,
      },
    });
    console.log(`[ok] mailer list ${list2.id}`);
  }

  const schedules = [
    {
      name: "Q2 2026 LP Report",
      periodType: "QUARTERLY",
      cronExpression: "0 8 15 1,4,7,10 *",
      dayOfMonth: 15,
      daysFromNow: 11,
    },
    {
      name: "Monthly Cash Pack",
      periodType: "MONTHLY",
      cronExpression: "0 7 5 * *",
      dayOfMonth: 5,
      daysFromNow: 5,
    },
    {
      name: "Annual Valuation Pack",
      periodType: "ANNUAL",
      cronExpression: "0 9 20 3 *",
      dayOfMonth: 20,
      daysFromNow: 28,
    },
    {
      name: "Board Pack — Portfolio Update",
      periodType: "MONTHLY",
      cronExpression: "0 9 22 * *",
      dayOfMonth: 22,
      daysFromNow: 18,
    },
  ];

  for (const sch of schedules) {
    const nextRunAt = new Date();
    nextRunAt.setDate(nextRunAt.getDate() + sch.daysFromNow);
    nextRunAt.setHours(8, 0, 0, 0);
    let row = await prisma.fundReportSchedule.findFirst({
      where: { fundId, name: sch.name },
    });
    if (!row) {
      row = await prisma.fundReportSchedule.create({
        data: {
          fundId,
          templateId: template.id,
          name: sch.name,
          periodType: sch.periodType,
          cronExpression: sch.cronExpression,
          timezone: "Africa/Harare",
          dayOfMonth: sch.dayOfMonth,
          hourOfDay: 8,
          isActive: true,
          nextRunAt,
          distributionListId: list.id,
        },
      });
      console.log(`[ok] schedule ${row.name} due ${nextRunAt.toISOString().slice(0, 10)}`);
    } else {
      row = await prisma.fundReportSchedule.update({
        where: { id: row.id },
        data: { nextRunAt, isActive: true },
      });
      console.log(`[ok] refreshed schedule ${row.name} due ${nextRunAt.toISOString().slice(0, 10)}`);
    }
  }

  // Published / in-review report runs for Reports Vault live path
  const runSeeds = [
    { status: "COMPLETED", daysAgo: 18, label: "Q2 LP Pack" },
    { status: "COMPLETED", daysAgo: 6, label: "IC Pack" },
    { status: "RUNNING", daysAgo: 1, label: "Cash Evidence" },
  ];
  for (const [i, run] of runSeeds.entries()) {
    const periodEnd = new Date();
    periodEnd.setDate(periodEnd.getDate() - run.daysAgo);
    const periodStart = new Date(periodEnd);
    periodStart.setDate(periodStart.getDate() - 90);
    const existing = await prisma.fundReportRun.findFirst({
      where: {
        fundId,
        templateId: template.id,
        errorMessage: `PV11-VAULT-${i}`,
      },
    });
    if (!existing) {
      await prisma.fundReportRun.create({
        data: {
          fundId,
          templateId: template.id,
          periodStart,
          periodEnd,
          status: run.status,
          triggerType: "MANUAL",
          triggeredById: adminId,
          targetCount: 12 + i * 8,
          compiledCount: run.status === "COMPLETED" ? 12 + i * 8 : 4,
          dispatchedCount: run.status === "COMPLETED" ? 12 + i * 8 : 0,
          deliveredCount: run.status === "COMPLETED" ? 10 + i * 6 : 0,
          startedAt: periodEnd,
          completedAt: run.status === "COMPLETED" ? periodEnd : null,
          errorMessage: `PV11-VAULT-${i}`,
        },
      });
      console.log(`[ok] report run ${run.label} (${run.status})`);
    }
  }
}

async function ensureCashExtras(adminId: string) {
  const accounts = await prisma.spCashClientAccount.findMany({
    where: { status: { in: ["ACTIVE", "DRAFT"] } },
    take: 10,
    orderBy: { createdAt: "asc" },
  });
  if (!accounts.length) {
    console.log("[skip] cash extras — no SpCashClientAccount rows (run db:seed:stock-picker-cash first)");
    return;
  }

  const primary = accounts[0];

  // Open reservations
  for (const [i, amt] of [
    ["250000.00", "CAPITAL_CALL"],
    ["85000.00", "FEE_PAYMENT"],
    ["120000.00", "DISTRIBUTION"],
    ["45000.00", "OPERATING"],
  ].entries()) {
    const idem = `pv11-full-res-${primary.id}-${i}`;
    const existing = await prisma.spCashReservation.findUnique({
      where: { idempotencyKey: idem },
    });
    if (existing) {
      await prisma.spCashReservation.update({
        where: { id: existing.id },
        data: {
          status: "OPEN",
          remainingAmount: new Decimal(amt[0]),
          originalAmount: new Decimal(amt[0]),
          purpose: amt[1],
        },
      });
      console.log(`[ok] reservation ${idem}`);
      continue;
    }
    await prisma.spCashReservation.create({
      data: {
        idempotencyKey: idem,
        portfolioId: primary.portfolioId,
        cashAccountId: primary.id,
        currency: primary.currency || "USD",
        originalAmount: new Decimal(amt[0]),
        remainingAmount: new Decimal(amt[0]),
        requiredDate: new Date("2026-09-30"),
        expiryDate: new Date("2026-12-31"),
        purpose: amt[1],
        status: "OPEN",
        makerId: adminId,
        version: 1,
      },
    });
    console.log(`[ok] created reservation ${idem}`);
  }

  // Statement import stubs
  for (const [i, name] of [
    "CBZ_Jul_2026_USD.csv",
    "CBZ_Aug_2026_USD.xlsx",
  ].entries()) {
    const fileHash = `pv11-full-hash-${primary.id}-${i}`;
    const existing = await prisma.spCashStatementImport.findFirst({
      where: { cashAccountId: primary.id, fileHash },
    });
    if (existing) {
      console.log(`[ok] statement import exists ${name}`);
      continue;
    }

    await prisma.spCashStatementImport.create({
      data: {
        providerId: primary.providerId,
        cashAccountId: primary.id,
        currency: primary.currency || "USD",
        fileName: name,
        fileHash,
        status: i === 0 ? "COMMITTED" : "VALIDATED",
        controlOpening: new Decimal(i === 0 ? "8500.00" : "10000.00"),
        controlClosing: new Decimal(i === 0 ? "10000.00" : "14250.00"),
        lineCount: 24 + i * 8,
        maker: "admin@nts.com",
        makerId: adminId,
        version: 1,
        committedAt: i === 0 ? new Date("2026-08-02T10:00:00.000Z") : null,
      },
    });
    console.log(`[ok] created statement import ${name}`);
  }
}

async function ensureCapitalCalls(fundId: string, adminId: string) {
  let currency = await prisma.currency.findFirst({ where: { code: "USD" } });
  if (!currency) {
    currency = await prisma.currency.create({
      data: { code: "USD", name: "US Dollar", symbol: "$" },
    });
    console.log(`[ok] created currency USD`);
  }

  const clients = await prisma.client.findMany({ take: 3, orderBy: { createdAt: "asc" } });
  if (!clients.length) {
    console.log("[skip] capital calls — no Client rows (run db:seed:lp-portal-srd first)");
    return;
  }

  const commitments = [];
  for (const [i, client] of clients.entries()) {
    const amount = [25_000_000, 12_500_000, 8_000_000][i] || 5_000_000;
    let commitment = await prisma.investmentCommitment.findUnique({
      where: { clientId_fundId: { clientId: client.id, fundId } },
    });
    if (!commitment) {
      commitment = await prisma.investmentCommitment.create({
        data: {
          clientId: client.id,
          fundId,
          amount: new Decimal(amount),
          currency: "USD",
          effectiveDate: new Date("2025-01-15"),
          status: "ACTIVE",
          notes: "Portfolio V11 full demo commitment",
        },
      });
      console.log(`[ok] commitment ${client.legalName} ${amount}`);
    }
    commitments.push({ client, commitment });
  }

  const marker = "PV11-FULL-CC-MARKER";
  let cc = await prisma.capitalCall.findFirst({
    where: { fundId, bankInstructions: { contains: marker } },
  });
  const due = new Date();
  due.setDate(due.getDate() + 21);
  const wiring = JSON.stringify({
    marker,
    bankName: "CBZ Bank",
    accountName: "Matanho Growth Fund I",
    accountNumberMasked: "••••4821",
    reference: "CC-MGF-I-001",
  });
  if (!cc) {
    cc = await prisma.capitalCall.create({
      data: {
        fundId,
        currencyId: currency.id,
        callPercent: new Decimal("5.000000"),
        paymentDueDate: due,
        bankInstructions: wiring,
        transactionDate: new Date(),
        status: "NOTICES_SENT",
        noticesSentAt: new Date(),
        createdById: adminId,
      },
    });
    console.log(`[ok] capital call ${cc.id}`);
  } else {
    cc = await prisma.capitalCall.update({
      where: { id: cc.id },
      data: {
        status: "NOTICES_SENT",
        bankInstructions: wiring,
        paymentDueDate: due,
        noticesSentAt: cc.noticesSentAt || new Date(),
      },
    });
    console.log(`[ok] updated capital call ${cc.id}`);
  }

  for (const [{ client, commitment }, idx] of commitments.map((c, i) => [c, i] as const)) {
    let alloc = await prisma.capitalCallAllocation.findFirst({
      where: { capitalCallId: cc.id, clientId: client.id },
    });
    const callAmount = Number(commitment.amount) * 0.05;
    const paidShare = idx === 0 ? callAmount : idx === 1 ? callAmount * 0.55 : 0;
    if (!alloc) {
      alloc = await prisma.capitalCallAllocation.create({
        data: {
          capitalCallId: cc.id,
          clientId: client.id,
          investmentCommitmentId: commitment.id,
          lpLegalNameSnapshot: client.legalName,
          totalCommitmentSnapshot: commitment.amount,
          uncalledCapitalBeforeSnapshot: commitment.amount,
          currentCallAmount: new Decimal(callAmount),
          amountPaid: new Decimal(paidShare),
          status: paidShare >= callAmount ? "PAID" : paidShare > 0 ? "PARTIAL" : "OUTSTANDING",
        },
      });
      console.log(`[ok] allocation ${client.legalName} ${callAmount} paid=${paidShare}`);
    } else {
      await prisma.capitalCallAllocation.update({
        where: { id: alloc.id },
        data: {
          currentCallAmount: new Decimal(callAmount),
          amountPaid: new Decimal(paidShare),
          status: paidShare >= callAmount ? "PAID" : paidShare > 0 ? "PARTIAL" : "OUTSTANDING",
        },
      });
      console.log(`[ok] refreshed allocation ${client.legalName} paid=${paidShare}`);
    }
  }

  // Second draft call for pipeline richness
  const marker2 = "PV11-FULL-CC-MARKER-2";
  let cc2 = await prisma.capitalCall.findFirst({
    where: { fundId, bankInstructions: { contains: marker2 } },
  });
  if (!cc2) {
    cc2 = await prisma.capitalCall.create({
      data: {
        fundId,
        currencyId: currency.id,
        callPercent: new Decimal("2.500000"),
        paymentDueDate: new Date("2026-10-31"),
        bankInstructions: JSON.stringify({ marker: marker2, reference: "CC-MGF-I-002" }),
        transactionDate: new Date("2026-09-01"),
        status: "INITIATED",
        createdById: adminId,
      },
    });
    const first = commitments[0];
    await prisma.capitalCallAllocation.create({
      data: {
        capitalCallId: cc2.id,
        clientId: first.client.id,
        investmentCommitmentId: first.commitment.id,
        lpLegalNameSnapshot: first.client.legalName,
        totalCommitmentSnapshot: first.commitment.amount,
        uncalledCapitalBeforeSnapshot: first.commitment.amount,
        currentCallAmount: new Decimal(Number(first.commitment.amount) * 0.025),
        amountPaid: new Decimal(0),
        status: "OUTSTANDING",
      },
    });
    console.log(`[ok] draft capital call ${cc2.id}`);
  }
}

async function main() {
  await assertDevDatabase(prisma, "seed:portfolio-v11-full-demo");
  console.log("=== Portfolio V11 FULL demo seed ===");

  const admin =
    (await prisma.user.findUnique({ where: { email: "admin@nts.com" } })) ||
    (await prisma.user.findFirst({ orderBy: { createdAt: "asc" } }));
  if (!admin) throw new Error("No admin user — run portfolio-v11-local-demo first");

  const fund = await ensureFund();
  console.log(`[ok] fund ${fund?.name || "(none)"} (${fund?.id || "n/a"})`);

  await ensureCompanies(fund?.id || null);
  const companies = await prisma.portfolioCompany.findMany({
    where: {
      registrationNumber: {
        in: COMPANIES.map((c) => c.registrationNumber),
      },
    },
  });
  if (fund?.id) {
    await ensureCompanyInvestments(fund.id, admin.id, companies);
    await ensureReportingAndMailer(fund.id, admin.id);
    await ensureCapitalCalls(fund.id, admin.id);
  } else {
    console.log("[skip] reporting/mailer/capital calls/investments — no fund");
  }
  await ensureCashExtras(admin.id);

  console.log("");
  console.log("Done. Login admin@nts.com / admin123 and refresh /portfolio pages.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
