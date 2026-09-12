/**
 * Local-only portfolio / deal-flow seed (Contabo VPS unreachable — no dump available).
 * Recreates the working set we were using on arcus_dev: admin@nts.com, PE fund,
 * NTS + Arcus Demo applications at ACTIVE_DD with form data, docs, and DD task pack.
 *
 * Usage: npx ts-node --transpile-only -r dotenv/config scripts/seed-portfolio-v11-local-demo.ts
 */
// @ts-nocheck
import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient, Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { assertDevDatabase } from "./lib/assert-dev-database";
import { ActiveDdPmsTaskPackService } from "../src/services/ActiveDdPmsTaskPackService";

const prisma = new PrismaClient() as any;

const ADMIN_EMAIL = "admin@nts.com";
const ADMIN_PASSWORD = "admin123";

const NTS_FORM = {
  useOfFunds: [
    { category: "Product", description: "Platform build", allocation: "40" },
    { category: "Sales", description: "GTM hire", allocation: "35" },
    { category: "Ops", description: "Working capital", allocation: "25" },
  ],
  declarations: { accurate: true, consent: true },
  impactStatement: "Job creation and financial inclusion in Zimbabwe",
  esgPractices: "Basic ESG policy and board oversight",
  jobsCreated: "12",
  proposedOwnership: "15",
  fundingRound: "Seed",
  ownershipPercent: "60",
  boardComposition: "3 founders + 1 independent",
  keyShareholders: "Founders majority",
  productOverview: "Fintech platform",
  marketSize: "TAM regional",
  competitors: "Regional banks / fintechs",
  goToMarket: "B2B enterprise",
  revenueModel: "SaaS",
  historicalRevenue: "0.4M",
  projectedRevenue: "1.8M",
  burnRate: "45k/mo",
  runwayMonths: "10",
  fundingRationale: "Scale product and sales",
  milestones: "Series A readiness",
  existingInvestors: "None",
  preMoneyValuation: "10000000",
};

async function ensureAdmin() {
  let role = await prisma.role.findFirst({ where: { name: "admin" } });
  if (!role) {
    role = await prisma.role.create({
      data: {
        name: "admin",
        description: "Full access",
        permissions: [{ name: "view_dashboard", value: true }, { name: "manage_users", value: true }],
      },
    });
  }
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (existing) {
    return prisma.user.update({
      where: { id: existing.id },
      data: { password: hash, roleId: role.id, roleCode: "admin", firstName: "Admin", lastName: "NTS" },
    });
  }
  return prisma.user.create({
    data: {
      email: ADMIN_EMAIL,
      password: hash,
      firstName: "Admin",
      lastName: "NTS",
      roleId: role.id,
      roleCode: "admin",
    },
  });
}

async function ensureFund(adminId: string) {
  const existing = await prisma.fund.findFirst({
    where: { name: "Matanho Growth Fund I", fundPurpose: "PRIVATE_EQUITY" },
  });
  if (existing) return existing;
  const now = new Date();
  const end = new Date(now);
  end.setFullYear(end.getFullYear() + 2);
  return prisma.fund.create({
    data: {
      name: "Matanho Growth Fund I",
      description: "Local demo PE fund for Portfolio V11 (replaces Contabo arcus_dev sample).",
      totalAmount: new Decimal(50_000_000),
      remainingAmount: new Decimal(42_000_000),
      minInvestment: new Decimal(100_000),
      maxInvestment: new Decimal(5_000_000),
      focusIndustries: ["FinTech", "Enterprise Software", "AgriTech"],
      applicationStart: now,
      applicationEnd: end,
      status: "OPEN",
      fundPurpose: "PRIVATE_EQUITY",
      createdById: adminId,
    },
  });
}

async function ensureApplication(opts: {
  businessName: string;
  applicantName: string;
  applicantEmail: string;
  applicantPhone: string;
  applicantAddress: string;
  industry: string;
  businessStage: string;
  requestedAmount: number;
  dealReference: string;
  fundId: string;
  analystId: string;
  formData?: Record<string, unknown>;
  foundingDate?: Date;
  score?: number;
  description?: string;
}) {
  let app = await prisma.application.findFirst({
    where: {
      OR: [{ dealReference: opts.dealReference }, { businessName: opts.businessName }],
    },
  });
  const base = {
    applicantName: opts.applicantName,
    applicantEmail: opts.applicantEmail,
    applicantPhone: opts.applicantPhone,
    applicantAddress: opts.applicantAddress,
    businessName: opts.businessName,
    businessDescription:
      opts.description ||
      `${opts.businessName} — local demo application restored after Contabo VPS outage.`,
    industry: opts.industry,
    businessStage: opts.businessStage,
    requestedAmount: new Decimal(opts.requestedAmount),
    currentStage: "ACTIVE_DD",
    submittedAt: new Date("2026-08-01T10:00:00.000Z"),
    foundingDate: opts.foundingDate || new Date("2021-01-15T12:00:00.000Z"),
    fundId: opts.fundId,
    assignedAnalystId: opts.analystId,
    dealReference: opts.dealReference,
    initialScreeningScore: new Decimal(opts.score ?? 72),
    screeningScore: new Decimal(opts.score ?? 68),
    screeningOutcome: "SHORTLISTED",
    applicationFormData: opts.formData ? (opts.formData as Prisma.InputJsonValue) : undefined,
  };
  if (!app) {
    app = await prisma.application.create({ data: base });
    console.log(`[ok] created application ${opts.businessName} (${app.id})`);
  } else {
    app = await prisma.application.update({
      where: { id: app.id },
      data: {
        ...base,
        applicationFormData: opts.formData
          ? (opts.formData as Prisma.InputJsonValue)
          : app.applicationFormData,
      },
    });
    console.log(`[ok] updated application ${opts.businessName} (${app.id})`);
  }

  const docSpecs = [
    { documentType: "BUSINESS_PLAN", fileName: "1-business-plan.pdf" },
    { documentType: "PROOF_OF_CONCEPT", fileName: "2-proof-of-concept.pdf" },
    { documentType: "MARKET_RESEARCH", fileName: "3-market-research.pdf" },
  ];
  for (const d of docSpecs) {
    const exists = await prisma.applicationDocument.findFirst({
      where: { applicationId: app.id, documentType: d.documentType },
    });
    if (!exists) {
      await prisma.applicationDocument.create({
        data: {
          applicationId: app.id,
          documentType: d.documentType,
          fileName: d.fileName,
          fileUrl: `/funding-application/samples/${d.fileName}`,
          fileSize: 120_000,
          isRequired: true,
          isSubmitted: true,
        },
      });
    }
  }

  let dd = await prisma.dueDiligenceReview.findUnique({ where: { applicationId: app.id } });
  if (!dd) {
    dd = await prisma.dueDiligenceReview.create({
      data: {
        applicationId: app.id,
        reviewerId: opts.analystId,
        status: "IN_PROGRESS",
        overallScore: new Decimal(70),
        recommendation: "CONTINUE",
      },
    });
    console.log(`[ok] DD review for ${opts.businessName}`);
  }

  await ActiveDdPmsTaskPackService.ensureSeededForActiveDueDiligence({
    applicationId: app.id,
    assigneeUserId: opts.analystId,
    createdByUserId: opts.analystId,
    dealReference: opts.dealReference,
  });
  console.log(`[ok] DD task pack for ${opts.businessName}`);

  return app;
}

async function main() {
  await assertDevDatabase(prisma, "seed:portfolio-v11-local-demo");
  console.log("=== Portfolio V11 local demo seed ===");
  console.log("NOTE: Contabo dump unavailable — recreating known working set, not a byte-for-byte restore.");

  const admin = await ensureAdmin();
  console.log(`[ok] admin ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);

  const fund = await ensureFund(admin.id);
  console.log(`[ok] fund ${fund.name} (${fund.id})`);

  const nts = await ensureApplication({
    businessName: "NTS",
    applicantName: "Nyasha Karata",
    applicantEmail: "nyashakarata1@gmail.com",
    applicantPhone: "0772669677",
    applicantAddress: "123 road, Harare, Zimbabwe",
    industry: "FinTech",
    businessStage: "Seed",
    requestedAmount: 1_500_000,
    dealReference: "VST-2026-000002",
    fundId: fund.id,
    analystId: admin.id,
    formData: NTS_FORM,
    foundingDate: new Date("2026-08-05T12:00:00.000Z"),
    score: 62,
    description:
      "NTS FinTech platform — local restore of the Contabo demo deal used in Portfolio V11 Deal Detail.",
  });

  const demo = await ensureApplication({
    businessName: "Arcus Demo Investee Co",
    applicantName: "Investee Tester",
    applicantEmail: "investee.test@arcus.co.zw",
    applicantPhone: "+263770000001",
    applicantAddress: "1 Demo Street, Harare",
    industry: "Technology",
    businessStage: "GROWTH",
    requestedAmount: 250_000,
    dealReference: "VST-2026-000001",
    fundId: fund.id,
    analystId: admin.id,
    formData: {
      useOfFunds: [
        { category: "Product", allocation: "50", description: "Core build" },
        { category: "Hiring", allocation: "50", description: "Engineers" },
      ],
      declarations: { accurate: true, consent: true },
      proposedOwnership: "10",
      fundingRound: "Series A",
      impactStatement: "Demo investee impact statement",
      esgPractices: "Demo ESG",
    },
    score: 75,
  });

  console.log("");
  console.log("Seeded deals:");
  console.log(`  NTS id=${nts.id} ref=${nts.dealReference}`);
  console.log(`  Demo id=${demo.id} ref=${demo.dealReference}`);
  console.log(`Login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
