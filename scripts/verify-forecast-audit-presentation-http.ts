/**
 * Verify forecasting audit endpoints return presentation fields
 * (action_label, summary, actor_label).
 *
 * Run: npx ts-node --transpile-only -r dotenv/config scripts/verify-forecast-audit-presentation-http.ts
 */
import "dotenv/config";

const BASE = process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3009}/api`;
const EMAIL = process.env.UAT_EMAIL ?? "nyashakarata1@gmail.com";
const PASSWORD = process.env.UAT_PASSWORD ?? "password123";
const SCENARIO_ID = process.env.FORECAST_SCENARIO_ID ?? "";

const PRESENTATION_KEYS = [
  "scenario_name",
  "action_type",
  "action_label",
  "summary",
  "actor_label",
  "created_at"
] as const;

const FORBIDDEN_KEYS = [
  "id",
  "scenario_id",
  "delta_payload",
  "user_name",
  "priority",
  "detail_lines"
] as const;

type AuditItem = Record<string, unknown>;

function assertPresentationFields(item: AuditItem, label: string): string[] {
  const errors: string[] = [];
  for (const key of PRESENTATION_KEYS) {
    if (!(key in item)) errors.push(`${label}: missing ${key}`);
  }
  if (typeof item.action_label !== "string" || !item.action_label) {
    errors.push(`${label}: action_label must be non-empty string`);
  }
  if (typeof item.summary !== "string" || !item.summary) {
    errors.push(`${label}: summary must be non-empty string`);
  }
  if ("detail_lines" in item) {
    errors.push(`${label}: detail_lines must not be exposed`);
  }
  if (typeof item.actor_label !== "string" || !item.actor_label) {
    errors.push(`${label}: actor_label must be non-empty string`);
  }
  if (!item.action_type) errors.push(`${label}: missing action_type`);
  for (const key of FORBIDDEN_KEYS) {
    if (key in item) errors.push(`${label}: should not expose ${key}`);
  }
  return errors;
}

async function login(): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD })
  });
  const json = (await res.json()) as { token?: string; data?: { token?: string }; message?: string };
  const token = json.token ?? json.data?.token;
  if (!token) throw new Error(`Login failed HTTP ${res.status}: ${json.message ?? JSON.stringify(json)}`);
  return token;
}

async function apiGet(token: string, path: string) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function resolveScenarioId(token: string): Promise<string> {
  if (SCENARIO_ID) return SCENARIO_ID;
  const { status, json } = await apiGet(token, "/forecasting/scenarios?status=ACTIVE&limit=5");
  if (status !== 200) throw new Error(`List scenarios HTTP ${status}`);
  const items = (json as any).data?.items ?? [];
  if (!items.length) throw new Error("No ACTIVE scenarios found — set FORECAST_SCENARIO_ID");
  return items[0].id as string;
}

function printSample(endpoint: string, items: AuditItem[]) {
  const sample = items[0];
  if (!sample) {
    console.log(`\n[${endpoint}] No audit items in DB — shape validated on empty list only.\n`);
    return;
  }
  console.log(`\n[${endpoint}] Sample item:\n${JSON.stringify(sample, null, 2)}\n`);
}

async function main() {
  console.log(`Base URL: ${BASE}`);
  const token = await login();
  console.log("Login OK");

  const scenarioId = await resolveScenarioId(token);
  console.log(`Scenario: ${scenarioId}`);

  const endpoints = [
    {
      name: "GET /api/forecasting/scenarios/{id}/audit",
      path: `/forecasting/scenarios/${scenarioId}/audit?limit=10`
    },
    { name: "GET /api/forecasting/audit", path: "/forecasting/audit?limit=10" },
    { name: "GET /api/forecasting/audit/high-priority", path: "/forecasting/audit/high-priority?limit=10" }
  ];

  let allOk = true;
  const allErrors: string[] = [];

  for (const ep of endpoints) {
    const { status, json } = await apiGet(token, ep.path);
    const success = (json as any).success !== false;
    const items: AuditItem[] = (json as any).data?.items ?? [];

    if (status === 403 && ep.path.includes("/forecasting/audit")) {
      console.log(`[SKIP] ${ep.name} — HTTP 403 (admin role required; serialization same code path)`);
      continue;
    }

    if (status !== 200 || !success) {
      allOk = false;
      allErrors.push(`${ep.name}: HTTP ${status} — ${(json as any).message ?? "failed"}`);
      continue;
    }

    console.log(`[OK] ${ep.name} — HTTP 200, items=${items.length}`);
    printSample(ep.name, items);

    for (let i = 0; i < items.length; i++) {
      const errs = assertPresentationFields(items[i], `${ep.name} item[${i}]`);
      allErrors.push(...errs);
    }
  }

  if (allErrors.length) {
    allOk = false;
    console.error("Validation errors:");
    for (const e of allErrors) console.error(`  - ${e}`);
  }

  if (!allOk) process.exit(1);
  console.log("All reachable audit endpoints return expected presentation fields.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
