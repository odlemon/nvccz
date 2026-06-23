/**
 * UAT — Investment Memo core workflow (HTTP).
 * Run: npm run uat:investment-memo:core
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
  const json = (await res.json()) as { token?: string };
  return json.token || "";
}

async function api(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: token ? `Bearer ${token}` : "",
      "Content-Type": "application/json",
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function filledSections() {
  return {
    executiveSummary: "Executive summary UAT",
    investmentThesis: "Thesis UAT",
    marketOpportunity: "Market UAT",
    companyOverview: "Company UAT",
    financialAnalysis: "Financial UAT",
    risksAndMitigants: "Risks UAT",
    dealTerms: "Deal terms UAT",
    recommendation: "Proceed UAT",
    overallScore: 85,
  };
}

async function main() {
  const token = await login();
  log("admin login", Boolean(token), token ? "token ok" : "failed");
  if (!token) process.exit(1);

  const apps = await api(
    "GET",
    "/applications?currentStage=UNDER_BOARD_REVIEW&limit=1",
    undefined,
    token
  );
  const applicationId =
    apps.json?.data?.applications?.[0]?.id ||
    apps.json?.data?.[0]?.id ||
    apps.json?.applications?.[0]?.id;

  if (!applicationId) {
    log("resolve UNDER_BOARD_REVIEW application", false, "none found — skip workflow");
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\nUAT complete: ${results.length - failed}/${results.length} passed`);
    process.exit(failed ? 1 : 0);
  }
  log("resolve application", true, applicationId);

  const memo = await api("GET", `/investment-memos/${applicationId}`, undefined, token);
  log("GET memo", memo.status === 200, `status ${memo.status}`);

  const versionId = memo.json?.data?.latestVersion?.id || memo.json?.data?.currentVersionId;
  if (!versionId) {
    log("resolve version", false, "no version id");
    process.exit(1);
  }

  const save = await api(
    "PUT",
    `/investment-memos/${applicationId}/versions/${versionId}?validate=true`,
    { sections: filledSections() },
    token
  );
  log("save draft + validate", save.status === 200, `status ${save.status}`);

  const submit = await api(
    "POST",
    `/investment-memos/${applicationId}/versions/${versionId}/submit`,
    {},
    token
  );
  log("submit for approval", submit.status === 200, `status ${submit.status}`);

  const approve = await api(
    "POST",
    `/investment-memos/${applicationId}/versions/${versionId}/approve`,
    { comment: "UAT approve" },
    token
  );
  log("CIO approve", approve.status === 200, `status ${approve.status} workflow=${approve.json?.data?.workflowStatus}`);

  const legacy = await fetch(`${BASE}/board-reviews/${applicationId}/investment-memorandum`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: new FormData(),
  });
  log("legacy IM upload deprecated", legacy.status === 409, `status ${legacy.status}`);

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nUAT complete: ${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
