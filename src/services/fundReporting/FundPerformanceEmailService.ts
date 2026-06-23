// @ts-nocheck
import { emailTransport, getFromAddress } from "../../config/email.config";
import { prisma } from "../../utils/database";
import {
  backoffMs,
  FUND_REPORT_MAX_EMAIL_RETRIES,
} from "./fundReportingSupport";

function isTransientSmtpError(err: any): boolean {
  const code = String(err?.code || err?.responseCode || "");
  const msg = String(err?.message || "").toLowerCase();
  if (code === "421" || code === "450" || code === "451" || code === "452") return true;
  if (msg.includes("rate") || msg.includes("timeout") || msg.includes("temporary")) return true;
  return false;
}

export function buildFundPerformanceEmailHtml(params: {
  lpLegalName: string;
  fundName: string;
  periodEnd: string;
  metrics: { totalPaidIn: number; tvpi: number; dpi: number; currencyCode: string };
  secureDownloadUrl?: string;
}): string {
  const fmt = (n: number) =>
    n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cta = params.secureDownloadUrl
    ? `<p><a href="${params.secureDownloadUrl}" style="display:inline-block;background:#6366F1;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Download Performance Report</a></p>
       <p style="font-size:12px;color:#64748B;">This secure link expires in 7 days.</p>`
    : `<p>Your performance report is attached to this email.</p>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Helvetica,Arial,sans-serif;background:#F8FAFC;color:#1E293B;margin:0;padding:0;">
<div style="max-width:600px;margin:20px auto;background:#fff;border:1px solid #E2E8F0;border-radius:8px;overflow:hidden;">
<div style="background:#0F172A;padding:30px;"><div style="color:#fff;font-size:20px;font-weight:bold;">ARCUS CAPITAL</div></div>
<div style="padding:40px 30px;line-height:1.6;">
<h3>Dear ${params.lpLegalName},</h3>
<p>We have published your performance report for <strong>${params.fundName}</strong> for the period ending <strong>${params.periodEnd}</strong>.</p>
<table style="width:100%;margin:25px 0;border-collapse:collapse;">
<tr><td style="background:#F1F5F9;padding:15px;text-align:center;width:50%;"><div style="font-size:11px;color:#64748B;text-transform:uppercase;">Total Paid-In (${params.metrics.currencyCode})</div><div style="font-size:18px;font-weight:bold;font-family:monospace;">${fmt(params.metrics.totalPaidIn)}</div></td>
<td style="background:#F1F5F9;padding:15px;text-align:center;width:50%;"><div style="font-size:11px;color:#64748B;text-transform:uppercase;">TVPI</div><div style="font-size:18px;font-weight:bold;font-family:monospace;">${params.metrics.tvpi.toFixed(2)}x</div></td></tr>
<tr><td style="background:#F1F5F9;padding:15px;text-align:center;"><div style="font-size:11px;color:#64748B;text-transform:uppercase;">DPI</div><div style="font-size:18px;font-weight:bold;font-family:monospace;">${params.metrics.dpi.toFixed(2)}x</div></td>
<td style="background:#F1F5F9;padding:15px;text-align:center;"><div style="font-size:11px;color:#64748B;text-transform:uppercase;">Period End</div><div style="font-size:18px;font-weight:bold;font-family:monospace;">${params.periodEnd}</div></td></tr>
</table>
${cta}
</div>
<div style="background:#F8FAFC;padding:20px 30px;font-size:11px;color:#64748B;text-align:center;border-top:1px solid #E2E8F0;">Confidential — for intended recipient only.</div>
</div></body></html>`;
}

export class FundPerformanceEmailService {
  static async sendFundPerformanceReportEmail(params: {
    jobId: string;
    to: string;
    subject: string;
    html: string;
    attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
  }): Promise<{ messageId?: string; providerStatus: string }> {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= FUND_REPORT_MAX_EMAIL_RETRIES; attempt++) {
      try {
        const info = await emailTransport.sendMail({
          from: getFromAddress("finance"),
          to: params.to,
          subject: params.subject,
          html: params.html,
          attachments: params.attachments,
        });
        await prisma.fundReportDistributionLog.create({
          data: {
            jobId: params.jobId,
            eventType: attempt > 0 ? "SENT_RETRY" : "SENT",
            providerRef: info?.messageId || null,
            payload: { attempt },
            message: "Email accepted by SMTP relay",
          },
        });
        return { messageId: info?.messageId, providerStatus: "SENT" };
      } catch (err: any) {
        lastError = err instanceof Error ? err : new Error(String(err));
        await prisma.fundReportDistributionLog.create({
          data: {
            jobId: params.jobId,
            eventType: "FAILED",
            payload: { attempt, code: err?.code },
            message: lastError.message,
          },
        });
        if (attempt < FUND_REPORT_MAX_EMAIL_RETRIES && isTransientSmtpError(err)) {
          await new Promise((r) => setTimeout(r, backoffMs(attempt)));
          continue;
        }
        throw lastError;
      }
    }
    throw lastError || new Error("Email send failed");
  }
}
