import "dotenv/config";
import { loadCapitalCallAccountingLetterhead } from "../src/utils/capitalCallAccountingLetterhead";
import { buildCapitalCallNoticePdfBuffer, safePdfFileBaseName } from "../src/utils/capitalCallNoticePdf";
import { EmailNotificationService } from "../src/services/EmailNotificationService";

function toNoticeDateLabel(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function main() {
  const to = (process.env.TEST_CAPITAL_CALL_EMAIL_TO || "logixine@gmail.com").trim();
  if (!to) throw new Error("Missing TEST_CAPITAL_CALL_EMAIL_TO (or default recipient empty)");

  const letterhead = await loadCapitalCallAccountingLetterhead();

  // Sample values — the goal is to validate branding + typography + attachments.
  const fundName = "Sports fund";
  const lpLegalName = "James";
  const currencyCode = "USD";
  const callPercent = 6;
  const totalCommitment = 40_000;
  const uncalled = 34_400;
  const callAmount = 2_400;
  const paymentDueDate = toNoticeDateLabel(new Date());
  const bankInstructions = "ZB";

  const pdfBuffer = await buildCapitalCallNoticePdfBuffer({
    fundName,
    lpLegalName,
    currencyCode,
    callPercent,
    totalCommitment,
    uncalledCapitalBeforeCall: uncalled,
    currentCallAmount: callAmount,
    paymentDueDate,
    bankInstructions,
    letterhead
  });

  const th = "border:1px solid #ccc;font-weight:400;color:#333;width:36%;";
  const td = "border:1px solid #ccc;font-weight:400;";

  const esc = (s: string) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const logoUrl = letterhead.logoUrlForEmail?.trim() ?? "";
  const logo =
    logoUrl && /^https:\/\//i.test(logoUrl)
      ? `<div style="text-align:right;margin-bottom:10px;"><img src="${esc(logoUrl)}" alt="" width="80" height="80" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:1px solid #e8e8e8;display:inline-block;" /></div>`
      : "";
  const detail = (letterhead.detailLines || [])
    .map((line) => `<div style="font-size:11px;color:#444;line-height:1.4;text-align:right;">${esc(line)}</div>`)
    .join("");
  const letterheadHtml = `<div style="border-bottom:1px solid #ddd;padding-bottom:14px;margin-bottom:18px;text-align:right;">
    ${logo}
    <div style="font-weight:500;font-size:14px;color:#111;margin-bottom:6px;letter-spacing:0.01em;">${esc(letterhead.displayName)}</div>
    ${detail}
  </div>`;

  const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;line-height:1.5;color:#222;">
    ${letterheadHtml}
    <p>Dear ${esc(lpLegalName)},</p>
    <p>The following capital call notice applies to ${esc(fundName)} (${esc(currencyCode)}).</p>
    <table style="border-collapse:collapse;margin:16px 0;width:100%;" cellpadding="8">
      <tr><td style="${th}">LP name</td><td style="${td}">${esc(lpLegalName)}</td></tr>
      <tr><td style="${th}">Total commitment</td><td style="${td}">${esc(currencyCode)} ${fmt(totalCommitment)}</td></tr>
      <tr><td style="${th}">Uncalled capital (before this call)</td><td style="${td}">${esc(currencyCode)} ${fmt(uncalled)}</td></tr>
      <tr><td style="${th}">Current call amount</td><td style="${td}">${esc(currencyCode)} ${fmt(callAmount)}</td></tr>
      <tr><td style="${th}">Payment due date</td><td style="${td}">${esc(paymentDueDate)}</td></tr>
      <tr><td style="${th}vertical-align:top;">Bank instructions</td><td style="${td}white-space:pre-wrap;">${esc(bankInstructions)}</td></tr>
    </table>
    <p style="color:#666;font-size:12px;text-align:right;font-weight:400;">${esc(letterhead.displayName)}</p>
  </body></html>`;

  const pdfFilename = `Capital-Call-Notice-${safePdfFileBaseName(fundName)}-${paymentDueDate}.pdf`;

  await EmailNotificationService.sendCapitalCallNoticeEmail({
    lpEmail: to,
    lpDisplayName: to,
    fundName,
    subjectDateLabel: paymentDueDate,
    html,
    pdfAttachment: { filename: pdfFilename, content: pdfBuffer }
  });

  // eslint-disable-next-line no-console
  console.log("[ok] Sent test capital call notice to", to, "as", letterhead.displayName);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

