// @ts-nocheck
import { createHash, randomBytes } from "crypto";

export const FUND_REPORT_ATTACH_MAX_BYTES = Number(
  process.env.FUND_REPORT_ATTACH_MAX_BYTES || 10 * 1024 * 1024
);
export const FUND_REPORT_LINK_TTL_DAYS = Number(process.env.FUND_REPORT_LINK_TTL_DAYS || 7);
export const FUND_REPORT_EMAIL_CONCURRENCY = Math.min(
  64,
  Math.max(1, Number(process.env.FUND_REPORT_EMAIL_CONCURRENCY || 10))
);
export const FUND_REPORT_MAX_EMAIL_RETRIES = 3;

export function sha256Buffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export function generateDownloadToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

export function backoffMs(retryCount: number): number {
  return Math.pow(2, retryCount) * 10_000;
}

export async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<Array<{ index: number; error: Error }>> {
  const failures: Array<{ index: number; error: Error }> = [];
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) break;
      try {
        await worker(items[i], i);
      } catch (e: any) {
        failures.push({ index: i, error: e instanceof Error ? e : new Error(String(e)) });
      }
    }
  });
  await Promise.all(runners);
  return failures;
}

export function normalizeEmail(email: unknown): string | null {
  const s = String(email || "")
    .trim()
    .toLowerCase();
  if (!s || !s.includes("@")) return null;
  return s;
}

export function fmtMoney(n: number, currency = "USD"): string {
  return `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}
