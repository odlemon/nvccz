/**
 * UAT — Street Exchange Rate Display core (HTTP).
 * Run: npm run uat:exchange-rate-display:core
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

  const ingest = await api("POST", "/exchange-rate-display/ingest/run", {}, token);
  log("ingest run", ingest.status === 200, `status ${ingest.status} ingested=${ingest.json?.data?.ingested?.join(",")}`);

  const widget = await api(
    "GET",
    "/exchange-rate-display/widget?context=DASHBOARD_ACCOUNTING&from=USD&to=ZWG",
    undefined,
    token
  );
  log("widget", widget.status === 200, `pair=${widget.json?.data?.pair} primary=${widget.json?.data?.primary?.avg}`);

  const compare = await api(
    "GET",
    "/exchange-rate-display/rates/compare?from=USD&to=ZWG",
    undefined,
    token
  );
  log("compare", compare.status === 200, `spread=${compare.json?.data?.spread?.absolute ?? "n/a"}`);

  const configs = await api("GET", "/exchange-rate-display/configs", undefined, token);
  log("configs", configs.status === 200, `count ${configs.json?.data?.length ?? 0}`);

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nUAT complete: ${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
