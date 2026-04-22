import "dotenv/config";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { loadCapitalCallAccountingLetterhead } from "../src/utils/capitalCallAccountingLetterhead";
import { buildCapitalCallNoticePdfBuffer } from "../src/utils/capitalCallNoticePdf";

async function main() {
  const letterhead = await loadCapitalCallAccountingLetterhead();

  const outDir = join(process.cwd(), "tmp");
  mkdirSync(outDir, { recursive: true });

  const fundName = "Sports fund";
  const lpLegalName = "James";
  const currencyCode = "USD";
  const callPercent = 6;
  const totalCommitment = 40000;
  const uncalledCapitalBeforeCall = 34400;
  const currentCallAmount = 2400;
  const paymentDueDate = "2026-04-24";
  const bankInstructions = "ZB";

  const pdf = await buildCapitalCallNoticePdfBuffer({
    fundName,
    lpLegalName,
    currencyCode,
    callPercent,
    totalCommitment,
    uncalledCapitalBeforeCall,
    currentCallAmount,
    paymentDueDate,
    bankInstructions,
    letterhead
  });

  const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;line-height:1.5;color:#222;">
    <div style="border-bottom:1px solid #ddd;padding-bottom:14px;margin-bottom:18px;text-align:right;">
      ${letterhead.logoUrlForEmail ? `<div style="text-align:right;margin-bottom:10px;"><img src="${letterhead.logoUrlForEmail}" alt="" width="80" height="80" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:1px solid #e8e8e8;display:inline-block;" /></div>` : ""}
      <div style="font-weight:500;font-size:14px;color:#111;margin-bottom:6px;letter-spacing:0.01em;">${letterhead.displayName}</div>
      ${(letterhead.detailLines || [])
        .map((line) => `<div style="font-size:11px;color:#444;line-height:1.4;text-align:right;">${line}</div>`)
        .join("")}
    </div>
    <p>Dear ${lpLegalName},</p>
    <p>The following capital call notice applies to ${fundName} (${currencyCode}).</p>
    <table style="border-collapse:collapse;margin:16px 0;width:100%;" cellpadding="8">
      <tr><td style="border:1px solid #ccc;font-weight:400;color:#333;width:36%;">LP name</td><td style="border:1px solid #ccc;font-weight:400;">${lpLegalName}</td></tr>
      <tr><td style="border:1px solid #ccc;font-weight:400;color:#333;width:36%;">Total commitment</td><td style="border:1px solid #ccc;font-weight:400;">${currencyCode} ${totalCommitment.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
      <tr><td style="border:1px solid #ccc;font-weight:400;color:#333;width:36%;">Uncalled capital (before this call)</td><td style="border:1px solid #ccc;font-weight:400;">${currencyCode} ${uncalledCapitalBeforeCall.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
      <tr><td style="border:1px solid #ccc;font-weight:400;color:#333;width:36%;">Current call amount</td><td style="border:1px solid #ccc;font-weight:400;">${currencyCode} ${currentCallAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
      <tr><td style="border:1px solid #ccc;font-weight:400;color:#333;width:36%;">Payment due date</td><td style="border:1px solid #ccc;font-weight:400;">${paymentDueDate}</td></tr>
      <tr><td style="border:1px solid #ccc;font-weight:400;color:#333;width:36%;vertical-align:top;">Bank instructions</td><td style="border:1px solid #ccc;white-space:pre-wrap;font-weight:400;">${bankInstructions}</td></tr>
    </table>
    <p style="color:#666;font-size:12px;text-align:right;font-weight:400;">${letterhead.displayName}</p>
  </body></html>`;

  const pdfPath = join(outDir, "capital-call-notice-preview.pdf");
  const htmlPath = join(outDir, "capital-call-notice-preview.html");
  writeFileSync(pdfPath, pdf);
  writeFileSync(htmlPath, html, "utf8");

  // eslint-disable-next-line no-console
  console.log("[ok] Letterhead displayName:", letterhead.displayName);
  // eslint-disable-next-line no-console
  console.log("[ok] Wrote:", pdfPath);
  // eslint-disable-next-line no-console
  console.log("[ok] Wrote:", htmlPath);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

