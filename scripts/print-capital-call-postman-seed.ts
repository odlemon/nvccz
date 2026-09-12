/**
 * Print fund / commitment / client IDs from MySQL for capital-call Postman tests.
 *
 * Run: npx ts-node scripts/print-capital-call-postman-seed.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ELIGIBLE = ["ACTIVE", "PENDING"];

async function main() {
  const [funds, coa1210, coa3010] = await Promise.all([
    prisma.fund.findMany({
      select: {
        id: true,
        name: true,
        status: true,
        investmentCommitments: {
          where: { status: { in: ELIGIBLE } },
          select: {
            id: true,
            amount: true,
            currency: true,
            status: true,
            client: {
              select: { id: true, legalName: true, email: true },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.chartOfAccounts.findFirst({
      where: { accountNo: "1210", isActive: true },
      select: { id: true, accountNo: true, accountName: true },
    }),
    prisma.chartOfAccounts.findFirst({
      where: { accountNo: "3010", isActive: true },
      select: { id: true, accountNo: true, accountName: true },
    }),
  ]);

  console.log("=== Capital call Postman — IDs from database ===\n");

  console.log("Chart of accounts (required for POST initiate):");
  console.log(
    `  1210: ${coa1210 ? `${coa1210.accountName} (${coa1210.id})` : "MISSING — add before initiate"}`
  );
  console.log(
    `  3010: ${coa3010 ? `${coa3010.accountName} (${coa3010.id})` : "MISSING — add before initiate"}`
  );
  console.log("");

  if (funds.length === 0) {
    console.log("No funds in database.");
    return;
  }

  for (const f of funds) {
    const comms = f.investmentCommitments;
    const codes = [...new Set(comms.map((c) => c.currency.toUpperCase()))];
    const singleCurrency = codes.length <= 1;
    const callable = singleCurrency && comms.length > 0 && !!coa1210 && !!coa3010;

    console.log("—".repeat(60));
    console.log(`FUND: ${f.name}`);
    console.log(`  fundId:     ${f.id}`);
    console.log(`  status:     ${f.status}`);
    console.log(`  eligible commitments (ACTIVE/PENDING): ${comms.length}`);
    console.log(`  currencies: ${codes.length ? codes.join(", ") : "(none)"}`);
    console.log(`  ready for POST /funds/:fundId/capital-calls: ${callable ? "YES" : "NO"}`);
    if (!singleCurrency && comms.length > 0) {
      console.log("  (fix: one currency per fund for all eligible commitments)");
    }
    if (comms.length === 0) {
      console.log("  (add investment_commitments with status ACTIVE or PENDING)");
    }

    for (const c of comms) {
      const emailOk = c.client.email ? "yes" : "NO EMAIL — send-notices will skip this LP";
      console.log("");
      console.log(`  commitmentId: ${c.id}`);
      console.log(`    clientId:   ${c.client.id}`);
      console.log(`    LP:         ${c.client.legalName}`);
      console.log(` LP email:      ${c.client.email || "(null)"} → ${emailOk}`);
      console.log(`    amount:     ${c.amount}  ${c.currency}  (${c.status})`);
    }

    console.log("");
    console.log("  Postman examples (replace {{baseUrl}}):");
    console.log(`  POST {{baseUrl}}/funds/${f.id}/capital-calls`);
    if (comms[0]) {
      console.log(
        `  GET  {{baseUrl}}/funds/${f.id}/capital-calls/lp-summary`
      );
      console.log(
        `  (after you create a call, use returned capitalCallId + allocationId for notice/payments)`
      );
    }
  }

  console.log("\n" + "—".repeat(60));
  console.log("Note: capitalCallId and allocationId only exist AFTER POST initiate.");
  console.log(
    "After initiate, copy from response: data.id = capitalCallId, data.allocations[].id = allocationId per LP.\n"
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
