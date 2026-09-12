/**
 * UAT — Fundraising LP Pipeline RBAC (HTTP).
 * Run: npm run uat:fundraising:rbac
 */
import "dotenv/config";

const BASE = process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3009}/api`;
const ADMIN_EMAIL = process.env.UAT_EMAIL ?? process.env.E2E_ADMIN_EMAIL ?? "admin@nts.com";
const ADMIN_PASSWORD = process.env.UAT_PASSWORD ?? process.env.E2E_ADMIN_PASSWORD ?? "admin123";

const results: Array<{ step: string; ok: boolean; detail: string }> = [];

function log(step: string, ok: boolean, detail: string) {
  results.push({ step, ok, detail });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${step}: ${detail}`);
}

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = (await res.json()) as { token?: string };
  return json.token || "";
}

async function api(method: string, path: string, token?: string) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: token ? `Bearer ${token}` : "" },
  });
  return res.status;
}

async function main() {
  const adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  log("admin login", Boolean(adminToken), adminToken ? "ok" : "failed");

  const listStatus = await api("GET", "/fundraising/campaigns", adminToken);
  log("admin list campaigns", listStatus === 200, `status ${listStatus}`);

  const noAuth = await api("GET", "/fundraising/campaigns");
  log("unauthenticated denied", noAuth === 401, `status ${noAuth}`);

  const passed = results.filter((r) => r.ok).length;
  console.log(`\nUAT fundraising rbac: ${passed}/${results.length} passed`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
