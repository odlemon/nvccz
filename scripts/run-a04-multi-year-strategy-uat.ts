/**
 * A.04 UAT — Multi-year strategy: POST accepts period > 12 months; invalid range rejected.
 * HTTP against running API. Does not modify docs/performance-uats.md.
 */
import "dotenv/config";

const BASE = process.env.API_BASE_URL || `http://127.0.0.1:${process.env.PORT || "3009"}`;
const EMAIL = process.env.TEST_ADMIN_EMAIL || "admin@nts.com";
const PASSWORD = process.env.TEST_ADMIN_PASSWORD || "admin123";

async function req(method: string, path: string, opts: { token?: string; jsonBody?: object } = {}) {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (opts.jsonBody) headers["Content-Type"] = "application/json";
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const r = await fetch(url, {
    method,
    headers,
    body: opts.jsonBody ? JSON.stringify(opts.jsonBody) : undefined
  });
  const text = await r.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text };
  }
  return { status: r.status, json, text };
}

function fail(msg: string): never {
  console.error("A.04 UAT FAILED:", msg);
  process.exit(1);
}

const pillarWeights = {
  Financial: 25,
  "Customer & Market": 25,
  "Internal Operations": 25,
  "Learning, Growth & HR": 25
};

async function main() {
  console.log("A.04 UAT — BASE:", BASE);

  const login = await req("POST", "/api/auth/login", {
    jsonBody: { email: EMAIL, password: PASSWORD }
  });
  if (login.status !== 200 || !login.json?.token) {
    fail(`Login failed (${login.status}). Start API (npm run dev) and check TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD.`);
  }
  const token = login.json.token as string;

  const bad = await req("POST", "/api/performance/config/strategies", {
    token,
    jsonBody: {
      title: "A.04 UAT invalid range (should fail)",
      periodStart: "2028-01-01T00:00:00.000Z",
      periodEnd: "2026-01-01T00:00:00.000Z",
      visionStatement: null,
      strategicGoalId: null,
      strategyDocumentUrl: null,
      pillarWeights,
      metadata: {}
    }
  });
  if (bad.json?.success !== false) {
    fail(`Expected failure for start >= end, got success=${bad.json?.success} status=${bad.status}`);
  }
  const errMsg = String(bad.json?.message || "");
  if (!errMsg.toLowerCase().includes("before")) {
    fail(`Unexpected error for bad range: "${errMsg}"`);
  }
  console.log("OK: inverted range rejected —", errMsg.slice(0, 100));

  const marker = `A.04 UAT multi-year ${Date.now()}`;
  const periodStart = "2026-01-01T00:00:00.000Z";
  const periodEnd = "2028-12-31T23:59:59.999Z";
  const good = await req("POST", "/api/performance/config/strategies", {
    token,
    jsonBody: {
      title: marker,
      periodStart,
      periodEnd,
      visionStatement: "A.04 automated horizon test",
      strategicGoalId: null,
      strategyDocumentUrl: null,
      pillarWeights,
      metadata: { uat: "A04" }
    }
  });
  if (good.status !== 200 || good.json?.success !== true || !good.json?.data?.id) {
    fail(`Create 3-year strategy failed: ${good.status} ${good.text?.slice(0, 400)}`);
  }
  const d = good.json.data;
  if (d.periodStart !== periodStart || d.periodEnd !== periodEnd) {
    fail(`Date mismatch: got ${d.periodStart} .. ${d.periodEnd}`);
  }
  const ms = new Date(d.periodEnd).getTime() - new Date(d.periodStart).getTime();
  const minMs = 365 * 2 * 24 * 60 * 60 * 1000;
  if (ms < minMs) {
    fail(`Span too short for A.04 (${ms} ms); expected well over 12 months`);
  }
  console.log("OK: 3-year strategy created — id:", d.id, "span days:", Math.round(ms / 86400000));

  const arch = await req("POST", `/api/performance/config/strategies/${d.id}/archive`, { token });
  if (arch.status !== 200 || arch.json?.success !== true) {
    console.warn("WARN: archive failed (cleanup):", arch.status, arch.text?.slice(0, 200));
  } else {
    console.log("OK: archived test strategy", d.id);
  }

  console.log("\nA.04 UAT passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
