/**
 * UAT — Fund Performance Reporting (HTTP core).
 * Run: npm run uat:fund-reporting:core
 */
import "dotenv/config";

const BASE = process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3009}/api`;
const EMAIL = process.env.UAT_EMAIL ?? process.env.E2E_ADMIN_EMAIL ?? "admin@nts.com";
const PASSWORD = process.env.UAT_PASSWORD ?? process.env.E2E_ADMIN_PASSWORD ?? "admin123";

const results: Array<{ step: string; ok: boolean; detail: string }> = [];

function log(step: string, ok: boolean, detail: string) {
  results.push({ step, ok, detail });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${step}: ${detail}`);
}

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const json = (await res.json()) as { token?: string; data?: { token?: string } };
  return json.token || json.data?.token || "";
}

async function api(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  const token = await login();
  log("login", Boolean(token), token ? "admin token" : "failed");
  if (!token) process.exit(1);

  const templates = await api("GET", "/fund-reporting/templates", undefined, token);
  log("list templates", templates.status === 200, `status ${templates.status}`);

  let templateId = templates.json?.data?.[0]?.id;
  if (!templateId) {
    const created = await api(
      "POST",
      "/fund-reporting/templates",
      {
        name: "UAT Investor Pack",
        reportLevel: "INVESTOR",
        description: "UAT template",
      },
      token
    );
    templateId = created.json?.data?.id;
    log("create template", created.status === 201 && Boolean(templateId), templateId || "no id");
  }

  const funds = await api("GET", "/funds?limit=1", undefined, token);
  const fundId = funds.json?.data?.funds?.[0]?.id || funds.json?.data?.[0]?.id;
  log("resolve fund", Boolean(fundId), fundId || "no fund");

  if (fundId && templateId) {
    const lists = await api(
      "POST",
      "/fund-reporting/distribution-lists",
      { fundId, name: "UAT All LPs", sourceType: "COMMITMENT_COHORT" },
      token
    );
    const listId = lists.json?.data?.id;
    log("create distribution list", lists.status === 201, listId || `status ${lists.status}`);

    const end = new Date();
    const start = new Date(end);
    start.setMonth(start.getMonth() - 3);

    const run = await api(
      "POST",
      "/fund-reporting/runs",
      {
        fundId,
        templateId,
        periodStart: start.toISOString().slice(0, 10),
        periodEnd: end.toISOString().slice(0, 10),
        distributionListId: listId,
      },
      token
    );
    const runId = run.json?.data?.id;
    log("trigger run", run.status === 202 && Boolean(runId), runId || `status ${run.status}`);

    if (runId) {
      await new Promise((r) => setTimeout(r, 3000));
      const detail = await api("GET", `/fund-reporting/runs/${runId}`, undefined, token);
      log(
        "get run detail",
        detail.status === 200,
        `status ${detail.json?.data?.status} targets ${detail.json?.data?.targetCount}`
      );
      const logs = await api("GET", `/fund-reporting/runs/${runId}/logs`, undefined, token);
      log("run logs", logs.status === 200, `events ${logs.json?.data?.length ?? 0}`);
    }
  }

  const oldPortal = await api("GET", "/fund-reporting/lp/portal", undefined, token);
  log(
    "legacy LP route removed",
    oldPortal.status === 404,
    `expected 404 — status ${oldPortal.status}`
  );

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nUAT complete: ${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
