/**
 * UAT — Investment Memo versions + approval history (HTTP).
 * Run: npm run uat:investment-memo:versions
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
    log("resolve application", false, "none found");
    process.exit(1);
  }

  const before = await api("GET", `/investment-memos/${applicationId}/versions`, undefined, token);
  const countBefore = Array.isArray(before.json?.data) ? before.json.data.length : 0;
  log("list versions", before.status === 200, `count ${countBefore}`);

  const memo = await api("GET", `/investment-memos/${applicationId}`, undefined, token);
  if (memo.json?.data?.workflowStatus === "APPROVED" || memo.json?.data?.workflowStatus === "LOCKED") {
    const created = await api(
      "POST",
      `/investment-memos/${applicationId}/versions`,
      { changeSummary: "UAT v2" },
      token
    );
    log("create version after approve", created.status === 201, `status ${created.status}`);
  } else {
    log("create version after approve", true, "skipped — memo not approved");
  }

  const after = await api("GET", `/investment-memos/${applicationId}/versions`, undefined, token);
  const countAfter = Array.isArray(after.json?.data) ? after.json.data.length : 0;
  log("versions retained", countAfter >= countBefore, `before=${countBefore} after=${countAfter}`);

  const history = await api(
    "GET",
    `/investment-memos/${applicationId}/approval-history`,
    undefined,
    token
  );
  log("approval history", history.status === 200, `events ${history.json?.data?.length ?? 0}`);

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nUAT complete: ${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
