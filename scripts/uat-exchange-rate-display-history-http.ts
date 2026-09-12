/**
 * UAT — Street Exchange Rate Display history (HTTP).
 * Run: npm run uat:exchange-rate-display:history
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

  await api("POST", "/exchange-rate-display/ingest/run", {}, token);

  const history = await api(
    "GET",
    "/exchange-rate-display/rates/history?source=ZIMRATE_STREET&from=USD&to=ZWG",
    undefined,
    token
  );
  log("history street", history.status === 200, `points ${history.json?.data?.length ?? 0}`);

  const manual = await api(
    "POST",
    "/exchange-rate-display/quotes/manual",
    { fromCurrencyCode: "USD", toCurrencyCode: "ZWG", avg: 33.33, bid: 33.0, ask: 33.66 },
    token
  );
  log("manual override", manual.status === 201, `status ${manual.status}`);

  const internalHist = await api(
    "GET",
    "/exchange-rate-display/rates/history?source=INTERNAL&from=USD&to=ZWG",
    undefined,
    token
  );
  log("history internal", internalHist.status === 200, `points ${internalHist.json?.data?.length ?? 0}`);

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nUAT complete: ${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
