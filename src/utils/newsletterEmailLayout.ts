import type { EmailBranding } from "./emailBranding";
import { fetchLogoInlineAttachment, type NewsletterInlineAttachment } from "./newsletterEmailImages";

export function escapeHtmlForEmail(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Inline logo for transactional mail (same approach as internal newsletters). */
export async function fetchNewsletterTransactionalLogoAttachment(
  branding: EmailBranding,
  cid = "transactional-logo@nvccz"
): Promise<{ imgTag: string; attachment: NewsletterInlineAttachment | null }> {
  if (!branding.logoUrl) {
    return { imgTag: "", attachment: null };
  }
  try {
    const att = await fetchLogoInlineAttachment(branding.logoUrl, { cid });
    if (!att) return { imgTag: "", attachment: null };
    const alt = escapeHtmlForEmail(branding.companyName);
    const imgTag = `<img src="cid:${att.cid}" alt="${alt}" width="64" height="64" style="width:64px;height:64px;border-radius:999px;object-fit:cover;display:inline-block;border:2px solid rgba(255,255,255,0.6);" />`;
    return { imgTag, attachment: att };
  } catch {
    return { imgTag: "", attachment: null };
  }
}

export function buildNewsletterHeaderTr(
  branding: EmailBranding,
  opts: { taglineEscaped: string; logoImgTagOrEmpty: string }
): string {
  const esc = escapeHtmlForEmail;
  const companyNameEsc = esc(branding.companyName);
  const addressBlock =
    branding.addressLines.length > 0
      ? `<div style="margin-top:10px;font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.5;color:#cbd5f5;">${branding.addressLines
          .map((l) => `<div>${esc(l)}</div>`)
          .join("")}</div>`
      : "";
  return `
      <tr>
        <td style="background:linear-gradient(135deg,#0f172a 0%,#1e3a8a 100%);padding:24px 28px;color:#ffffff;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr>
              <td style="vertical-align:middle;">
                <div style="font-family:Helvetica,Arial,sans-serif;font-size:20px;font-weight:700;letter-spacing:0.2px;line-height:1.2;">${companyNameEsc}</div>
                <div style="margin-top:4px;font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:2px;text-transform:uppercase;opacity:0.85;">${opts.taglineEscaped}</div>
                ${addressBlock}
              </td>
              <td style="vertical-align:middle;text-align:right;width:84px;">
                ${opts.logoImgTagOrEmpty}
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
}

export function buildNewsletterMetaTr(metaLineEscaped: string): string {
  return `
      <tr>
        <td style="padding:18px 28px 0 28px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
            <tr>
              <td style="font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#64748b;letter-spacing:1.5px;text-transform:uppercase;">${metaLineEscaped}</td>
            </tr>
          </table>
        </td>
      </tr>`;
}

export function buildNewsletterTitleTr(titleEscaped: string): string {
  return `
      <tr>
        <td style="padding:6px 28px 14px 28px;">
          <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.25;color:#0f172a;font-weight:700;">${titleEscaped}</h1>
          <div style="margin-top:14px;height:3px;width:48px;background:#1e3a8a;border-radius:2px;"></div>
        </td>
      </tr>`;
}

export function buildNewsletterBodyContentTr(innerHtml: string): string {
  return `
      <tr>
        <td style="padding:20px 28px 8px 28px;">
          <div style="font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.7;color:#1f2937;">
            ${innerHtml}
          </div>
        </td>
      </tr>`;
}

export function buildNewsletterFooterTr(
  branding: EmailBranding,
  opts?: { audienceNoteEscaped?: string }
): string {
  const esc = escapeHtmlForEmail;
  const companyNameEsc = esc(branding.companyName);
  const contactPieces: string[] = [];
  if (branding.contactEmail) contactPieces.push(esc(branding.contactEmail));
  if (branding.contactPhone) contactPieces.push(`Tel: ${esc(branding.contactPhone)}`);
  if (branding.website) contactPieces.push(esc(String(branding.website).replace(/^https?:\/\//, "")));
  const contactHtml = contactPieces.length
    ? `<div style="margin-top:6px;font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#cbd5f5;">${contactPieces.join(" &nbsp;·&nbsp; ")}</div>`
    : "";
  const addressFooterHtml =
    branding.addressLines.length > 0
      ? `<div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:#cbd5f5;">${branding.addressLines
          .map((l) => esc(l))
          .join(" &nbsp;·&nbsp; ")}</div>`
      : "";
  const year = new Date().getFullYear();
  const audience =
    opts?.audienceNoteEscaped ||
    `You are receiving this because you are associated with ${companyNameEsc}. This is an automated message — please do not reply.`;
  return `
      <tr>
        <td style="background:#0f172a;padding:22px 28px;color:#e2e8f0;">
          <div style="font-family:Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;color:#ffffff;">${companyNameEsc}</div>
          ${addressFooterHtml}
          ${contactHtml}
          <div style="margin-top:12px;border-top:1px solid #1e293b;padding-top:10px;font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#94a3b8;">
            © ${year} ${companyNameEsc}. All rights reserved. &nbsp;·&nbsp; ${audience}
          </div>
        </td>
      </tr>`;
}

/**
 * Full HTML document: same outer shell and 600px card as internal newsletter broadcast emails.
 * `innerRowsHtml` should be concatenated <tr>…</tr> rows (typically header + optional meta + title + body + footer).
 */
export function buildNewsletterEmailDocumentHtml(params: {
  pageTitleEscaped: string;
  preheaderEscaped: string;
  innerRowsHtml: string;
  extraHeadInner?: string;
}): string {
  const headExtra = params.extraHeadInner ? `\n    ${params.extraHeadInner}\n` : "";
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <title>${params.pageTitleEscaped}</title>${headExtra}
  </head>
  <body style="margin:0;padding:0;background:#eef2f7;font-family:Helvetica,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;color:transparent;">${params.preheaderEscaped}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#eef2f7;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:600px;max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.08);">
            ${params.innerRowsHtml}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buildNewsletterTransactionalEmailRows(params: {
  branding: EmailBranding;
  logoImgTag: string;
  headerTagline: string;
  emailHeading: string;
  metaLine?: string | null;
  bodyInnerHtml: string;
  footerAudienceNote?: string;
}): string {
  const esc = escapeHtmlForEmail;
  const headerTr = buildNewsletterHeaderTr(params.branding, {
    taglineEscaped: esc(params.headerTagline),
    logoImgTagOrEmpty: params.logoImgTag,
  });
  const metaTr =
    params.metaLine && String(params.metaLine).trim()
      ? buildNewsletterMetaTr(esc(String(params.metaLine).trim()))
      : "";
  const titleTr = buildNewsletterTitleTr(esc(params.emailHeading));
  const bodyTr = buildNewsletterBodyContentTr(params.bodyInnerHtml);
  const footerTr = buildNewsletterFooterTr(params.branding, {
    audienceNoteEscaped: params.footerAudienceNote ? esc(params.footerAudienceNote) : undefined,
  });
  return `${headerTr}${metaTr}${titleTr}${bodyTr}${footerTr}`;
}

/** Encode a URL for use inside double-quoted HTML attributes (logo src). */
export function escapeAttrForEmail(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/**
 * One transactional email page: same shell as internal newsletters (grey canvas, 600px white card).
 * Pass `headerAndTitleTrsHtml` from `renderTransactionalEmailHeaderRows` (see `emailBranding.ts`) and body HTML.
 */
export function wrapTransactionalNewsletterEmailDocument(params: {
  pageTitle: string;
  preheader: string;
  headerAndTitleTrsHtml: string;
  bodyInnerHtml: string;
  footerTrHtml: string;
  extraHeadInner?: string;
}): string {
  const esc = escapeHtmlForEmail;
  const bodyTr = buildNewsletterBodyContentTr(params.bodyInnerHtml);
  const innerRows = `${params.headerAndTitleTrsHtml}${bodyTr}${params.footerTrHtml}`;
  return buildNewsletterEmailDocumentHtml({
    pageTitleEscaped: esc(params.pageTitle),
    preheaderEscaped: esc(params.preheader),
    innerRowsHtml: innerRows,
    extraHeadInner: params.extraHeadInner,
  });
}
