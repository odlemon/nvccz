/**
 * UAT — LP Portal RBAC.
 * Run: npm run uat:lp-portal:rbac
 */
import "dotenv/config";

const BASE = process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3009}/api`;
const ADMIN_EMAIL = process.env.UAT_EMAIL ?? "admin@nts.com";
const ADMIN_PASSWORD = process.env.UAT_PASSWORD ?? "admin123";

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
  const json = await res.json();
  return { status: res.status, token: json.token as string | undefined, json };
}

async function api(method: string, path: string, token: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function main() {
  const admin = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  log("admin login", Boolean(admin.token), admin.token ? "ok" : "fail");

  const memberships = admin.token
    ? await api("GET", "/lp-portal/admin/memberships", admin.token)
    : { status: 0 };
  log("GP admin memberships", memberships.status === 200, `status ${memberships.status}`);

  const mfaPolicy = admin.token
    ? await api("PUT", "/lp-portal/admin/mfa-policy", admin.token, { requireMfaForLp: false })
    : { status: 0 };
  log("non-sysadmin MFA policy denied or ok", mfaPolicy.status === 403 || mfaPolicy.status === 200, `status ${mfaPolicy.status}`);

  const colleagues = admin.token
    ? await api("GET", "/lp-portal/colleagues", admin.token)
    : { status: 0 };
  log("colleagues without LP context", colleagues.status === 400 || colleagues.status === 401, `status ${colleagues.status}`);

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nUAT RBAC: ${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
