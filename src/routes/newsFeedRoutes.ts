import express from "express";
import axios from "axios";

type FeedSource = { id: string; name: string; url: string; fallbackUrl?: string };
type NewsItem = {
  article_id: string;
  title: string;
  link: string;
  description?: string;
  pubDate: string;
  source_id: string;
  source_name: string;
  source_url: string;
  category: string[];
  language: string;
};

const sources: FeedSource[] = [
  { id: "yahoo-finance", name: "Yahoo Finance", url: "https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EGSPC,MSFT,AAPL&region=US&lang=en-US" },
  { id: "the-herald", name: "The Herald", url: "https://news.google.com/rss/search?q=site%3Aherald.co.zw+Zimbabwe+business&hl=en-US&gl=US&ceid=US%3Aen" },
  // The publisher feed is intermittently unavailable; this public, source-filtered RSS fallback keeps the source live.
  { id: "financial-gazette", name: "The Financial Gazette", url: "https://news.google.com/rss/search?q=%22Financial+Gazette%22+Zimbabwe+business&hl=en-US&gl=US&ceid=US%3Aen" },
  { id: "bloomberg", name: "Bloomberg", url: "https://feeds.bloomberg.com/markets/news.rss", fallbackUrl: "https://news.google.com/rss/search?q=site%3Abloomberg.com%20markets&hl=en-US&gl=US&ceid=US%3Aen" },
  { id: "sky-news", name: "Sky News", url: "https://feeds.skynews.com/feeds/rss/business.xml" },
  { id: "sabc", name: "SABC", url: "https://www.sabcnews.com/sabcnews/feed/" },
  { id: "zbc", name: "ZBC", url: "https://news.google.com/rss/search?q=site%3Azbcnews.co.zw+Zimbabwe&hl=en-US&gl=US&ceid=US%3Aen" },
  { id: "african-financials", name: "African Financials", url: "https://news.google.com/rss/search?q=%22African+Financials%22+markets&hl=en-US&gl=US&ceid=US%3Aen" },
  { id: "african-markets", name: "African Markets", url: "https://news.google.com/rss/search?q=site%3Aafrican-markets.com&hl=en-US&gl=US&ceid=US%3Aen" },
];

let cache: { expiresAt: number; items: NewsItem[]; statuses: Record<string, string> } | null = null;

function decode(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

function tag(xml: string, name: string): string {
  const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return match ? decode(match[1]) : "";
}

function parseFeed(xml: string, source: FeedSource): NewsItem[] {
  return [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].slice(0, 12).map((match, index) => {
    const item = match[1];
    const title = tag(item, "title");
    const link = tag(item, "link") || tag(item, "guid");
    const pubDate = tag(item, "pubDate") || tag(item, "published") || new Date().toISOString();
    return {
      article_id: `${source.id}-${Buffer.from(`${link}-${index}`).toString("base64url")}`,
      title: title || `${source.name} update`, link, description: tag(item, "description"), pubDate,
      source_id: source.id, source_name: source.name, source_url: source.url,
      category: [source.name], language: "en",
    };
  }).filter((item) => item.title && item.link);
}

const router = express.Router();
// News is public market information. Keeping this feed unauthenticated lets the
// employee-hub render source headlines even before a session is hydrated, while
// the feed contains no internal records or user data.

router.get("/", async (_req, res): Promise<void> => {
  if (cache && cache.expiresAt > Date.now()) {
    res.json({ status: "success", totalResults: cache.items.length, results: cache.items, sources: cache.statuses, cached: true });
    return;
  }
  const statuses: Record<string, string> = {};
  const results = await Promise.all(sources.map(async (source) => {
    try {
      let response;
      try {
        response = await axios.get<string>(source.url, { timeout: 8000, responseType: "text", headers: { "User-Agent": "Matanho-News/1.0" } });
      } catch (primaryError) {
        if (!source.fallbackUrl) throw primaryError;
        response = await axios.get<string>(source.fallbackUrl, { timeout: 8000, responseType: "text", headers: { "User-Agent": "Matanho-News/1.0" } });
      }
      const items = parseFeed(response.data, source);
      statuses[source.id] = items.length ? "ok" : "empty";
      return items;
    } catch {
      statuses[source.id] = "unavailable";
      return [];
    }
  }));
  const items = results.flat().sort((a, b) => Date.parse(b.pubDate) - Date.parse(a.pubDate)).slice(0, 60);
  cache = { expiresAt: Date.now() + 5 * 60 * 1000, items, statuses };
  res.json({ status: "success", totalResults: items.length, results: items, sources: statuses, cached: false });
});

export default router;
