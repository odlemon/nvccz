// @ts-nocheck
/** Helpers to embed newsletter images as CID attachments (reliable across SMTP clients vs remote URLs). */

const FETCH_TIMEOUT_MS = 15_000;
const MAX_BODY_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_COVER_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_BODY_IMAGES = 24;

const DEFAULT_UA = "NVCCZ-NewsletterMailer/1.0";

/** Nodemailer attachment shape that references `cid:<id>` in HTML. */
export type NewsletterInlineAttachment = {
  filename: string;
  content: Buffer;
  cid: string;
  contentType?: string;
  contentDisposition: "inline";
};

function trimBase(raw: string | undefined): string {
  return String(raw || "")
    .trim()
    .replace(/\/$/, "");
}

/**
 * Absolute URL usable by server-side fetch (newsletter MIME assembly).
 */
export function resolveAbsoluteImageUrl(src: string, opts?: { publicBase?: string | null }): string | null {
  const s = String(src ?? "").trim();
  if (!s || /^cid:/i.test(s) || /^data:/i.test(s)) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("//")) return `https:${s}`;
  if (s.startsWith("/")) {
    const base = trimBase(opts?.publicBase || process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || "");
    if (!base) return null;
    return `${base}${s}`;
  }
  return null;
}

async function fetchImageBytes(
  url: string,
  maxBytes: number = MAX_BODY_IMAGE_BYTES
): Promise<{ buffer: Buffer; contentType?: string } | null> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      signal: ac.signal,
      redirect: "follow",
      headers: { "User-Agent": DEFAULT_UA, Accept: "image/*,*/*" }
    });
    if (!resp.ok) return null;
    const contentType = resp.headers.get("content-type") || undefined;
    const raw = Buffer.from(await resp.arrayBuffer());
    if (raw.length === 0 || raw.length > maxBytes) return null;
    return { buffer: raw, contentType };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function extFromType(ct: string | undefined, fallback = "jpg"): string {
  if (!ct) return fallback;
  const lower = ct.toLowerCase();
  if (lower.includes("png")) return "png";
  if (lower.includes("gif")) return "gif";
  if (lower.includes("webp")) return "webp";
  if (lower.includes("svg")) return "svg";
  if (lower.includes("jpeg") || lower.includes("jpg")) return "jpg";
  return fallback;
}

/**
 * Replace `<img src="…">` in HTML with `cid:` references and produce matching inline attachments.
 */
export async function inlineExternalImagesInNewsletterHtml(
  html: string,
  opts?: { publicBase?: string | null }
): Promise<{ html: string; attachments: NewsletterInlineAttachment[] }> {
  const attachments: NewsletterInlineAttachment[] = [];
  /** Resolved absolute URL → cid */
  const absToCid = new Map<string, string>();

  const collectAbsFromTag = (tag: string): string | null => {
    const ms = tag.match(/\bsrc\s*=\s*(["'])([^"']*)\1/i);
    if (!ms) return null;
    return resolveAbsoluteImageUrl(ms[2], opts);
  };

  /** Discover unique absolute URLs in document order */
  const orderedUnique: string[] = [];
  const seen = new Set<string>();
  for (const tag of html.match(/<img\b[^>]*>/gi) || []) {
    const abs = collectAbsFromTag(tag);
    if (!abs || seen.has(abs)) continue;
    if (orderedUnique.length >= MAX_BODY_IMAGES) continue;
    seen.add(abs);
    orderedUnique.push(abs);
  }

  for (const abs of orderedUnique) {
    const got = await fetchImageBytes(abs, MAX_BODY_IMAGE_BYTES);
    if (!got) continue;
    const cid = `nl-img-${attachments.length}-${Date.now().toString(36)}@nvccz`;
    absToCid.set(abs, cid);
    const ext = extFromType(got.contentType);
    attachments.push({
      filename: `inline-${attachments.length}.${ext}`,
      content: got.buffer,
      cid,
      contentType: got.contentType,
      contentDisposition: "inline"
    });
  }

  const outHtml = html.replace(/<img\b[^>]*>/gi, (tag) => {
    const ms = tag.match(/\bsrc\s*=\s*(["'])([^"']*)\1/i);
    if (!ms) return tag;
    const quote = ms[1];
    const raw = ms[2];
    const abs = resolveAbsoluteImageUrl(raw, opts);
    if (!abs) return tag;
    const cid = absToCid.get(abs);
    if (!cid) return tag;
    return tag.replace(/\bsrc\s*=\s*(["'])([^"']*)\1/i, () => `src=${quote}cid:${cid}${quote}`);
  });

  return { html: outHtml, attachments };
}

/** Inline attachment for cover image from upload buffer (avoids bogus DB URLs like `inline_upload`). */
export function coverImageInlineAttachment(params: {
  content: Buffer;
  contentType: string;
  filename?: string;
}): NewsletterInlineAttachment | null {
  const content = params.content;
  if (!content || content.length === 0 || content.length > 8 * 1024 * 1024) return null;
  const ext =
    params.contentType?.includes("png")
      ? "png"
      : params.contentType?.includes("gif")
        ? "gif"
        : params.contentType?.includes("webp")
          ? "webp"
          : "jpg";
  const safeName =
    params.filename?.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) ||
    `newsletter-cover.${ext}`;
  return {
    filename: safeName,
    content,
    cid: `newsletter-cover@nvccz`,
    contentType: params.contentType || `image/${ext}`,
    contentDisposition: "inline"
  };
}

export type FetchCoverInlineOptions = {
  /** Shown as attachment name in clients like Gmail; default `newsletter-cover` (hero image). */
  filenameBase?: string;
  /** CID referenced in HTML; default `newsletter-cover@nvccz`. */
  cid?: string;
  maxBytes?: number;
};

/** Fetch remote **hero/cover** image URL as inline attachment; default filename `newsletter-cover`. For letterhead logos use {@link fetchLogoInlineAttachment}. */
export async function fetchCoverInlineAttachment(
  imageUrl: string,
  opts?: FetchCoverInlineOptions
): Promise<NewsletterInlineAttachment | null> {
  const abs = resolveAbsoluteImageUrl(imageUrl);
  if (!abs) return null;
  const maxBytes = opts?.maxBytes ?? MAX_COVER_IMAGE_BYTES;
  const got = await fetchImageBytes(abs, maxBytes);
  if (!got) return null;
  const ext = extFromType(got.contentType);
  const filenameBase = (opts?.filenameBase || "newsletter-cover").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80);
  const cid = opts?.cid || "newsletter-cover@nvccz";
  return {
    filename: `${filenameBase}.${ext}`,
    content: got.buffer,
    cid,
    contentType: got.contentType,
    contentDisposition: "inline"
  };
}

/**
 * Letterhead / company logo as a CID inline attachment.
 * Uses filename `logo.<ext>` (never `newsletter-cover`) so general and transactional mail look correct in Gmail.
 */
export async function fetchLogoInlineAttachment(
  imageUrl: string,
  opts?: { cid?: string; filenameBase?: string }
): Promise<NewsletterInlineAttachment | null> {
  return fetchCoverInlineAttachment(imageUrl, {
    filenameBase: opts?.filenameBase ?? "logo",
    cid: opts?.cid ?? "branding-logo@nvccz",
  });
}
