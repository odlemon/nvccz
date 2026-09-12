/**
 * Ensures LP logixvine@gmail.com exists with an ACTIVE commitment on an OPEN fund,
 * initiates a capital call, and sends notice emails (PDF + letterhead).
 *
 * Run: npx ts-node --transpile-only scripts/demo-capital-call-logixvine.ts
 */
import "dotenv/config";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../src/utils/database";
import { ClientService } from "../src/services/ClientService";
import { CapitalCallService } from "../src/services/CapitalCallService";

const TARGET_EMAIL = "logixvine@gmail.com";
const LP_NAME = "Logix Vine (Demo LP)";

async function getSystemUserId(): Promise<string> {
  const u = await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  if (!u) throw new Error("No user in database — seed a user first.");
  return u.id;
}

function clampCommitmentAmount(fund: {
  minInvestment: Decimal;
  maxInvestment: Decimal;
  remainingAmount: Decimal;
}): number {
  const min = Number(fund.minInvestment);
  const max = Number(fund.maxInvestment);
  const rem = Number(fund.remainingAmount);
  const want = 40_000;
  const n = Math.min(max, Math.max(min, want), rem);
  if (!Number.isFinite(n) || n < min) throw new Error(`Fund has no room for a commitment (min ${min}, remaining ${rem}).`);
  return n;
}

type FundPick = {
  id: string;
  name: string;
  currency: string;
  commitmentAmount: number;
};

async function pickFundForDemo(): Promise<FundPick> {
  const funds = await prisma.fund.findMany({
    where: { status: "OPEN" },
    select: {
      id: true,
      name: true,
      minInvestment: true,
      maxInvestment: true,
      remainingAmount: true,
      investmentCommitments: {
        where: { status: { in: ["ACTIVE", "PENDING"] } },
        select: { currency: true },
      },
    },
    orderBy: { name: "asc" },
  });

  const candidates: Array<{
    f: (typeof funds)[0];
    commitmentAmount: number;
    currency: string;
  }> = [];

  for (const f of funds) {
    const currs = [...new Set(f.investmentCommitments.map((c) => c.currency.toUpperCase()))];
    if (currs.length > 1) continue;
    let commitmentAmount: number;
    try {
      commitmentAmount = clampCommitmentAmount(f);
    } catch {
      continue;
    }
    const currency = currs[0] || "USD";
    candidates.push({ f, commitmentAmount, currency });
  }

  if (candidates.length === 0) {
    throw new Error(
      "No OPEN fund with room for a commitment and a single currency among ACTIVE/PENDING commitments (or empty). Open a fund or free capacity."
    );
  }

  const emptyFirst = candidates.find((c) => c.f.investmentCommitments.length === 0);
  const chosen = emptyFirst ?? candidates[0];

  return {
    id: chosen.f.id,
    name: chosen.f.name,
    currency: chosen.currency,
    commitmentAmount: chosen.commitmentAmount,
  };
}

async function ensureClientAndCommitment(fund: FundPick) {
  let client = await prisma.client.findUnique({ where: { email: TARGET_EMAIL } });

  if (!client) {
    const created = await ClientService.createClient({
      type: "individual",
      legalName: LP_NAME,
      email: TARGET_EMAIL,
      country: "US",
      fundId: fund.id,
      amount: fund.commitmentAmount,
      currency: fund.currency,
      effectiveDate: new Date(),
      notes: "demo-capital-call-logixvine.ts",
    });
    if (!created) throw new Error("ClientService.createClient returned null");
    client = created;
    console.log(`Created client + commitment: ${client.id}`);
    return { clientId: client.id, commitmentId: created.investmentCommitments[0]?.id };
  }

  console.log(`Client already exists: ${client.id}`);

  const existing = await prisma.investmentCommitment.findFirst({
    where: { clientId: client.id, fundId: fund.id },
  });

  if (existing) {
    if (!["ACTIVE", "PENDING"].includes(existing.status)) {
      await prisma.investmentCommitment.update({
        where: { id: existing.id },
        data: { status: "ACTIVE" },
      });
      console.log(`Reactivated commitment ${existing.id} to ACTIVE`);
    }
    return { clientId: client.id, commitmentId: existing.id };
  }

  const fundRow = await prisma.fund.findUnique({
    where: { id: fund.id },
    select: { minInvestment: true, maxInvestment: true, remainingAmount: true },
  });
  if (!fundRow) throw new Error("Fund not found");
  const amt = clampCommitmentAmount(fundRow);

  const commitment = await prisma.investmentCommitment.create({
    data: {
      clientId: client.id,
      fundId: fund.id,
      amount: amt,
      currency: fund.currency,
      effectiveDate: new Date(),
      status: "ACTIVE",
      notes: "demo-capital-call-logixvine.ts",
    },
  });
  console.log(`Created commitment ${commitment.id} on fund ${fund.name}`);
  return { clientId: client.id, commitmentId: commitment.id };
}

async function main() {
  const userId = await getSystemUserId();
  const fund = await pickFundForDemo();
  console.log(`Using fund: ${fund.name} (${fund.id})  commitment amount: ${fund.commitmentAmount} ${fund.currency}`);

  await ensureClientAndCommitment(fund);

  const paymentDue = new Date();
  paymentDue.setDate(paymentDue.getDate() + 14);

  const detail = await CapitalCallService.initiate({
    fundId: fund.id,
    callPercent: 20,
    paymentDueDate: paymentDue,
    bankInstructions: "Demo capital call — wire per your subscription agreement. Ref: LOGIXVINE-DEMO.",
    transactionDate: new Date(),
    createdById: userId,
  });

  const capitalCallId = detail.id;
  console.log(`Capital call initiated: ${capitalCallId}`);

  const report = await CapitalCallService.sendNotices(fund.id, capitalCallId);
  console.log("Notices sent:", JSON.stringify(report.noticeDispatch ?? report, null, 2));
  console.log(`\nCheck inbox: ${TARGET_EMAIL}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
