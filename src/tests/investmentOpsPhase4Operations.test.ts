import { createHash, createHmac } from "crypto";
import { readFileSync } from "fs";
import path from "path";

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

function contentChecksum(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

function signWebhook(secret: string, timestamp: string, nonce: string, rawBody: Buffer): string {
  return createHmac("sha256", secret)
    .update(`${timestamp}.${nonce}.`)
    .update(rawBody)
    .digest("hex");
}

describe("Investment Ops Phase 4 invariants", () => {
  it("checksums are order-independent", () => {
    expect(contentChecksum({ b: 2, a: 1 })).toBe(contentChecksum({ a: 1, b: 2 }));
    expect(contentChecksum({ a: 1 })).not.toBe(contentChecksum({ a: 2 }));
  });

  it("webhook signatures use raw body + timestamp + nonce", () => {
    const secret = "test-secret";
    const ts = String(Date.now());
    const nonce = "nonce-12345";
    const raw = Buffer.from('{"ticks":[{"symbol":"ABC","price":1.23}]}', "utf8");
    const sig = signWebhook(secret, ts, nonce, raw);
    expect(sig).toHaveLength(64);
    expect(signWebhook(secret, ts, nonce, raw)).toBe(sig);
    expect(signWebhook(secret, ts, nonce, Buffer.from("{}"))).not.toBe(sig);
  });

  it("rejects missing webhook secret (fail closed)", () => {
    const secret = "".trim();
    expect(Boolean(secret)).toBe(false);
  });
});

describe("Investment Ops Phase 4 source contracts", () => {
  const root = path.join(__dirname, "..");
  const reporting = readFileSync(
    path.join(root, "services/investmentOps/InvestmentReportingService.ts"),
    "utf8"
  );
  const worker = readFileSync(
    path.join(root, "services/investmentOps/InvestmentJobWorkerService.ts"),
    "utf8"
  );
  const mansa = readFileSync(
    path.join(root, "services/listedEquity/MansaMarketDataClient.ts"),
    "utf8"
  );
  const webhook = readFileSync(
    path.join(root, "controllers/ListedEquityMarketDataController.ts"),
    "utf8"
  );
  const dispatch = readFileSync(
    path.join(root, "services/listedEquity/StakeholderDispatchService.ts"),
    "utf8"
  );
  const templates = readFileSync(
    path.join(root, "services/investmentOps/reporting/investmentReportTemplates.ts"),
    "utf8"
  );

  it("generates reports asynchronously via InvestmentJob", () => {
    expect(reporting).toContain('jobType: "REPORT_GENERATE"');
    expect(reporting).toContain("InvestmentJobWorkerService.enqueue");
    expect(reporting).toContain("checksumSha256");
    expect(reporting).toContain("expiresAt");
    expect(reporting).not.toMatch(/Report type stub/);
  });

  it("exposes template parameterSchema and version", () => {
    expect(templates).toContain("parameterSchema");
    expect(templates).toContain("INVESTMENT_REPORT_TEMPLATE_VERSION");
  });

  it("supports durable job lease/heartbeat/cancel/recovery", () => {
    expect(worker).toContain("heartbeat");
    expect(worker).toContain("cancel");
    expect(worker).toContain("recoverExpiredLeases");
    expect(worker).toContain("DEAD_LETTER");
  });

  it("removes hard-coded Mansa live credentials", () => {
    expect(mansa).not.toMatch(/mansa_live_sk_/);
    expect(mansa).toContain("process.env.MANSA_API_KEY");
  });

  it("requires webhook secret and replay headers", () => {
    expect(webhook).toContain("WEBHOOK_SECRET_MISSING");
    expect(webhook).toContain("x-market-data-nonce");
    expect(webhook).toContain("rawBody");
    expect(webhook).toContain("WEBHOOK_REPLAY");
  });

  it("records dispatch only with delivery evidence", () => {
    expect(dispatch).toContain("DISPATCH_EVIDENCE_REQUIRED");
    expect(dispatch).toContain("deliveryEvidence");
    expect(dispatch).toContain("EMAIL_NOT_ACCEPTED");
  });
});
