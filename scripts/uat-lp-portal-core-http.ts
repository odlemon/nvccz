/**
 * UAT — LP Portal core (HTTP).
 * Run: npm run uat:lp-portal:core
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

  const clients = await api("GET", "/clients?limit=1", undefined, token);
  const clientId = clients.json?.data?.clients?.[0]?.id || clients.json?.data?.[0]?.id;
  log("resolve client", Boolean(clientId), clientId || "none");

  if (clientId) {
    const dash = await api("GET", `/lp-portal/dashboard?clientId=${clientId}`, undefined, token);
    log("dashboard (GP impersonation)", dash.status === 200, `status ${dash.status}`);

    const ledger = await api("GET", `/lp-portal/ledger?clientId=${clientId}`, undefined, token);
    log("ledger", ledger.status === 200, `entries ${ledger.json?.data?.length ?? 0}`);

    const vault = await api("GET", `/lp-portal/vault?clientId=${clientId}`, undefined, token);
    log("vault", vault.status === 200, `docs ${vault.json?.data?.length ?? 0}`);

    const reports = await api("GET", `/lp-portal/reports?clientId=${clientId}`, undefined, token);
    log("reports", reports.status === 200, `count ${reports.json?.data?.length ?? 0}`);
  } else {
    log("skip LP routes", true, "no client in DB");
  }

  const oldPortal = await api("GET", "/fund-reporting/lp/portal", undefined, token);
  log("legacy /fund-reporting/lp removed", oldPortal.status === 404, `status ${oldPortal.status}`);

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nUAT complete: ${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
