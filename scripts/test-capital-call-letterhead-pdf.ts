/**
 * Generates a sample capital call notice PDF (letterhead + body) for visual QA.
 * Run: npx ts-node --transpile-only scripts/test-capital-call-letterhead-pdf.ts
 */
import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { loadCapitalCallAccountingLetterhead } from "../src/utils/capitalCallAccountingLetterhead";
import { buildCapitalCallNoticePdfBuffer } from "../src/utils/capitalCallNoticePdf";

async function main() {
  const letterhead = await loadCapitalCallAccountingLetterhead();
  const buf = await buildCapitalCallNoticePdfBuffer({
    fundName: "Sports fund",
    lpLegalName: "Jamie Patel",
    currencyCode: "USD",
    callPercent: 20,
    totalCommitment: 40000,
    uncalledCapitalBeforeCall: 40000,
    currentCallAmount: 8000,
    paymentDueDate: "2026-05-04",
    bankInstructions: "Demo capital call — wire per your subscription agreement. Ref: LETTERHEAD-TEST.",
    letterhead,
  });

  const out = path.join(__dirname, "capital-call-letterhead-test-output.pdf");
  fs.writeFileSync(out, buf);
  const head = buf.subarray(0, 5).toString("utf8");
  if (head !== "%PDF-") {
    throw new Error(`Expected PDF magic, got: ${JSON.stringify(head)}`);
  }
  console.log("OK:", out);
  console.log("Bytes:", buf.length);
  console.log("Letterhead:", letterhead.displayName, "| lines:", letterhead.detailLines.length, "| logo buffer:", !!letterhead.logoBuffer);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
