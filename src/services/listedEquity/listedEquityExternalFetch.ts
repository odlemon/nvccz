import https from "https";

/** Windows / corporate SSL inspection often breaks Node fetch to CloudFront, Yahoo, etc. */
export function marketDataAllowInsecureTls(): boolean {
  return (
    process.env.LISTED_EQUITY_ALLOW_INSECURE_TLS === "1" ||
    process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0"
  );
}

/** Axios / legacy HTTPS clients (Zimrate). */
export function marketDataHttpsAgent(): https.Agent | undefined {
  if (!marketDataAllowInsecureTls()) return undefined;
  return new https.Agent({ rejectUnauthorized: false });
}

/** Shared fetch for listed-equity external scrapers (VFEX, Yahoo, FastBull, Mansa, …). */
export async function marketDataFetch(url: string, init?: RequestInit): Promise<Response> {
  if (!marketDataAllowInsecureTls()) {
    return fetch(url, init);
  }
  const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  try {
    return await fetch(url, init);
  } finally {
    if (previous === undefined) {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    } else {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous;
    }
  }
}
