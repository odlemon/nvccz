/**
 * Seed a realistic Fundraising & Investor Relations dataset.
 *
 * Idempotent: every row uses a deterministic `frs-*` id and is written with
 * upsert, so re-running converges rather than duplicating. Safe to run repeatedly.
 *
 * Usage: npm run db:seed:fundraising-demo
 *
 * Scope: fundraising_* and investor_* tables only. Creates no schema changes.
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

const SEED_EMAIL = process.env.FR_SEED_OWNER_EMAIL || "perf.sysadmin@nts.local";

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}
function dec(n: number | string): Prisma.Decimal {
  return new Prisma.Decimal(n);
}

async function main() {
  const owner = await prisma.user.findFirst({
    where: { email: SEED_EMAIL },
    select: { id: true },
  });
  if (!owner) throw new Error(`Seed owner not found: ${SEED_EMAIL}`);
  const by = owner.id;

  // Secondary owners so "owner performance" analytics has more than one bar.
  const others = await prisma.user.findMany({
    where: { email: { in: ["perf.exec@nts.local", "perf.deptmgr@nts.local", "perf.hr@nts.local"] } },
    select: { id: true, email: true },
  });
  const ownerPool = [by, ...others.map((u) => u.id)];
  const pick = (i: number) => ownerPool[i % ownerPool.length];

  console.log(`Seeding fundraising dataset (owner ${SEED_EMAIL})`);

  // ---------------------------------------------------------------- campaigns
  const campaigns = [
    {
      id: "frs-camp-pe3",
      campaignType: "PE_FUNDRAISE",
      name: "Arcus Growth Fund III",
      description: "Third-vintage growth equity vehicle targeting SADC mid-market.",
      targetCapital: 120_000_000,
      minimumTargetAmount: 60_000_000,
      hardCapAmount: 150_000_000,
      startDate: d("2026-01-15"),
      closeDate: d("2027-06-30"),
      firstCloseTargetDate: d("2026-09-30"),
      finalCloseTargetDate: d("2027-06-30"),
      status: "ACTIVE",
      approvalStatus: "APPROVED",
      regionTags: ["SADC", "East Africa"],
      investorSegments: ["PENSION_FUND", "DFI", "FAMILY_OFFICE"],
    },
    {
      id: "frs-camp-am1",
      campaignType: "INSTITUTIONAL_MANDATE",
      name: "SADC Institutional Mandate Programme",
      description: "Segregated mandate programme for regional pension funds.",
      targetCapital: 75_000_000,
      minimumTargetAmount: 40_000_000,
      hardCapAmount: 90_000_000,
      startDate: d("2026-03-01"),
      closeDate: d("2027-03-31"),
      firstCloseTargetDate: d("2026-11-30"),
      finalCloseTargetDate: d("2027-03-31"),
      status: "ACTIVE",
      approvalStatus: "APPROVED",
      regionTags: ["Zimbabwe", "Zambia", "Botswana"],
      investorSegments: ["PENSION_FUND", "INSURANCE"],
    },
    {
      id: "frs-camp-vc2",
      campaignType: "VC_FUNDRAISE",
      name: "Arcus Ventures Seed II",
      description: "Early-stage technology vehicle. Pre-marketing.",
      targetCapital: 25_000_000,
      minimumTargetAmount: 15_000_000,
      hardCapAmount: 30_000_000,
      startDate: d("2026-07-01"),
      closeDate: d("2027-12-31"),
      firstCloseTargetDate: d("2027-03-31"),
      finalCloseTargetDate: d("2027-12-31"),
      status: "DRAFT",
      approvalStatus: "PENDING",
      regionTags: ["Zimbabwe"],
      investorSegments: ["FAMILY_OFFICE", "HNWI"],
    },
  ];

  for (const c of campaigns) {
    const data = {
      campaignType: c.campaignType,
      name: c.name,
      description: c.description,
      targetCapital: dec(c.targetCapital),
      minimumTargetAmount: dec(c.minimumTargetAmount),
      hardCapAmount: dec(c.hardCapAmount),
      primaryCurrency: "USD",
      startDate: c.startDate,
      closeDate: c.closeDate,
      firstCloseTargetDate: c.firstCloseTargetDate,
      finalCloseTargetDate: c.finalCloseTargetDate,
      regionTags: c.regionTags as Prisma.InputJsonValue,
      investorSegments: c.investorSegments as Prisma.InputJsonValue,
      status: c.status,
      approvalStatus: c.approvalStatus,
      campaignOwnerId: by,
      createdById: by,
    };
    await prisma.fundraisingCampaign.upsert({
      where: { id: c.id },
      create: { id: c.id, ...data },
      update: data,
    });
  }
  console.log(`  campaigns: ${campaigns.length}`);

  // ------------------------------------------------------------------ stages
  // Stages are copied from the active pipeline templates, matching the
  // campaignType -> pipelineKey rule in FundraisingFeGapsService.
  const AM_TYPES = new Set(["INSTITUTIONAL_MANDATE", "SEGREGATED_MANDATE", "AM_MANDATE"]);
  const templates = await prisma.fundraisingPipelineTemplate.findMany({
    where: { isActive: true },
  });
  let stageCount = 0;
  const stageIdByCampaignAndCode = new Map<string, string>();
  for (const c of campaigns) {
    const key = AM_TYPES.has(c.campaignType) ? "AM" : "PE_VC";
    const rows = templates
      .filter((t) => t.pipelineKey === key)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    for (const t of rows) {
      const id = `frs-stage-${c.id}-${t.stageCode}`.toLowerCase();
      const data = {
        campaignId: c.id,
        stageCode: t.stageCode,
        stageName: t.stageName,
        sortOrder: t.sortOrder,
        winProbabilityPct: t.winProbabilityPct,
        gateRules: (t.gateRules ?? Prisma.DbNull) as Prisma.InputJsonValue,
      };
      await prisma.fundraisingPipelineStage.upsert({
        where: { id },
        create: { id, ...data },
        update: data,
      });
      stageIdByCampaignAndCode.set(`${c.id}|${t.stageCode}`, id);
      stageCount++;
    }
  }
  console.log(`  pipeline stages: ${stageCount}`);

  // --------------------------------------------------------------- investors
  const investors = [
    ["frs-inv-01", "Zimbabwe National Pension Authority", "ZNPA", "PENSION_FUND", "ZW", "Zimbabwe", 850_000_000, "APPROVED", "CLEAR", "LOW"],
    ["frs-inv-02", "Old Mutual Zimbabwe Life Assurance", "OM Zimbabwe", "INSURANCE", "ZW", "Zimbabwe", 620_000_000, "APPROVED", "CLEAR", "LOW"],
    ["frs-inv-03", "Southern Africa Development Bank", "SADB", "DFI", "BW", "Botswana", 2_400_000_000, "APPROVED", "CLEAR", "LOW"],
    ["frs-inv-04", "Mopani Family Office Ltd", "Mopani FO", "FAMILY_OFFICE", "ZM", "Zambia", 145_000_000, "IN_PROGRESS", "CLEAR", "MEDIUM"],
    ["frs-inv-05", "Harare Municipal Employees Fund", "HMEF", "PENSION_FUND", "ZW", "Zimbabwe", 310_000_000, "APPROVED", "CLEAR", "LOW"],
    ["frs-inv-06", "Kalahari Sovereign Wealth Trust", "Kalahari SWT", "SOVEREIGN_WEALTH", "BW", "Botswana", 5_100_000_000, "IN_PROGRESS", "IN_REVIEW", "MEDIUM"],
    ["frs-inv-07", "Lusaka Insurance Group PLC", "LIG", "INSURANCE", "ZM", "Zambia", 275_000_000, "NOT_STARTED", "NOT_SCREENED", null],
    ["frs-inv-08", "Nyati Capital Partners", "Nyati Capital", "FUND_OF_FUNDS", "ZA", "South Africa", 480_000_000, "APPROVED", "CLEAR", "LOW"],
    ["frs-inv-09", "Victoria Falls Endowment Trust", "VF Endowment", "ENDOWMENT", "ZW", "Zimbabwe", 92_000_000, "IN_PROGRESS", "CLEAR", "MEDIUM"],
    ["frs-inv-10", "Meridian Global Advisors (Mauritius)", "Meridian GA", "ASSET_MANAGER", "MU", "Mauritius", 1_150_000_000, "BLOCKED", "HIT", "HIGH"],
  ] as const;

  const sources = ["DIRECT", "REFERRAL", "PLACEMENT_AGENT", "CONFERENCE", "INBOUND"];
  for (let i = 0; i < investors.length; i++) {
    const [id, legalName, tradingName, investorType, countryCode, jurisdiction, aum, kycStatus, sanctionsStatus, riskRating] =
      investors[i];
    const data = {
      legalName,
      tradingName,
      investorType,
      registrationNumber: `REG-${String(1000 + i)}`,
      countryCode,
      jurisdiction,
      baseCurrency: "USD",
      estimatedAum: dec(aum),
      typicalMinimumTicket: dec(1_000_000),
      typicalMaximumTicket: dec(Math.round(aum * 0.05)),
      assetClassPreferences: ["PRIVATE_EQUITY", "INFRASTRUCTURE"] as Prisma.InputJsonValue,
      geographicInterests: ["SADC"] as Prisma.InputJsonValue,
      relationshipOwnerId: pick(i),
      source: sources[i % sources.length],
      status: "ACTIVE",
      kycStatus,
      sanctionsStatus,
      riskRating,
      investorClassification: i % 3 === 0 ? "PROFESSIONAL" : "INSTITUTIONAL",
      lastInteractionAt: new Date(Date.UTC(2026, 7, 10 + (i % 15))),
      nextAction: i % 2 === 0 ? "Follow up on allocation appetite" : "Schedule diligence session",
      nextActionDate: d(`2026-09-${String(12 + (i % 14)).padStart(2, "0")}`),
      complianceHoldActive: kycStatus === "BLOCKED",
      createdById: by,
    };
    await prisma.investorOrganisation.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    });
  }
  console.log(`  investor organisations: ${investors.length}`);

  // ---------------------------------------------------------------- contacts
  const roles = ["Chief Investment Officer", "Head of Alternatives", "Portfolio Manager", "Trustee", "Finance Director"];
  const influences = ["DECISION_MAKER", "INFLUENCER", "GATEKEEPER", "CHAMPION"];
  const firstNames = ["Tendai", "Rutendo", "Farai", "Chipo", "Tapiwa", "Nyasha", "Kudzai", "Anesu", "Tafadzwa", "Simba",
    "Blessing", "Munashe", "Rufaro", "Takudzwa", "Vimbai", "Panashe", "Tinashe", "Shamiso", "Batsirai", "Mazvita"];
  const lastNames = ["Moyo", "Ncube", "Dube", "Sibanda", "Chirwa", "Mutasa", "Zvobgo", "Marange", "Nyoni", "Chigumba"];
  let contactCount = 0;
  for (let i = 0; i < investors.length; i++) {
    const investorId = investors[i][0];
    const n = i % 3 === 0 ? 3 : 2; // 10 investors -> 24 contacts
    for (let j = 0; j < n; j++) {
      const idx = i * 3 + j;
      const fullName = `${firstNames[idx % firstNames.length]} ${lastNames[(idx * 3) % lastNames.length]}`;
      const id = `frs-contact-${String(idx + 1).padStart(3, "0")}`;
      const data = {
        investorId,
        fullName,
        roleTitle: roles[idx % roles.length],
        department: j === 0 ? "Investments" : "Operations",
        email: `${fullName.toLowerCase().replace(/\s+/g, ".")}.${idx}@example.com`,
        phone: `+263 77 ${String(1000000 + idx * 7919).slice(0, 7)}`,
        decisionInfluence: influences[idx % influences.length],
        communicationConsent: idx % 7 !== 0,
        isPrimary: j === 0,
        lastInteractionAt: new Date(Date.UTC(2026, 7, 5 + (idx % 20))),
        nextAction: j === 0 ? "Share updated teaser" : null,
        nextActionDate: j === 0 ? d(`2026-09-${String(15 + (idx % 12)).padStart(2, "0")}`) : null,
        status: "ACTIVE",
        createdById: by,
      };
      await prisma.investorContact.upsert({
        where: { id },
        create: { id, ...data },
        update: data,
      });
      contactCount++;
    }
  }
  console.log(`  investor contacts: ${contactCount}`);

  // ----------------------------------------------------------- opportunities
  // Spread across stages so the pipeline board, funnel and stage-ageing
  // analytics all have distribution rather than a single column.
  type OppSpec = {
    n: number; campaignId: string; investorIdx: number; stageCode: string;
    indicative: number; status?: string; lostReason?: string; priority: string;
    signed?: number; admitted?: number; funded?: number;
  };
  const opps: OppSpec[] = [
    { n: 1, campaignId: "frs-camp-pe3", investorIdx: 0, stageCode: "FUNDED", indicative: 15_000_000, priority: "HIGH", signed: 15_000_000, admitted: 15_000_000, funded: 15_000_000 },
    { n: 2, campaignId: "frs-camp-pe3", investorIdx: 2, stageCode: "FUNDED", indicative: 25_000_000, priority: "HIGH", signed: 25_000_000, admitted: 25_000_000, funded: 20_000_000 },
    { n: 3, campaignId: "frs-camp-pe3", investorIdx: 1, stageCode: "SIGNED", indicative: 12_000_000, priority: "HIGH", signed: 12_000_000 },
    { n: 4, campaignId: "frs-camp-pe3", investorIdx: 4, stageCode: "SUBSCRIPTION_DOCS", indicative: 8_000_000, priority: "MEDIUM" },
    { n: 5, campaignId: "frs-camp-pe3", investorIdx: 7, stageCode: "KYC_COMPLIANCE", indicative: 10_000_000, priority: "HIGH" },
    { n: 6, campaignId: "frs-camp-pe3", investorIdx: 3, stageCode: "DUE_DILIGENCE", indicative: 5_000_000, priority: "MEDIUM" },
    { n: 7, campaignId: "frs-camp-pe3", investorIdx: 8, stageCode: "DATA_ROOM", indicative: 3_500_000, priority: "LOW" },
    { n: 8, campaignId: "frs-camp-pe3", investorIdx: 5, stageCode: "ENGAGED", indicative: 20_000_000, priority: "HIGH" },
    { n: 9, campaignId: "frs-camp-pe3", investorIdx: 6, stageCode: "CONTACTED", indicative: 4_000_000, priority: "LOW" },
    { n: 10, campaignId: "frs-camp-pe3", investorIdx: 9, stageCode: "QUALIFIED", indicative: 6_000_000, priority: "MEDIUM", status: "LOST", lostReason: "Sanctions screening hit — relationship paused" },
    { n: 11, campaignId: "frs-camp-am1", investorIdx: 0, stageCode: "ACTIVATED", indicative: 18_000_000, priority: "HIGH", signed: 18_000_000, admitted: 18_000_000, funded: 18_000_000 },
    { n: 12, campaignId: "frs-camp-am1", investorIdx: 4, stageCode: "AWARDED", indicative: 9_000_000, priority: "HIGH", signed: 9_000_000, admitted: 9_000_000 },
    { n: 13, campaignId: "frs-camp-am1", investorIdx: 1, stageCode: "NEGOTIATION", indicative: 11_000_000, priority: "HIGH" },
    { n: 14, campaignId: "frs-camp-am1", investorIdx: 5, stageCode: "PRESENTATION", indicative: 14_000_000, priority: "MEDIUM" },
    { n: 15, campaignId: "frs-camp-am1", investorIdx: 8, stageCode: "RFI_RFP", indicative: 7_000_000, priority: "MEDIUM" },
    { n: 16, campaignId: "frs-camp-am1", investorIdx: 6, stageCode: "DISCOVERY", indicative: 5_500_000, priority: "LOW" },
  ];

  const stageProbByCode = new Map(templates.map((t) => [t.stageCode, Number(t.winProbabilityPct)]));
  for (const o of opps) {
    const id = `frs-opp-${String(o.n).padStart(3, "0")}`;
    const stageId = stageIdByCampaignAndCode.get(`${o.campaignId}|${o.stageCode}`);
    if (!stageId) throw new Error(`missing stage ${o.stageCode} for ${o.campaignId}`);
    const investorId = investors[o.investorIdx][0];
    const primaryContact = await prisma.investorContact.findFirst({
      where: { investorId, isPrimary: true },
      select: { id: true },
    });
    const data = {
      campaignId: o.campaignId,
      investorId,
      primaryContactId: primaryContact?.id ?? null,
      currentStageId: stageId,
      opportunityType: o.campaignId === "frs-camp-am1" ? "SEGREGATED_MANDATE" : "LP_COMMITMENT",
      opportunityCurrency: "USD",
      indicativeAmount: dec(o.indicative),
      qualifiedAmount: dec(o.indicative),
      softCircleAmount: o.signed ? dec(o.signed) : null,
      proposedAmount: o.signed ? dec(o.signed) : null,
      signedAmount: o.signed ? dec(o.signed) : null,
      admittedAmount: o.admitted ? dec(o.admitted) : null,
      fundedAmount: dec(o.funded ?? 0),
      expectedAum: dec(o.indicative),
      activatedAum: dec(o.funded ?? 0),
      stageProbability: dec(stageProbByCode.get(o.stageCode) ?? 50),
      confidenceAdjustment: dec(1),
      expectedCloseDate: d(`2026-1${o.n % 3}-15`.replace("1-", "1-")),
      opportunityOwnerId: pick(o.n),
      priority: o.priority,
      status: o.status ?? "OPEN",
      lostReason: o.lostReason ?? null,
      source: sources[o.n % sources.length],
      createdById: by,
    };
    await prisma.fundraisingOpportunity.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    });
  }
  console.log(`  opportunities: ${opps.length}`);

  // ------------------------------------------------------- stage/amount history
  // SRD acceptance criterion 15: "Complete stage and amount histories are retained", and
  // section 7: an amount must never be overwritten without preserving the former value,
  // reason and author. Walk each opportunity from the first stage up to its current one so
  // the timeline and the stage-ageing analytics have real transitions to read.
  let stageHistCount = 0;
  let amountHistCount = 0;
  for (const o of opps) {
    const oppId = `frs-opp-${String(o.n).padStart(3, "0")}`;
    const key = AM_TYPES.has(
      campaigns.find((c) => c.id === o.campaignId)!.campaignType,
    ) ? "AM" : "PE_VC";
    const ladder = templates
      .filter((t) => t.pipelineKey === key)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const targetIdx = ladder.findIndex((t) => t.stageCode === o.stageCode);

    for (let i = 0; i <= targetIdx; i++) {
      const to = ladder[i];
      const from = i > 0 ? ladder[i - 1] : null;
      const id = `${oppId}-sh-${String(i).padStart(2, "0")}`;
      const data = {
        opportunityId: oppId,
        fromStageId: from ? stageIdByCampaignAndCode.get(`${o.campaignId}|${from.stageCode}`)! : null,
        toStageId: stageIdByCampaignAndCode.get(`${o.campaignId}|${to.stageCode}`)!,
        fromStageCode: from?.stageCode ?? null,
        toStageCode: to.stageCode,
        reason: from ? `Advanced from ${from.stageName} to ${to.stageName}` : "Opportunity created",
        changedById: by,
        // Space the transitions out so "days in stage" is a real interval, not zero.
        changedAt: new Date(Date.UTC(2026, 4, 1) + (i * 9 + (o.n % 5)) * 864e5),
      };
      await prisma.opportunityStageHistory.upsert({
        where: { id },
        create: { id, ...data },
        update: data,
      });
      stageHistCount++;
    }

    // One amount record per value the opportunity actually reached.
    const amountSteps: Array<[string, number | undefined]> = [
      ["INDICATIVE", o.indicative],
      ["SIGNED", o.signed],
      ["ADMITTED", o.admitted],
      ["FUNDED", o.funded],
    ];
    let prev: number | null = null;
    let step = 0;
    for (const [amountType, value] of amountSteps) {
      if (value == null) continue;
      const id = `${oppId}-ah-${String(step).padStart(2, "0")}`;
      const data = {
        opportunityId: oppId,
        amountType,
        oldValue: prev == null ? null : dec(prev),
        newValue: dec(value),
        currency: "USD",
        reason: prev == null ? "Initial indication captured" : `${amountType.toLowerCase()} amount confirmed`,
        changedById: by,
        changedAt: new Date(Date.UTC(2026, 5, 1) + (step * 14 + (o.n % 7)) * 864e5),
      };
      await prisma.opportunityAmountHistory.upsert({
        where: { id },
        create: { id, ...data },
        update: data,
      });
      prev = value;
      step++;
      amountHistCount++;
    }
  }
  console.log(`  stage history: ${stageHistCount}, amount history: ${amountHistCount}`);

  // ------------------------------------------------------------- commitments
  const commitSpecs = opps.filter((o) => o.signed);
  for (const o of commitSpecs) {
    const id = `frs-commit-${String(o.n).padStart(3, "0")}`;
    const funded = o.funded ?? 0;
    const data = {
      opportunityId: `frs-opp-${String(o.n).padStart(3, "0")}`,
      investorId: investors[o.investorIdx][0],
      campaignId: o.campaignId,
      currency: "USD",
      commitmentAmount: dec(o.signed!),
      fundedAmount: dec(funded),
      unfundedAmount: dec(o.signed! - funded),
      // Canonical statuses come from FundraisingSrdService (admitCommitment /
      // fundCommitment): SIGNED -> ADMITTED_AT_CLOSE -> PARTIALLY_FUNDED -> FUNDED.
      // "ADMITTED" is not one of them and would silently drop the row out of every
      // commitment KPI bucket on the frontend.
      status:
        funded >= o.signed!
          ? "FUNDED"
          : funded > 0
            ? "PARTIALLY_FUNDED"
            : o.admitted
              ? "ADMITTED_AT_CLOSE"
              : "SIGNED",
      signedAt: new Date(Date.UTC(2026, 6, 10 + (o.n % 18))),
      admissionDate: o.admitted ? new Date(Date.UTC(2026, 7, 1 + (o.n % 20))) : null,
      complianceStatus: "CLEARED",
      accountingStatus: funded > 0 ? "POSTED" : "PENDING",
      capitalCallContact: "capital.calls@arcus.example",
      createdById: by,
    };
    await prisma.fundraisingCommitment.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    });
  }
  console.log(`  commitments: ${commitSpecs.length}`);

  // ---------------------------------------------------------------- closings
  const closings = [
    { id: "frs-close-01", campaignId: "frs-camp-pe3", name: "Fund III First Close", closeType: "FIRST_CLOSE", closingDate: d("2026-09-30"), status: "COMPLETED", target: 50_000_000, total: 52_000_000, legal: true, comp: true, fund: true, closedAt: new Date(Date.UTC(2026, 8, 30)) },
    { id: "frs-close-02", campaignId: "frs-camp-pe3", name: "Fund III Second Close", closeType: "INTERIM_CLOSE", closingDate: d("2026-12-15"), status: "SCHEDULED", target: 40_000_000, total: 20_000_000, legal: true, comp: false, fund: false, closedAt: null },
    { id: "frs-close-03", campaignId: "frs-camp-am1", name: "Mandate Programme Activation", closeType: "FINAL_CLOSE", closingDate: d("2027-03-31"), status: "PLANNED", target: 30_000_000, total: 27_000_000, legal: false, comp: false, fund: false, closedAt: null },
  ];
  for (const c of closings) {
    const data = {
      campaignId: c.campaignId,
      name: c.name,
      closeType: c.closeType,
      closingDate: c.closingDate,
      status: c.status,
      targetAmount: dec(c.target),
      totalCommitmentValue: dec(c.total),
      legalReady: c.legal,
      complianceReady: c.comp,
      fundReady: c.fund,
      equalisationStatus: c.status === "COMPLETED" ? "APPLIED" : "NOT_APPLICABLE",
      notes: `${c.name} — readiness tracked against legal, compliance and fund operations.`,
      closedAt: c.closedAt,
      createdById: by,
    };
    await prisma.fundraisingClosing.upsert({
      where: { id: c.id },
      create: { id: c.id, ...data },
      update: data,
    });
  }
  console.log(`  closings: ${closings.length}`);

  // ---------------------------------------------------- mandates, RFPs, KYC
  const mandates = [
    { id: "frs-mandate-01", investorIdx: 0, name: "ZNPA Segregated Growth Mandate", status: "ACTIVE", expectedAum: 18_000_000, activatedAum: 18_000_000, flags: true, stageCode: "ACTIVATED", stageName: "Activated" },
    { id: "frs-mandate-02", investorIdx: 4, name: "HMEF Balanced Mandate", status: "ONBOARDING", expectedAum: 9_000_000, activatedAum: 0, flags: false, stageCode: "AWARDED", stageName: "Awarded" },
    { id: "frs-mandate-03", investorIdx: 1, name: "Old Mutual Infrastructure Sleeve", status: "NEGOTIATION", expectedAum: 11_000_000, activatedAum: 0, flags: false, stageCode: "NEGOTIATION", stageName: "Negotiation" },
  ];
  for (const m of mandates) {
    const data = {
      investorId: investors[m.investorIdx][0],
      campaignId: "frs-camp-am1",
      name: m.name,
      status: m.status,
      expectedAum: dec(m.expectedAum),
      activatedAum: dec(m.activatedAum),
      currency: "USD",
      agreementSigned: m.flags,
      kycApproved: m.flags,
      guidelinesConfigured: m.flags,
      benchmarkConfigured: m.flags,
      feesConfigured: m.flags,
      reportingConfigured: m.flags,
      custodianConfirmed: m.flags,
      openingBalancesVerified: m.flags,
      assetsReceived: m.flags,
      activatedAt: m.status === "ACTIVE" ? new Date(Date.UTC(2026, 7, 20)) : null,
      assetClass: "MULTI_ASSET",
      geography: "SADC",
      stageCode: m.stageCode,
      stageName: m.stageName,
      ownerId: by,
      createdById: by,
    };
    await prisma.fundraisingMandate.upsert({
      where: { id: m.id },
      create: { id: m.id, ...data },
      update: data,
    });
  }

  const rfps = [
    { id: "frs-rfp-01", investorIdx: 0, institution: "Zimbabwe National Pension Authority", status: "SUBMITTED", deadline: d("2026-10-15"), fit: 82 },
    { id: "frs-rfp-02", investorIdx: 5, institution: "Kalahari Sovereign Wealth Trust", status: "SHORTLISTED", deadline: d("2026-11-20"), fit: 74 },
    { id: "frs-rfp-03", investorIdx: 1, institution: "Old Mutual Zimbabwe Life Assurance", status: "WON", deadline: d("2026-08-01"), fit: 91 },
    { id: "frs-rfp-04", investorIdx: 6, institution: "Lusaka Insurance Group PLC", status: "LOST", deadline: d("2026-07-10"), fit: 48 },
  ];
  for (const r of rfps) {
    const data = {
      investorId: investors[r.investorIdx][0],
      campaignId: "frs-camp-am1",
      referenceNumber: r.id.toUpperCase(),
      institutionName: r.institution,
      deadline: r.deadline,
      presentationDate: new Date(r.deadline.getTime() + 7 * 864e5),
      status: r.status,
      outcome: r.status === "WON" ? "AWARDED" : r.status === "LOST" ? "NOT_SELECTED" : null,
      lossReason: r.status === "LOST" ? "Fee structure above peer range" : null,
      assetClass: "MULTI_ASSET",
      geography: "SADC",
      fitScore: dec(r.fit),
      stageCode: "RFI_RFP",
      stageName: "RFI / RFP",
      createdById: by,
    };
    await prisma.fundraisingRfp.upsert({
      where: { id: r.id },
      create: { id: r.id, ...data },
      update: data,
    });
  }

  const kycSpecs = [
    { id: "frs-kyc-01", investorIdx: 3, status: "IN_PROGRESS", risk: "MEDIUM", pep: false, adverse: false },
    { id: "frs-kyc-02", investorIdx: 5, status: "IN_REVIEW", risk: "MEDIUM", pep: true, adverse: false },
    { id: "frs-kyc-03", investorIdx: 9, status: "BLOCKED", risk: "HIGH", pep: true, adverse: true },
    { id: "frs-kyc-04", investorIdx: 0, status: "APPROVED", risk: "LOW", pep: false, adverse: false },
  ];
  for (const k of kycSpecs) {
    const data = {
      investorId: investors[k.investorIdx][0],
      status: k.status,
      riskRating: k.risk,
      pepFlag: k.pep,
      adverseMediaFlag: k.adverse,
      docsNote: k.status === "BLOCKED" ? "Adverse media hit pending legal review." : "Standard document set received.",
      ownerId: by,
      approvedById: k.status === "APPROVED" ? by : null,
      decidedAt: k.status === "APPROVED" ? new Date(Date.UTC(2026, 6, 25)) : null,
      createdById: by,
    };
    await prisma.fundraisingKycCase.upsert({
      where: { id: k.id },
      create: { id: k.id, ...data },
      update: data,
    });
  }
  console.log(`  mandates: ${mandates.length}, rfps: ${rfps.length}, kyc cases: ${kycSpecs.length}`);

  // --------------------------------------------------------------------- DDQ
  const ddqTemplateId = "frs-ddq-tmpl-01";
  const ddqQuestions = [
    { key: "ORG_STRUCTURE", category: "Organisation", requirement: "Describe the firm's legal and ownership structure." },
    { key: "TRACK_RECORD", category: "Performance", requirement: "Provide audited track record for the last five vintages." },
    { key: "TEAM_BIOS", category: "Organisation", requirement: "Provide biographies of the investment committee." },
    { key: "ESG_POLICY", category: "ESG", requirement: "Summarise the ESG policy and exclusion list." },
    { key: "VALUATION_POLICY", category: "Operations", requirement: "Describe the valuation policy and independent review process." },
    { key: "COMPLIANCE_AML", category: "Compliance", requirement: "Describe AML/CFT procedures and sanctions screening." },
    { key: "FEE_STRUCTURE", category: "Commercial", requirement: "Set out management fee, carry and hurdle." },
    { key: "SERVICE_PROVIDERS", category: "Operations", requirement: "List administrator, auditor, custodian and legal counsel." },
  ];
  {
    const data = {
      name: "Institutional Standard DDQ (2026)",
      category: "STANDARD",
      questionsJson: ddqQuestions as unknown as Prisma.InputJsonValue,
      createdById: by,
    };
    await prisma.fundraisingDdqTemplate.upsert({
      where: { id: ddqTemplateId },
      create: { id: ddqTemplateId, ...data },
      update: data,
    });
  }

  for (const q of ddqQuestions) {
    const id = `frs-ddq-lib-${q.key.toLowerCase()}`;
    const data = {
      questionKey: q.key,
      category: q.category,
      approvedAnswer:
        `Approved standard response for "${q.requirement}" — maintained by the IR team and reviewed annually by Compliance.`,
      version: 1,
      status: "APPROVED",
      approvedById: by,
      approvedAt: new Date(Date.UTC(2026, 5, 30)),
      createdById: by,
    };
    await prisma.fundraisingDdqAnswerLibraryEntry.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    });
  }

  const ddqCases = [
    { id: "frs-ddq-case-01", investorIdx: 0, oppN: 1, title: "ZNPA — Fund III DDQ", status: "APPROVED", answered: 8 },
    { id: "frs-ddq-case-02", investorIdx: 2, oppN: 2, title: "SADB — Fund III DDQ", status: "IN_REVIEW", answered: 6 },
    { id: "frs-ddq-case-03", investorIdx: 3, oppN: 6, title: "Mopani FO — Fund III DDQ", status: "IN_PROGRESS", answered: 3 },
  ];
  for (const c of ddqCases) {
    const pct = Math.round((c.answered / ddqQuestions.length) * 100);
    const data = {
      investorId: investors[c.investorIdx][0],
      campaignId: "frs-camp-pe3",
      opportunityId: `frs-opp-${String(c.oppN).padStart(3, "0")}`,
      templateId: ddqTemplateId,
      title: c.title,
      status: c.status,
      progressPct: dec(pct),
      ownerId: by,
      submittedAt: c.status !== "IN_PROGRESS" ? new Date(Date.UTC(2026, 7, 12)) : null,
      approvedAt: c.status === "APPROVED" ? new Date(Date.UTC(2026, 7, 22)) : null,
      createdById: by,
    };
    await prisma.fundraisingDdqCase.upsert({
      where: { id: c.id },
      create: { id: c.id, ...data },
      update: data,
    });

    for (let i = 0; i < ddqQuestions.length; i++) {
      const q = ddqQuestions[i];
      const itemId = `${c.id}-item-${String(i + 1).padStart(2, "0")}`;
      const answered = i < c.answered;
      const itemData = {
        caseId: c.id,
        category: q.category,
        requirement: q.requirement,
        status: answered ? (c.status === "APPROVED" ? "APPROVED" : "ANSWERED") : "OUTSTANDING",
        ownerId: by,
        dueDate: d("2026-10-05"),
        version: 1,
        questionKey: q.key,
        reviewerComments: answered && i === 0 ? "Cross-checked against the answer library." : null,
      };
      await prisma.fundraisingDdqItem.upsert({
        where: { id: itemId },
        create: { id: itemId, ...itemData },
        update: itemData,
      });
    }
  }
  console.log(`  ddq: 1 template, ${ddqQuestions.length} library entries, ${ddqCases.length} cases`);

  // -------------------------------------------------------------- data rooms
  const dataRooms = [
    { id: "frs-dataroom-01", campaignId: "frs-camp-pe3", name: "Fund III Primary Data Room", status: "ACTIVE", mfa: true },
    { id: "frs-dataroom-02", campaignId: "frs-camp-am1", name: "Mandate Programme Data Room", status: "ACTIVE", mfa: false },
  ];
  for (const r of dataRooms) {
    const data = {
      campaignId: r.campaignId,
      name: r.name,
      status: r.status,
      requiresMfa: r.mfa,
      expiresAt: new Date(Date.UTC(2027, 5, 30)),
      defaultWatermarkEnabled: true,
      defaultDownloadLimit: 25,
      createdById: by,
    };
    await prisma.fundraisingDataRoom.upsert({
      where: { id: r.id },
      create: { id: r.id, ...data },
      update: data,
    });
  }

  // Folders, documents, grants and access events, so the data-room screen's "Documents"
  // and "Views (7d)" tiles and its activity export have something real to report.
  const roomFolders = ["Fund Documents", "Legal", "Financials", "ESG", "Track Record"];
  let folderCount = 0;
  let roomDocCount = 0;
  let accessCount = 0;
  let accessLogCount = 0;
  for (const room of dataRooms) {
    for (let i = 0; i < roomFolders.length; i++) {
      const folderId = `${room.id}-folder-${i + 1}`;
      const fdata = { dataRoomId: room.id, parentId: null, name: roomFolders[i], sortOrder: i + 1 };
      await prisma.fundraisingDataRoomFolder.upsert({
        where: { id: folderId },
        create: { id: folderId, ...fdata },
        update: fdata,
      });
      folderCount++;

      for (let j = 0; j < 2; j++) {
        const docId = `${folderId}-doc-${j + 1}`;
        const ddata = {
          dataRoomId: room.id,
          folderId,
          fileName: `${roomFolders[i].replace(/\s+/g, "-").toLowerCase()}-${j + 1}.pdf`,
          mimeType: "application/pdf",
          viewOnly: j === 0,
          downloadLimit: j === 0 ? 0 : 10,
          watermarkEnabled: true,
          createdById: by,
        };
        await prisma.fundraisingDataRoomDocument.upsert({
          where: { id: docId },
          create: { id: docId, ...ddata },
          update: ddata,
        });
        roomDocCount++;
      }
    }

    // Grant three investors access to each room, one of them revoked.
    for (let i = 0; i < 3; i++) {
      const investorId = investors[i][0];
      const accId = `${room.id}-access-${i + 1}`;
      const contact = await prisma.investorContact.findFirst({
        where: { investorId, isPrimary: true },
        select: { id: true },
      });
      const adata = {
        dataRoomId: room.id,
        investorId,
        contactId: contact?.id ?? null,
        expiresAt: new Date(Date.UTC(2027, 2, 31)),
        permissionLevel: i === 0 ? "DOWNLOAD" : "VIEW",
        downloadLimit: i === 0 ? 25 : 0,
        watermarkEnabled: true,
        revokedAt: i === 2 ? new Date(Date.UTC(2026, 7, 28)) : null,
        revokedById: i === 2 ? by : null,
        revokeReason: i === 2 ? "Opportunity closed lost" : null,
        createdById: by,
      };
      await prisma.fundraisingDataRoomAccess.upsert({
        where: { id: accId },
        create: { id: accId, ...adata },
        update: adata,
      });
      accessCount++;

      // Recent views so the "Views (7d)" tile is non-zero against a real window.
      for (let k = 0; k < 3; k++) {
        const logId = `${accId}-log-${k + 1}`;
        const ldata = {
          dataRoomId: room.id,
          documentId: `${room.id}-folder-${(k % roomFolders.length) + 1}-doc-1`,
          investorId,
          userId: by,
          action: k === 2 ? "DOWNLOAD" : "VIEW",
          success: true,
          ipAddress: `196.43.${i}.${k + 10}`,
          device: k % 2 === 0 ? "Chrome / Windows" : "Safari / macOS",
          country: investors[i][4],
          createdAt: new Date(Date.now() - (k + 1) * 36e5 * 12),
        };
        await prisma.fundraisingDataRoomAccessLog.upsert({
          where: { id: logId },
          create: { id: logId, ...ldata },
          update: ldata,
        });
        accessLogCount++;
      }
    }
  }
  console.log(
    `  data room folders: ${folderCount}, documents: ${roomDocCount}, grants: ${accessCount}, access events: ${accessLogCount}`,
  );

  // --------------------------------------------------------- communications
  const interactionTypes = ["EMAIL", "CALL", "MEETING", "ROADSHOW", "CONFERENCE"];
  const sentiments = ["POSITIVE", "NEUTRAL", "NEGATIVE"];
  let commCount = 0;
  for (let i = 0; i < 18; i++) {
    const o = opps[i % opps.length];
    const id = `frs-comm-${String(i + 1).padStart(3, "0")}`;
    const investorId = investors[o.investorIdx][0];
    const contact = await prisma.investorContact.findFirst({
      where: { investorId, isPrimary: true },
      select: { id: true },
    });
    const data = {
      campaignId: o.campaignId,
      opportunityId: `frs-opp-${String(o.n).padStart(3, "0")}`,
      investorId,
      contactId: contact?.id ?? null,
      interactionType: interactionTypes[i % interactionTypes.length],
      subject: `${interactionTypes[i % interactionTypes.length]} — ${investors[o.investorIdx][2]} follow-up`,
      summary: "Discussed allocation appetite, timing and remaining diligence items.",
      outcome: i % 4 === 0 ? "Advance to next stage" : "Continue dialogue",
      sentiment: sentiments[i % sentiments.length],
      confidentiality: i % 6 === 0 ? "RESTRICTED" : "INTERNAL",
      nextAction: "Send follow-up pack",
      dueDate: new Date(Date.UTC(2026, 8, 15 + (i % 12))),
      ownerId: pick(i),
      occurredAt: new Date(Date.UTC(2026, 7, 1 + (i % 28), 9, 30)),
      createdById: by,
    };
    await prisma.fundraisingCommunication.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    });
    commCount++;
  }
  console.log(`  data rooms: ${dataRooms.length}, communications: ${commCount}`);

  // ---------------------------------------------------------------- meetings
  const meetingTypes = ["INTRO_CALL", "DILIGENCE_SESSION", "IC_PRESENTATION", "SITE_VISIT", "ANNUAL_REVIEW"];
  const meetingStatuses = ["SCHEDULED", "COMPLETED", "CANCELLED"];
  let meetingCount = 0;
  for (let i = 0; i < 12; i++) {
    const o = opps[i % opps.length];
    const id = `frs-meeting-${String(i + 1).padStart(3, "0")}`;
    const status = i < 6 ? "SCHEDULED" : meetingStatuses[i % meetingStatuses.length];
    const start = new Date(Date.UTC(2026, 8, 10 + (i % 20), 10, 0));
    const data = {
      title: `${meetingTypes[i % meetingTypes.length].replace(/_/g, " ")} — ${investors[o.investorIdx][2]}`,
      meetingType: meetingTypes[i % meetingTypes.length],
      scheduledStart: start,
      scheduledEnd: new Date(start.getTime() + 60 * 60 * 1000),
      timezone: "Africa/Harare",
      location: i % 2 === 0 ? "Arcus House, Harare" : null,
      videoLink: i % 2 === 1 ? "https://meet.example.com/arcus-ir" : null,
      campaignId: o.campaignId,
      investorId: investors[o.investorIdx][0],
      opportunityId: `frs-opp-${String(o.n).padStart(3, "0")}`,
      ownerId: pick(i),
      agenda: "1. Fund overview  2. Track record  3. Terms  4. Next steps",
      status,
      discussionNotes: status === "COMPLETED" ? "Investor confirmed appetite; awaiting IC slot." : null,
      outcomeSummary: status === "COMPLETED" ? "Progressing to diligence." : null,
      completedAt: status === "COMPLETED" ? new Date(start.getTime() + 3600e3) : null,
      completedById: status === "COMPLETED" ? by : null,
      cancelReason: status === "CANCELLED" ? "Investor rescheduled" : null,
      createdById: by,
    };
    await prisma.fundraisingMeeting.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    });
    meetingCount++;
  }
  console.log(`  meetings: ${meetingCount}`);

  // --------------------------------------------------------------- documents
  const docCats = ["TEASER", "PPM", "LPA", "SUBSCRIPTION", "DDQ_RESPONSE", "SIDE_LETTER", "KYC", "REPORT"];
  let docCount = 0;
  for (let i = 0; i < 16; i++) {
    const o = opps[i % opps.length];
    const id = `frs-doc-${String(i + 1).padStart(3, "0")}`;
    const cat = docCats[i % docCats.length];
    const data = {
      name: `${cat.replace(/_/g, " ")} — ${investors[o.investorIdx][2]} v${(i % 3) + 1}.pdf`,
      category: cat,
      sourceType: i % 3 === 0 ? "CAMPAIGN" : "OPPORTUNITY",
      sourceId: i % 3 === 0 ? o.campaignId : `frs-opp-${String(o.n).padStart(3, "0")}`,
      campaignId: o.campaignId,
      investorId: investors[o.investorIdx][0],
      opportunityId: `frs-opp-${String(o.n).padStart(3, "0")}`,
      confidential: i % 4 === 0,
      status: i % 5 === 0 ? "DRAFT" : "FINAL",
      fileName: `${cat.toLowerCase()}-${i + 1}.pdf`,
      mimeType: "application/pdf",
      currentVersionNumber: (i % 3) + 1,
      createdById: by,
    };
    await prisma.fundraisingDocument.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    });
    docCount++;
  }
  console.log(`  documents: ${docCount}`);

  // -------------------------------------------------------- placement agents
  const agents = [
    { id: "frs-agent-01", legalName: "Meridian Placement Partners", territory: "Europe", pct: 2.0, retainer: 25_000, success: 150_000, status: "ACTIVE", accrued: 320_000, paid: 180_000 },
    { id: "frs-agent-02", legalName: "Savannah Capital Advisors", territory: "SADC", pct: 1.5, retainer: 15_000, success: 90_000, status: "ACTIVE", accrued: 210_000, paid: 210_000 },
    { id: "frs-agent-03", legalName: "Gulf Bridge Distribution", territory: "Middle East", pct: 2.5, retainer: 40_000, success: 200_000, status: "PENDING", accrued: 0, paid: 0 },
    { id: "frs-agent-04", legalName: "Atlantic IR Partners", territory: "North America", pct: 2.25, retainer: 30_000, success: 175_000, status: "TERMINATED", accrued: 95_000, paid: 95_000 },
  ];
  for (const a of agents) {
    const data = {
      legalName: a.legalName,
      territory: a.territory,
      geographyJson: [a.territory] as Prisma.InputJsonValue,
      commissionPct: dec(a.pct),
      retainer: dec(a.retainer),
      successFee: dec(a.success),
      appointmentStart: d("2026-01-01"),
      appointmentEnd: d("2027-12-31"),
      protectedUntil: d("2028-06-30"),
      status: a.status,
      commissionStatus: a.paid >= a.accrued && a.accrued > 0 ? "SETTLED" : a.accrued > 0 ? "ACCRUING" : "NONE",
      accruedCommission: dec(a.accrued),
      paidCommission: dec(a.paid),
      createdById: by,
    };
    await prisma.fundraisingPlacementAgent.upsert({
      where: { id: a.id },
      create: { id: a.id, ...data },
      update: data,
    });
  }
  console.log(`  placement agents: ${agents.length}`);

  // --------------------------------------------------------------- approvals
  const approvals = [
    { id: "frs-appr-01", objectType: "CAMPAIGN", objectId: "frs-camp-vc2", requestType: "CAMPAIGN_ACTIVATION", status: "PENDING", amount: 25_000_000 },
    { id: "frs-appr-02", objectType: "COMMITMENT", objectId: "frs-commit-003", requestType: "COMMITMENT_APPROVAL", status: "PENDING", amount: 12_000_000 },
    { id: "frs-appr-03", objectType: "COMMITMENT", objectId: "frs-commit-001", requestType: "COMMITMENT_APPROVAL", status: "APPROVED", amount: 15_000_000 },
    { id: "frs-appr-04", objectType: "CLOSING", objectId: "frs-close-01", requestType: "CLOSING_SIGN_OFF", status: "APPROVED", amount: 52_000_000 },
    { id: "frs-appr-05", objectType: "OPPORTUNITY", objectId: "frs-opp-010", requestType: "STAGE_OVERRIDE", status: "REJECTED", amount: 6_000_000 },
  ];
  for (const a of approvals) {
    const decided = a.status !== "PENDING";
    const data = {
      objectType: a.objectType,
      objectId: a.objectId,
      requestType: a.requestType,
      status: a.status,
      requestedById: by,
      decidedById: decided ? by : null,
      reason: `${a.requestType.replace(/_/g, " ").toLowerCase()} requested via fundraising workflow`,
      decisionNotes: decided ? (a.status === "APPROVED" ? "Approved — within delegated authority." : "Rejected — sanctions screening unresolved.") : null,
      amount: dec(a.amount),
      currency: "USD",
      decidedAt: decided ? new Date(Date.UTC(2026, 7, 18)) : null,
    };
    await prisma.fundraisingApprovalRequest.upsert({
      where: { id: a.id },
      create: { id: a.id, ...data },
      update: data,
    });

    const evId = `${a.id}-ev-01`;
    const evData = {
      approvalId: a.id,
      eventType: "SUBMITTED",
      actorId: by,
      notes: "Submitted for review",
      createdAt: new Date(Date.UTC(2026, 7, 15)),
    };
    await prisma.fundraisingApprovalEvent.upsert({
      where: { id: evId },
      create: { id: evId, ...evData },
      update: evData,
    });
    if (decided) {
      const ev2 = `${a.id}-ev-02`;
      const ev2Data = {
        approvalId: a.id,
        eventType: a.status,
        actorId: by,
        notes: data.decisionNotes,
        createdAt: new Date(Date.UTC(2026, 7, 18)),
      };
      await prisma.fundraisingApprovalEvent.upsert({
        where: { id: ev2 },
        create: { id: ev2, ...ev2Data },
        update: ev2Data,
      });
    }
  }
  console.log(`  approvals: ${approvals.length}`);

  // ------------------------------------------------------- forecast scenarios
  const scenarios = [
    { id: "frs-fc-01", campaignId: "frs-camp-pe3", name: "Base Case", type: "BASE", signed: 95_000_000, aum: 95_000_000 },
    { id: "frs-fc-02", campaignId: "frs-camp-pe3", name: "Upside", type: "UPSIDE", signed: 130_000_000, aum: 130_000_000 },
    { id: "frs-fc-03", campaignId: "frs-camp-pe3", name: "Downside", type: "DOWNSIDE", signed: 62_000_000, aum: 62_000_000 },
    { id: "frs-fc-04", campaignId: "frs-camp-am1", name: "Mandate Base Case", type: "BASE", signed: 55_000_000, aum: 55_000_000 },
  ];
  for (const s of scenarios) {
    const data = {
      campaignId: s.campaignId,
      name: s.name,
      scenarioType: s.type,
      assumptionsJson: {
        conversionRate: s.type === "UPSIDE" ? 0.42 : s.type === "DOWNSIDE" ? 0.18 : 0.3,
        averageTicket: 8_000_000,
        cycleMonths: s.type === "DOWNSIDE" ? 14 : 9,
      } as Prisma.InputJsonValue,
      projectedSigned: dec(s.signed),
      projectedAum: dec(s.aum),
      createdById: by,
    };
    await prisma.fundraisingForecastScenario.upsert({
      where: { id: s.id },
      create: { id: s.id, ...data },
      update: data,
    });
  }
  console.log(`  forecast scenarios: ${scenarios.length}`);

  // -------------------------------------------------------------- agreements
  const agreementSpecs = [
    { id: "frs-agr-01", oppN: 1, type: "SUBSCRIPTION_AGREEMENT", title: "ZNPA Subscription Agreement", status: "COMPLETED" },
    { id: "frs-agr-02", oppN: 2, type: "SUBSCRIPTION_AGREEMENT", title: "SADB Subscription Agreement", status: "COMPLETED" },
    { id: "frs-agr-03", oppN: 3, type: "SIDE_LETTER", title: "Old Mutual Side Letter", status: "SENT" },
    { id: "frs-agr-04", oppN: 4, type: "SUBSCRIPTION_AGREEMENT", title: "HMEF Subscription Agreement", status: "DRAFT" },
  ];
  for (const a of agreementSpecs) {
    const o = opps.find((x) => x.n === a.oppN)!;
    const data = {
      opportunityId: `frs-opp-${String(a.oppN).padStart(3, "0")}`,
      investorId: investors[o.investorIdx][0],
      campaignId: o.campaignId,
      commitmentId: o.signed ? `frs-commit-${String(a.oppN).padStart(3, "0")}` : null,
      documentType: a.type,
      title: a.title,
      status: a.status,
      provider: "INTERNAL",
      providerStatus: a.status === "COMPLETED" ? "signed" : a.status.toLowerCase(),
      sentAt: a.status !== "DRAFT" ? new Date(Date.UTC(2026, 6, 20)) : null,
      createdById: by,
    };
    await prisma.fundraisingAgreement.upsert({
      where: { id: a.id },
      create: { id: a.id, ...data },
      update: data,
    });
  }
  console.log(`  agreements: ${agreementSpecs.length}`);

  console.log("\nFundraising demo dataset seeded.");
}

main()
  .catch((e) => {
    console.error("SEED FAILED:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
