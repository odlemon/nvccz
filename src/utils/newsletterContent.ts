// @ts-nocheck

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hasHtml(input: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(input);
}

function toParagraphHtmlFromPlainText(input: string): string {
  const normalized = String(input ?? "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return "";

  const blocks = normalized.split(/\n{2,}/);
  return blocks
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function sanitizeHtml(input: string): string {
  let out = String(input ?? "").trim();
  if (!out) return "";

  // Remove dangerous container tags and comments.
  out = out.replace(/<!--[\s\S]*?-->/g, "");
  out = out.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  out = out.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");
  out = out.replace(/<\/?(iframe|object|embed|link|meta|base|form|input|button|textarea|select)\b[^>]*>/gi, "");

  // Strip event handlers and risky attributes.
  out = out.replace(/\son[a-z]+\s*=\s*(['"]).*?\1/gi, "");
  out = out.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "");
  out = out.replace(/\sstyle\s*=\s*(['"]).*?\1/gi, "");
  out = out.replace(/\sstyle\s*=\s*[^\s>]+/gi, "");

  // Neutralize javascript/data URLs.
  out = out.replace(/\s(href|src)\s*=\s*(['"])\s*(javascript:|data:).*?\2/gi, ` $1="#"`);
  out = out.replace(/\s(href|src)\s*=\s*(javascript:|data:)[^\s>]+/gi, ` $1="#"`);

  // Keep a safe-ish subset of tags used by rich text editors.
  out = out.replace(
    /<(?!\/?(p|br|strong|b|em|i|u|s|ul|ol|li|h1|h2|h3|h4|h5|h6|blockquote|pre|code|a|span|div|img)\b)[^>]*>/gi,
    ""
  );

  return out.trim();
}

function visibleTextFromHtml(html: string): string {
  return String(html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Canonicalize newsletter content so formatting survives create/get/email consistently:
 * - plain text -> paragraph HTML
 * - HTML -> sanitized HTML
 */
export function normalizeNewsletterContent(input: unknown): { html: string; text: string } {
  const raw = String(input ?? "").trim();
  const html = hasHtml(raw) ? sanitizeHtml(raw) : toParagraphHtmlFromPlainText(raw);
  const text = visibleTextFromHtml(html);
  return { html, text };
}

