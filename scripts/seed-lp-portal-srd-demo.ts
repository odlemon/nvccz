/**
 * Rebuild LP Portal SRD demo fixtures on DEV `nts` only.
 * Idempotent upserts by stable investorId / emails / fund names / seed markers.
 *
 * Usage: npm run db:seed:lp-portal-srd
 */
// @ts-nocheck
import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { assertDevDatabase } from "./lib/assert-dev-database";

const prisma = new PrismaClient() as any;

const PASSWORD = "Password123!";
const CLIENT_INVESTOR_ID = "LP-ARCUS-001";
const CLIENT_EMAIL = "lp-arcus-portal@example.com";
const CLIENT_NAME = "Arcus Capital Partners LP";

const SIGNATORY_EMAIL = "lp.signatory@example.com";
const VIEWER_EMAIL = "lp.viewer@example.com";

const FUND_PC_NAME = "Arcus Growth Fund V";
const FUND_OE_NAME = "Arcus Equity Opportunities";

const CC_MARKER = "LP-SRD-SEED|CC-ARCUS-001";
const DIST_MARKER = "LP-SRD-SEED|DIST-ARCUS-001";
const DOC_TITLE = "LP SRD Seed — Q1 Investor Pack";
const NOTICE_TITLE = "LP SRD Seed — Portal Notice";
const SR_REFERENCE = "SR-LPSEED001";
const OTHER_INVESTOR_ID = "LP-OTHER-001";
const OTHER_EMAIL = "lp-other-portal@example.com";

function logId(label: string, id: string | null | undefined, extra = "") {
  console.log(`  ${label}=${id || "(none)"}${extra ? ` ${extra}` : ""}`);
}

async function ensureCurrencyUsd() {
  let c = await prisma.currency.findUnique({ where: { code: "USD" } });
  if (!c) {
    c = await prisma.currency.create({
      data: { code: "USD", name: "US Dollar", symbol: "$", isActive: true, isDefault: true },
    });
    console.log("[ok] created Currency USD");
  }
  return c;
}

async function ensureLpRoleRow(roleCode: string, nameHint: string) {
  let role =
    (await prisma.role.findFirst({
      where: { OR: [{ name: nameHint }, { name: { contains: "Limited" } }, { name: { contains: "Partner" } }] },
    })) || (await prisma.role.findFirst({ orderBy: { createdAt: "asc" } }));

  if (!role) {
    role = await prisma.role.create({
      data: {
        name: nameHint,
        description: "LP Portal seed role",
        permissions: [],
      },
    });
  }
  return { roleId: role.id, roleCode };
}

async function ensureUser(opts: {
  email: string;
  firstName: string;
  lastName: string;
  roleCode: string;
}) {
  const { roleId, roleCode } = await ensureLpRoleRow(opts.roleCode, "Limited Partner");
  const hash = await bcrypt.hash(PASSWORD, 10);
  let user = await prisma.user.findUnique({ where: { email: opts.email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: opts.email,
        password: hash,
        firstName: opts.firstName,
        lastName: opts.lastName,
        roleId,
        roleCode,
      },
    });
    console.log(`[ok] created user ${opts.email}`);
  } else {
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hash,
        firstName: opts.firstName,
        lastName: opts.lastName,
        roleId,
        roleCode,
      },
    });
    console.log(`[ok] upserted user ${opts.email}`);
  }
  return user;
}

async function ensureFund(name: string, description: string, adminId: string) {
  let fund = await prisma.fund.findFirst({ where: { name } });
  const now = new Date();
  if (!fund) {
    fund = await prisma.fund.create({
      data: {
        name,
        description,
        totalAmount: new Decimal(500_000_000),
        remainingAmount: new Decimal(200_000_000),
        minInvestment: new Decimal(100_000),
        maxInvestment: new Decimal(100_000_000),
        focusIndustries: ["Technology", "Healthcare"],
        applicationStart: now,
        applicationEnd: new Date("2099-12-31"),
        status: "OPEN",
        fundPurpose: "PRIVATE_EQUITY",
        createdById: adminId,
        managementFeeRate: new Decimal("0.0200"),
        carryRate: new Decimal("0.2000"),
        hurdleRate: new Decimal("0.0800"),
      },
    });
    console.log(`[ok] created fund ${name}`);
  } else {
    fund = await prisma.fund.update({
      where: { id: fund.id },
      data: { description, status: "OPEN" },
    });
    console.log(`[ok] reused fund ${name}`);
  }
  return fund;
}

async function ensureClient() {
  let client = await prisma.client.findFirst({
    where: { OR: [{ investorId: CLIENT_INVESTOR_ID }, { email: CLIENT_EMAIL }] },
  });
  if (!client) {
    client = await prisma.client.create({
      data: {
        investorId: CLIENT_INVESTOR_ID,
        type: "institutional",
        legalName: CLIENT_NAME,
        email: CLIENT_EMAIL,
        country: "US",
        status: "ACTIVE",
      },
    });
    console.log(`[ok] created client ${CLIENT_NAME}`);
  } else {
    client = await prisma.client.update({
      where: { id: client.id },
      data: {
        investorId: CLIENT_INVESTOR_ID,
        legalName: CLIENT_NAME,
        email: CLIENT_EMAIL,
        country: "US",
        status: "ACTIVE",
        type: "institutional",
      },
    });
    console.log(`[ok] upserted client ${CLIENT_NAME}`);
  }
  return client;
}

async function ensureOtherClient() {
  let client = await prisma.client.findFirst({
    where: { OR: [{ investorId: OTHER_INVESTOR_ID }, { email: OTHER_EMAIL }] },
  });
  if (!client) {
    client = await prisma.client.create({
      data: {
        investorId: OTHER_INVESTOR_ID,
        type: "institutional",
        legalName: "Other Demo Investors LLC",
        email: OTHER_EMAIL,
        country: "US",
        status: "ACTIVE",
      },
    });
  } else {
    client = await prisma.client.update({
      where: { id: client.id },
      data: {
        investorId: OTHER_INVESTOR_ID,
        legalName: "Other Demo Investors LLC",
        email: OTHER_EMAIL,
        status: "ACTIVE",
      },
    });
  }
  return client;
}

async function ensureCommitment(clientId: string, fundId: string, amount: number) {
  const existing = await prisma.investmentCommitment.findUnique({
    where: { clientId_fundId: { clientId, fundId } },
  });
  if (!existing) {
    return prisma.investmentCommitment.create({
      data: {
        clientId,
        fundId,
        amount: new Decimal(amount),
        currency: "USD",
        effectiveDate: new Date("2024-01-15"),
        status: "ACTIVE",
        notes: "LP-SRD-SEED",
      },
    });
  }
  return prisma.investmentCommitment.update({
    where: { id: existing.id },
    data: { amount: new Decimal(amount), status: "ACTIVE", currency: "USD" },
  });
}

async function ensureFundContext(fundId: string, operatingModel: "PRIVATE_CAPITAL" | "OPEN_ENDED", opts: Record<string, unknown>) {
  return prisma.lpFundPortalContext.upsert({
    where: { fundId },
    create: {
      fundId,
      operatingModel,
      currencyCode: "USD",
      valuationStatus: "FINAL",
      asOfDate: new Date("2025-05-31"),
      ...opts,
    },
    update: {
      operatingModel,
      currencyCode: "USD",
      valuationStatus: "FINAL",
      asOfDate: new Date("2025-05-31"),
      ...opts,
    },
  });
}

async function ensureRelation(userId: string, clientId: string, lpRole: string, fundIds: string[]) {
  return prisma.lpUserRelation.upsert({
    where: { userId_clientId: { userId, clientId } },
    create: {
      userId,
      clientId,
      lpRole,
      isActive: true,
      fundIds,
      revokedAt: null,
    },
    update: {
      lpRole,
      isActive: true,
      fundIds,
      revokedAt: null,
    },
  });
}

async function ensureCapitalCall(opts: {
  fundId: string;
  currencyId: string;
  createdById: string;
  clientId: string;
  commitmentId: string;
  clientName: string;
  amount: number;
}) {
  let cc = await prisma.capitalCall.findFirst({
    where: { fundId: opts.fundId, bankInstructions: { contains: CC_MARKER } },
  });
  const due = new Date();
  due.setDate(due.getDate() + 21);
  const wiring = JSON.stringify({
    marker: CC_MARKER,
    bankName: "First National Bank",
    accountName: CLIENT_NAME,
    accountNumber: "****4821",
    accountNumberMasked: "••••4821",
    abaRouting: "021000021",
    reference: "CC-ARCUS-7",
  });

  if (!cc) {
    cc = await prisma.capitalCall.create({
      data: {
        fundId: opts.fundId,
        currencyId: opts.currencyId,
        callPercent: new Decimal("2.000000"),
        paymentDueDate: due,
        bankInstructions: wiring,
        transactionDate: new Date(),
        status: "NOTICES_SENT",
        noticesSentAt: new Date(),
        createdById: opts.createdById,
      },
    });
    console.log("[ok] created capital call");
  } else {
    cc = await prisma.capitalCall.update({
      where: { id: cc.id },
      data: {
        status: "NOTICES_SENT",
        noticesSentAt: cc.noticesSentAt || new Date(),
        bankInstructions: wiring,
        paymentDueDate: due,
      },
    });
    console.log("[ok] upserted capital call");
  }

  let alloc = await prisma.capitalCallAllocation.findFirst({
    where: { capitalCallId: cc.id, clientId: opts.clientId },
  });
  if (!alloc) {
    alloc = await prisma.capitalCallAllocation.create({
      data: {
        capitalCallId: cc.id,
        clientId: opts.clientId,
        investmentCommitmentId: opts.commitmentId,
        lpLegalNameSnapshot: opts.clientName,
        totalCommitmentSnapshot: new Decimal(312_500_000),
        uncalledCapitalBeforeSnapshot: new Decimal(156_080_000),
        currentCallAmount: new Decimal(opts.amount),
        amountPaid: new Decimal(0),
        status: "PENDING",
      },
    });
  } else {
    alloc = await prisma.capitalCallAllocation.update({
      where: { id: alloc.id },
      data: {
        currentCallAmount: new Decimal(opts.amount),
        amountPaid: new Decimal(0),
        status: "PENDING",
        investmentCommitmentId: opts.commitmentId,
        lpLegalNameSnapshot: opts.clientName,
      },
    });
  }
  return { capitalCall: cc, allocation: alloc };
}

async function ensureDistribution(opts: {
  fundId: string;
  currencyId: string;
  createdById: string;
  clientId: string;
  commitmentId: string;
  clientName: string;
}) {
  let dist = await prisma.distribution.findFirst({
    where: { fundId: opts.fundId, notes: { contains: DIST_MARKER } },
  });
  if (!dist) {
    dist = await prisma.distribution.create({
      data: {
        fundId: opts.fundId,
        currencyId: opts.currencyId,
        distributionDate: new Date("2025-03-31"),
        source: "DIVIDEND",
        grossAmount: new Decimal(1_250_000),
        carryAmount: new Decimal(0),
        netToLPs: new Decimal(1_250_000),
        status: "NOTICES_SENT",
        noticesSentAt: new Date(),
        notes: DIST_MARKER,
        createdById: opts.createdById,
      },
    });
    console.log("[ok] created distribution");
  } else {
    dist = await prisma.distribution.update({
      where: { id: dist.id },
      data: {
        status: "NOTICES_SENT",
        noticesSentAt: dist.noticesSentAt || new Date(),
        notes: DIST_MARKER,
      },
    });
    console.log("[ok] upserted distribution");
  }

  let alloc = await prisma.distributionAllocation.findFirst({
    where: { distributionId: dist.id, clientId: opts.clientId },
  });
  if (!alloc) {
    alloc = await prisma.distributionAllocation.create({
      data: {
        distributionId: dist.id,
        clientId: opts.clientId,
        investmentCommitmentId: opts.commitmentId,
        lpLegalNameSnapshot: opts.clientName,
        commitmentSnapshot: new Decimal(312_500_000),
        paidInSnapshot: new Decimal(156_420_000),
        shareAmount: new Decimal(312_500),
        amountPaid: new Decimal(0),
        status: "PENDING",
      },
    });
  } else {
    alloc = await prisma.distributionAllocation.update({
      where: { id: alloc.id },
      data: {
        shareAmount: new Decimal(312_500),
        investmentCommitmentId: opts.commitmentId,
        status: "PENDING",
      },
    });
  }
  return { distribution: dist, allocation: alloc };
}

async function main() {
  await assertDevDatabase(prisma, "seed:lp-portal-srd");
  console.log("\n=== LP Portal SRD demo seed (nts) ===\n");

  const admin =
    (await prisma.user.findFirst({
      where: { OR: [{ roleCode: "admin" }, { email: "admin@nts.com" }] },
      orderBy: { createdAt: "asc" },
    })) || (await prisma.user.findFirst({ orderBy: { createdAt: "asc" } }));
  if (!admin) throw new Error("No admin/system user — seed an admin first");

  const usd = await ensureCurrencyUsd();
  const signatory = await ensureUser({
    email: SIGNATORY_EMAIL,
    firstName: "Jane",
    lastName: "Signatory",
    roleCode: "LIMITED_PARTNER",
  });
  const viewer = await ensureUser({
    email: VIEWER_EMAIL,
    firstName: "Sam",
    lastName: "Viewer",
    roleCode: "LP_VIEWER",
  });

  const client = await ensureClient();
  await prisma.client.update({
    where: { id: client.id },
    data: { userId: signatory.id },
  });

  const otherClient = await ensureOtherClient();

  const fundPc = await ensureFund(
    FUND_PC_NAME,
    "Private capital growth vehicle for institutional LPs (SRD demo)",
    admin.id
  );
  const fundOe = await ensureFund(
    FUND_OE_NAME,
    "Open-ended equity opportunities fund (SRD demo)",
    admin.id
  );

  const ctxPc = await ensureFundContext(fundPc.id, "PRIVATE_CAPITAL", {
    publicReference: "FND-AGFV",
    shortName: "Growth Fund V",
    defaultShareClass: null,
  });
  const ctxOe = await ensureFundContext(fundOe.id, "OPEN_ENDED", {
    publicReference: "FND-AEO",
    shortName: "Equity Opportunities",
    defaultShareClass: "Class A",
  });

  const commitPc = await ensureCommitment(client.id, fundPc.id, 312_500_000);
  const commitOe = await ensureCommitment(client.id, fundOe.id, 25_000_000);
  const commitOther = await ensureCommitment(otherClient.id, fundPc.id, 5_000_000);

  const { capitalCall, allocation: ccAlloc } = await ensureCapitalCall({
    fundId: fundPc.id,
    currencyId: usd.id,
    createdById: admin.id,
    clientId: client.id,
    commitmentId: commitPc.id,
    clientName: CLIENT_NAME,
    amount: 6_250_000,
  });

  // Other-client allocation on same call (IDOR fixture) or separate minimal call
  let otherAlloc = await prisma.capitalCallAllocation.findFirst({
    where: { capitalCallId: capitalCall.id, clientId: otherClient.id },
  });
  if (!otherAlloc) {
    otherAlloc = await prisma.capitalCallAllocation.create({
      data: {
        capitalCallId: capitalCall.id,
        clientId: otherClient.id,
        investmentCommitmentId: commitOther.id,
        lpLegalNameSnapshot: "Other Demo Investors LLC",
        totalCommitmentSnapshot: new Decimal(5_000_000),
        uncalledCapitalBeforeSnapshot: new Decimal(5_000_000),
        currentCallAmount: new Decimal(100_000),
        amountPaid: new Decimal(0),
        status: "PENDING",
      },
    });
  }

  const { distribution, allocation: distAlloc } = await ensureDistribution({
    fundId: fundPc.id,
    currencyId: usd.id,
    createdById: admin.id,
    clientId: client.id,
    commitmentId: commitPc.id,
    clientName: CLIENT_NAME,
  });

  const dealingRules = await prisma.lpDealingRules.upsert({
    where: { fundId: fundOe.id },
    create: {
      fundId: fundOe.id,
      minBalanceAmount: new Decimal(1_000_000),
      minBalanceUnits: new Decimal(100_000),
      noticePeriodDays: 30,
      dealingSuspended: false,
      subscriptionFeeBps: new Decimal(0),
      redemptionFeeBps: new Decimal(0),
      nextDealingDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
    },
    update: {
      minBalanceAmount: new Decimal(1_000_000),
      minBalanceUnits: new Decimal(100_000),
      noticePeriodDays: 30,
      dealingSuspended: false,
      nextDealingDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
    },
  });

  const units = new Decimal("2468311.450000");
  const nav = new Decimal("9.99870000");
  const accountValue = new Decimal("24680000.00");
  let holding = await prisma.lpHoldingPosition.findFirst({
    where: { clientId: client.id, fundId: fundOe.id, shareClass: "Class A" },
  });
  if (!holding) {
    holding = await prisma.lpHoldingPosition.create({
      data: {
        clientId: client.id,
        fundId: fundOe.id,
        shareClass: "Class A",
        units,
        navPerUnit: nav,
        accountValue,
        currencyCode: "USD",
        accountRef: "ACC-EO-8891",
        asOfDate: new Date("2025-05-31"),
        valuationStatus: "FINAL",
        isActive: true,
      },
    });
  } else {
    holding = await prisma.lpHoldingPosition.update({
      where: { id: holding.id },
      data: {
        units,
        navPerUnit: nav,
        accountValue,
        accountRef: "ACC-EO-8891",
        asOfDate: new Date("2025-05-31"),
        valuationStatus: "FINAL",
        isActive: true,
      },
    });
  }

  let bank = await prisma.lpBankAccount.findFirst({
    where: { clientId: client.id, accountNumberMasked: "••••4821" },
  });
  if (!bank) {
    bank = await prisma.lpBankAccount.create({
      data: {
        clientId: client.id,
        fundId: fundOe.id,
        label: "Primary USD",
        bankName: "First National Bank",
        accountName: CLIENT_NAME,
        accountNumberMasked: "••••4821",
        currencyCode: "USD",
        isDefault: true,
        status: "ACTIVE",
      },
    });
  }

  const compliance = await prisma.lpComplianceStatus.upsert({
    where: { clientId: client.id },
    create: {
      clientId: client.id,
      kycStatus: "CLEAR",
      accredited: true,
      onHold: false,
    },
    update: {
      kycStatus: "CLEAR",
      accredited: true,
      onHold: false,
      holdReason: null,
    },
  });

  const fs = await import("fs");
  const path = await import("path");
  const crypto = await import("crypto");
  const docDir = path.join(process.cwd(), "uploads", "lp-portal", "seed");
  fs.mkdirSync(docDir, { recursive: true });
  const docFile = path.join(docDir, "lp-srd-seed-q1.txt");
  const docBytes = Buffer.from("LP Portal SRD seed document — quarterly pack placeholder.\n");
  fs.writeFileSync(docFile, docBytes);
  const docSha = crypto.createHash("sha256").update(docBytes).digest("hex");

  let doc = await prisma.lpPortalDocument.findFirst({
    where: { clientId: client.id, title: DOC_TITLE },
  });
  if (!doc) {
    doc = await prisma.lpPortalDocument.create({
      data: {
        clientId: client.id,
        fundId: fundPc.id,
        category: "QUARTERLY_STATEMENT",
        title: DOC_TITLE,
        fileUrl: null,
        storagePath: docFile,
        sha256: docSha,
        publishedAt: new Date(),
        publishedById: admin.id,
        sourceType: "MANUAL",
        sourceRefId: "LP-SRD-SEED-DOC",
      },
    });
  } else {
    doc = await prisma.lpPortalDocument.update({
      where: { id: doc.id },
      data: {
        publishedAt: doc.publishedAt || new Date(),
        publishedById: admin.id,
        storagePath: docFile,
        sha256: docSha,
      },
    });
  }

  let notice = await prisma.lpNotice.findFirst({
    where: { title: NOTICE_TITLE, clientId: client.id },
  });
  if (!notice) {
    notice = await prisma.lpNotice.create({
      data: {
        title: NOTICE_TITLE,
        body: "Welcome to the Arcus LP Portal SRD demo. Please review capital activity and dealing rules.",
        status: "PUBLISHED",
        targetType: "ORG",
        clientId: client.id,
        fundId: fundPc.id,
        publishedAt: new Date(),
      },
    });
  } else {
    notice = await prisma.lpNotice.update({
      where: { id: notice.id },
      data: { status: "PUBLISHED", publishedAt: notice.publishedAt || new Date() },
    });
  }

  let serviceReq = await prisma.lpServiceRequest.findUnique({ where: { reference: SR_REFERENCE } });
  if (!serviceReq) {
    serviceReq = await prisma.lpServiceRequest.create({
      data: {
        reference: SR_REFERENCE,
        clientId: client.id,
        fundId: fundPc.id,
        requestType: "PROFILE_ACCESS",
        status: "OPEN",
        subject: "LP SRD Seed — Access question",
        body: "Please confirm our banking details on file.",
        createdById: signatory.id,
      },
    });
    await prisma.lpServiceRequestMessage.create({
      data: {
        requestId: serviceReq.id,
        authorType: "INVESTOR",
        authorId: signatory.id,
        body: "Initial seed message — banking confirmation request.",
      },
    });
  }

  let thread = await prisma.lpMessageThread.findFirst({
    where: { clientId: client.id, subject: "LP SRD Seed — Ops thread" },
  });
  if (!thread) {
    thread = await prisma.lpMessageThread.create({
      data: {
        clientId: client.id,
        fundId: fundPc.id,
        subject: "LP SRD Seed — Ops thread",
        relatedType: "SERVICE_REQUEST",
        relatedId: serviceReq.id,
        status: "OPEN",
        lastMessageAt: new Date(),
      },
    });
    await prisma.lpMessage.create({
      data: {
        threadId: thread.id,
        authorType: "OPS",
        authorId: admin.id,
        body: "We received your request and will update banking shortly.",
      },
    });
  }

  const relSig = await ensureRelation(signatory.id, client.id, "SIGNATORY", [fundPc.id, fundOe.id]);
  const relView = await ensureRelation(viewer.id, client.id, "VIEWER", [fundPc.id, fundOe.id]);

  await prisma.lpPortalMetricSnapshot.upsert({
    where: {
      clientId_fundId_asOfDate: {
        clientId: client.id,
        fundId: fundPc.id,
        asOfDate: new Date("2025-05-31"),
      },
    },
    create: {
      clientId: client.id,
      fundId: fundPc.id,
      asOfDate: new Date("2025-05-31"),
      metrics: {
        totalCommitment: 312500000,
        paidIn: 156420000,
        unfundedCommitment: 156080000,
        currentNav: 198760000,
        distributions: 78340000,
        netIrr: 0.187,
        tvpi: 1.27,
        dpi: 0.5,
        rvpi: 0.77,
      },
    },
    update: {
      metrics: {
        totalCommitment: 312500000,
        paidIn: 156420000,
        unfundedCommitment: 156080000,
        currentNav: 198760000,
        distributions: 78340000,
        netIrr: 0.187,
        tvpi: 1.27,
        dpi: 0.5,
        rvpi: 0.77,
      },
    },
  });

  console.log("\n=== Seed summary (IDs) ===");
  logId("clientId", client.id, `(${CLIENT_NAME} / ${CLIENT_INVESTOR_ID})`);
  logId("otherClientId", otherClient.id, "(IDOR fixture)");
  logId("signatoryUserId", signatory.id, SIGNATORY_EMAIL);
  logId("viewerUserId", viewer.id, VIEWER_EMAIL);
  logId("fundPcId", fundPc.id, FUND_PC_NAME);
  logId("fundOeId", fundOe.id, FUND_OE_NAME);
  logId("lpFundContextPcId", ctxPc.id);
  logId("lpFundContextOeId", ctxOe.id);
  logId("commitmentPcId", commitPc.id);
  logId("commitmentOeId", commitOe.id);
  logId("capitalCallId", capitalCall.id);
  logId("capitalCallAllocationId", ccAlloc.id, "(portal :id)");
  logId("otherCapitalCallAllocationId", otherAlloc.id, "(IDOR)");
  logId("distributionId", distribution.id);
  logId("distributionAllocationId", distAlloc.id);
  logId("dealingRulesId", dealingRules.id);
  logId("holdingPositionId", holding.id, `units=${units}`);
  logId("bankAccountId", bank.id);
  logId("complianceStatusId", compliance.id, "CLEAR");
  logId("documentId", doc.id);
  logId("noticeId", notice.id);
  logId("serviceRequestId", serviceReq.id, SR_REFERENCE);
  logId("messageThreadId", thread.id);
  logId("lpUserRelationSignatoryId", relSig.id);
  logId("lpUserRelationViewerId", relView.id);
  console.log(`\nLogin: ${SIGNATORY_EMAIL} / ${PASSWORD}`);
  console.log(`Login: ${VIEWER_EMAIL} / ${PASSWORD}`);
  console.log("\n[done] LP Portal SRD demo seed complete.\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
