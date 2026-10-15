import axios from "axios";
import { createHash } from "crypto";
import { lookup } from "dns/promises";
import { isIP } from "net";
import { prisma } from "../utils/database";

type FeedSource = { id: string; name: string; url: string; fallbackUrl?: string };
type ParsedArticle = {
  id: string;
  articleId: string;
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  title: string;
  link: string;
  description: string | null;
  creator: string | null;
  imageUrl: string;
  pubDate: Date;
  language: string;
};

export type NewsIngestReport = {
  publishersAttempted: number;
  discovered: number;
  stored: number;
  existingSkipped: number;
  excludedMissingOrInvalidImage: number;
  failedSources: Array<{ source: string; error: string }>;
  durationMs: number;
};

export const newsSources: FeedSource[] = [
  { id: "yahoo-finance", name: "Yahoo Finance", url: "https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EGSPC,MSFT,AAPL&region=US&lang=en-US" },
  { id: "the-herald", name: "The Herald", url: "https://news.google.com/rss/search?q=site%3Aherald.co.zw+Zimbabwe+business&hl=en-US&gl=US&ceid=US%3Aen" },
  { id: "financial-gazette", name: "The Financial Gazette", url: "https://news.google.com/rss/search?q=%22Financial+Gazette%22+Zimbabwe+business&hl=en-US&gl=US&ceid=US%3Aen" },
  { id: "bloomberg", name: "Bloomberg", url: "https://feeds.bloomberg.com/markets/news.rss", fallbackUrl: "https://news.google.com/rss/search?q=site%3Abloomberg.com%20markets&hl=en-US&gl=US&ceid=US%3Aen" },
  { id: "sky-news", name: "Sky News", url: "https://feeds.skynews.com/feeds/rss/business.xml" },
  { id: "sabc", name: "SABC News", url: "https://www.sabcnews.com/sabcnews/feed/" },
  { id: "zbc", name: "ZBC News", url: "https://news.google.com/rss/search?q=site%3Azbcnews.co.zw+Zimbabwe&hl=en-US&gl=US&ceid=US%3Aen" },
  { id: "african-financials", name: "AfricanFinancials", url: "https://news.google.com/rss/search?q=%22African+Financials%22+markets&hl=en-US&gl=US&ceid=US%3Aen" },
  { id: "african-markets", name: "African Markets", url: "https://news.google.com/rss/search?q=site%3Aafrican-markets.com&hl=en-US&gl=US&ceid=US%3Aen" },
];

function decodeXml(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_m, n: string) => String.fromCodePoint(parseInt(n, 16)));
}

function rawTag(xml: string, name: string): string {
  const escapedName = name.replace(":", "\\:");
  return xml.match(new RegExp(`<${escapedName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapedName}\\s*>`, "i"))?.[1] ?? "";
}

function plainText(xml: string): string {
  return decodeXml(xml).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function attr(xml: string, tagName: string, attribute: string): string {
  const tag = xml.match(new RegExp(`<${tagName}\\b[^>]*>`, "i"))?.[0] ?? "";
  return decodeXml(tag.match(new RegExp(`\\b${attribute}=["']([^"']+)["']`, "i"))?.[1] ?? "");
}

function imageCandidate(item: string): string {
  const enclosure = item.match(/<enclosure\b[^>]*>/i)?.[0] ?? "";
  const media = item.match(/<(?:media:content|media:thumbnail)\b[^>]*>/i)?.[0] ?? "";
  const image = item.match(/<image\b[^>]*>/i)?.[0] ?? "";
  const description = decodeXml(rawTag(item, "description") || rawTag(item, "content:encoded"));
  const img = description.match(/<img\b[^>]*>/i)?.[0] ?? "";
  return attr(enclosure, "enclosure", "url")
    || attr(media, media.includes("thumbnail") ? "media:thumbnail" : "media:content", "url")
    || attr(image, "image", "url")
    || attr(img, "img", "src");
}

function canonicalLink(value: string): string | null {
  try {
    const url = new URL(decodeXml(value).trim());
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return null;
  }
}

function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
      || (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)));
  }
  const normalized = address.toLowerCase();
  return isIP(address) === 6 && /^[23]/.test(normalized) && !normalized.startsWith("2001:db8");
}

export async function isAccessibleCoverImage(value: string): Promise<boolean> {
  let current: URL;
  try { current = new URL(value); } catch { return false; }
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    if (current.protocol !== "https:" || current.username || current.password
      || current.hostname === "localhost" || current.hostname.endsWith(".localhost") || current.hostname.endsWith(".local")) return false;
    try {
      const resolved = await lookup(current.hostname, { all: true, verbatim: true });
      if (!resolved.length || resolved.some(({ address }) => !isPublicAddress(address))) return false;
      const response = await axios.head(current.toString(), {
        timeout: 5000, maxRedirects: 0, validateStatus: () => true,
        headers: { "User-Agent": "Matanho-News/1.0" },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.location;
        if (!location || redirects === 3) return false;
        current = new URL(location, current);
        continue;
      }
      const type = String(response.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
      if (response.status < 200 || response.status >= 300 || !["image/jpeg", "image/png", "image/webp"].includes(type)) return false;
      const explicitSize = current.toString().match(/[=/?_-](?:w|s)?(\d{2,4})[-x](\d{2,4})(?:[-&/?]|$)/i);
      if (explicitSize && (Number(explicitSize[1]) < 1200 || Number(explicitSize[2]) < 600)) return false;
      const image = await axios.get<ArrayBuffer>(current.toString(), {
        timeout: 7000, maxRedirects: 0, maxContentLength: 262144, responseType: "arraybuffer",
        validateStatus: () => true,
        headers: { "User-Agent": "Matanho-News/1.0", Range: "bytes=0-262143" },
      });
      if (![200, 206].includes(image.status)) return false;
      const body = Buffer.from(image.data);
      const dimensions = readImageDimensions(body);
      return !!dimensions && dimensions.width >= 1200 && dimensions.height >= 600;
    } catch {
      return false;
    }
  }
  return false;
}

async function scrapeArticleCover(articleLink: string): Promise<string | null> {
  let current: URL;
  try { current = new URL(articleLink); } catch { return null; }
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    if (current.protocol !== "https:" || current.username || current.password) return null;
    try {
      const resolved = await lookup(current.hostname, { all: true, verbatim: true });
      if (!resolved.length || resolved.some(({ address }) => !isPublicAddress(address))) return null;
      const response = await axios.get<string>(current.toString(), {
        timeout: 5000, maxRedirects: 0, maxContentLength: 1024 * 1024,
        responseType: "text", validateStatus: () => true,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Matanho-News/1.0)", Accept: "text/html" },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.location;
        if (!location || redirects === 3) return null;
        current = new URL(location, current);
        continue;
      }
      if (response.status < 200 || response.status >= 300
        || !String(response.headers["content-type"] ?? "").toLowerCase().includes("text/html")) return null;
      const metas = [...response.data.matchAll(/<meta\b[^>]*>/gi)].map(([tag]) => tag);
      for (const meta of metas) {
        const key = (attr(meta, "meta", "property") || attr(meta, "meta", "name")).toLowerCase();
        if (key !== "og:image" && key !== "og:image:url" && key !== "twitter:image" && key !== "twitter:image:src") continue;
        const value = attr(meta, "meta", "content");
        if (!value) continue;
        try {
          const candidate = new URL(value, current).toString();
          if (await isAccessibleCoverImage(candidate)) return candidate;
        } catch { /* try the next metadata image */ }
      }
      return null;
    } catch { return null; }
  }
  return null;
}

export function readImageDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length >= 30 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    const kind = buffer.toString("ascii", 12, 16);
    if (kind === "VP8X") return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
    if (kind === "VP8 " && buffer.length >= 30 && buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) {
      return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
    }
    if (kind === "VP8L" && buffer.length >= 25 && buffer[20] === 0x2f) {
      const b1 = buffer[22]; const b2 = buffer[23]; const b3 = buffer[24];
      return { width: 1 + (((b2 & 0x3f) << 8) | buffer[21]), height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
    }
  }
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) { offset += 1; continue; }
      const marker = buffer[offset + 1];
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
      const segmentLength = buffer.readUInt16BE(offset + 2);
      if (segmentLength < 2 || offset + 2 + segmentLength > buffer.length) return null;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      offset += 2 + segmentLength;
    }
  }
  return null;
}

async function fetchSource(source: FeedSource): Promise<string> {
  try {
    return (await axios.get<string>(source.url, { timeout: 8000, responseType: "text", headers: { "User-Agent": "Matanho-News/1.0" } })).data;
  } catch (error) {
    if (!source.fallbackUrl) throw error;
    return (await axios.get<string>(source.fallbackUrl, { timeout: 8000, responseType: "text", headers: { "User-Agent": "Matanho-News/1.0" } })).data;
  }
}

export async function parseFeedXml(
  xml: string,
  source: FeedSource,
  imageValidator: (url: string) => Promise<boolean> = isAccessibleCoverImage,
  pageCoverScraper: (url: string) => Promise<string | null> = scrapeArticleCover,
): Promise<{ articles: ParsedArticle[]; excluded: number }> {
  const entries = [...xml.matchAll(/<(?:item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/(?:item|entry)>/gi)].slice(0, 8);
  let excluded = 0;
  const parsed = await Promise.all(entries.map(async (match): Promise<ParsedArticle | null> => {
    const item = match[1];
    const title = plainText(rawTag(item, "title")).slice(0, 512);
    const link = canonicalLink(rawTag(item, "link") || item.match(/<link\b[^>]*href=["']([^"']+)["']/i)?.[1] || rawTag(item, "guid"));
    const pubRaw = plainText(rawTag(item, "pubDate") || rawTag(item, "published") || rawTag(item, "updated"));
    const pubDate = new Date(pubRaw);
    const feedImage = imageCandidate(item);
    let imageUrl = feedImage && await imageValidator(feedImage) ? feedImage : null;
    if (!imageUrl && link) {
      const scrapedImage = await pageCoverScraper(link);
      if (scrapedImage && await imageValidator(scrapedImage)) imageUrl = scrapedImage;
    }
    if (!title || !link || !Number.isFinite(pubDate.getTime()) || !imageUrl) {
      excluded += 1;
      return null;
    }
    const id = createHash("sha256").update(`${source.id}\n${link}`).digest("hex");
    const creator = plainText(rawTag(item, "dc:creator") || rawTag(item, "author")).slice(0, 1000) || null;
    return {
      id, articleId: `${source.id}-${id.slice(0, 40)}`, sourceId: source.id, sourceName: source.name,
      sourceUrl: source.url, title, link, description: plainText(rawTag(item, "description") || rawTag(item, "summary")).slice(0, 5000) || null,
      creator, imageUrl, pubDate, language: "en",
    };
  }));
  return { articles: parsed.filter((article): article is ParsedArticle => article !== null), excluded };
}

export async function ingestNewsArticles(): Promise<NewsIngestReport> {
  const started = Date.now();
  const report: NewsIngestReport = { publishersAttempted: newsSources.length, discovered: 0, stored: 0, existingSkipped: 0, excludedMissingOrInvalidImage: 0, failedSources: [], durationMs: 0 };
  for (const source of newsSources) {
    try {
      const parsed = await parseFeedXml(await fetchSource(source), source);
      report.discovered += parsed.articles.length + parsed.excluded;
      report.excludedMissingOrInvalidImage += parsed.excluded;
      for (const article of parsed.articles) {
        const existing = await prisma.newsArticle.findUnique({ where: { id: article.id }, select: { id: true } });
        if (existing) {
          report.existingSkipped += 1;
          continue;
        }
        await prisma.newsArticle.upsert({ where: { id: article.id }, create: article, update: {
          title: article.title, sourceName: article.sourceName, sourceUrl: article.sourceUrl,
          description: article.description, creator: article.creator, imageUrl: article.imageUrl,
          pubDate: article.pubDate, language: article.language, ingestedAt: new Date(),
        } });
        report.stored += 1;
      }
      console.log(`[news-ingest] ${source.id}: ${parsed.articles.length} eligible; ${parsed.excluded} excluded`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      report.failedSources.push({ source: source.id, error: message.slice(0, 300) });
      console.error(`[news-ingest] ${source.id} failed: ${message}`);
    }
  }
  report.durationMs = Date.now() - started;
  console.log(`[news-ingest] complete ${JSON.stringify(report)}`);
  return report;
}
