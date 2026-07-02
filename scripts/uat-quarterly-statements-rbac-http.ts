/**
 * UAT — Quarterly Client Statements RBAC (HTTP).
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

async function login(email: string, password: string) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = (await res.json()) as { token?: string };
  return json.token || "";
}

async function main() {
  const token = await login(EMAIL, PASSWORD);
  log("admin login", Boolean(token), token ? "ok" : "failed");

  const list = await fetch(`${BASE}/quarterly-statements/runs`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  log("admin list runs", list.status === 200, `status ${list.status}`);

  const noAuth = await fetch(`${BASE}/quarterly-statements/runs`);
  log("unauthenticated denied", noAuth.status === 401, `status ${noAuth.status}`);

  const passed = results.filter((r) => r.ok).length;
  console.log(`\nUAT quarterly statements rbac: ${passed}/${results.length} passed`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
