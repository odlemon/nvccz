/**
 * A.05 UAT — Pillar weights on strategy: must include all four BSC pillars and total exactly 100%.
 */
import "dotenv/config";

const BASE = process.env.API_BASE_URL || `http://127.0.0.1:${process.env.PORT || "3009"}`;
const EMAIL = process.env.TEST_ADMIN_EMAIL || "admin@nts.com";
const PASSWORD = process.env.TEST_ADMIN_PASSWORD || "admin123";

const VALID = {
  Financial: 25,
  "Customer & Market": 25,
  "Internal Operations": 25,
  "Learning, Growth & HR": 25
};

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
  console.error("A.05 UAT FAILED:", msg);
  process.exit(1);
}

function baseBody(pillarWeights: Record<string, number>) {
  return {
    title: `A.05 UAT pillar weights ${Date.now()}`,
    periodStart: "2027-01-01T00:00:00.000Z",
    periodEnd: "2027-12-31T23:59:59.999Z",
    visionStatement: null,
    strategicGoalId: null,
    strategyDocumentUrl: null,
    pillarWeights,
    metadata: { uat: "A05" }
  };
}

async function main() {
  console.log("A.05 UAT — BASE:", BASE);

  const login = await req("POST", "/api/auth/login", {
    jsonBody: { email: EMAIL, password: PASSWORD }
  });
  if (login.status !== 200 || !login.json?.token) {
    fail(`Login failed (${login.status}). Start API and check credentials.`);
  }
  const token = login.json.token as string;

  // Sum 90 — should fail
  let r = await req("POST", "/api/performance/config/strategies", {
    token,
    jsonBody: baseBody({
      Financial: 30,
      "Customer & Market": 20,
      "Internal Operations": 20,
      "Learning, Growth & HR": 20
    })
  });
  if (r.json?.success !== false) {
    fail(`Expected rejection for total 90, got ${r.status} success=${r.json?.success}`);
  }
  if (!String(r.json?.message || "").includes("100")) {
    fail(`Expected message about 100%, got: ${r.json?.message}`);
  }
  console.log("OK: total 90 rejected —", String(r.json?.message).slice(0, 120));

  // Missing one pillar
  r = await req("POST", "/api/performance/config/strategies", {
    token,
    jsonBody: baseBody({
      Financial: 25,
      "Customer & Market": 25,
      "Internal Operations": 25
    } as any)
  });
  if (r.json?.success !== false) {
    fail("Expected rejection for missing pillar");
  }
  console.log("OK: missing pillar rejected —", String(r.json?.message).slice(0, 100));

  // Valid 40/30/20/10 = 100
  r = await req("POST", "/api/performance/config/strategies", {
    token,
    jsonBody: baseBody({
      Financial: 40,
      "Customer & Market": 30,
      "Internal Operations": 20,
      "Learning, Growth & HR": 10
    })
  });
  if (r.status !== 200 || r.json?.success !== true || !r.json?.data?.id) {
    fail(`Valid weights failed: ${r.status} ${r.text?.slice(0, 400)}`);
  }
  const id = r.json.data.id as string;
  const pw = r.json.data.pillarWeights;
  const sum =
    Number(pw.Financial) +
    Number(pw["Customer & Market"]) +
    Number(pw["Internal Operations"]) +
    Number(pw["Learning, Growth & HR"]);
  if (Math.abs(sum - 100) > 0.0001) {
    fail(`Stored pillarWeights sum to ${sum}, expected 100`);
  }
  console.log("OK: valid split 40/30/20/10 saved — id:", id, "sum:", sum);

  const arch = await req("POST", `/api/performance/config/strategies/${id}/archive`, { token });
  if (arch.status !== 200 || arch.json?.success !== true) {
    console.warn("WARN: archive failed:", arch.text?.slice(0, 200));
  } else {
    console.log("OK: archived test strategy", id);
  }

  console.log("\nA.05 UAT passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
