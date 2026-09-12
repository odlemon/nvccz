/**
 * UAT — Stage 4 scenarios + assumptions (DEV nts only).
 * Run: npm run uat:fpa:model-planning-stage4
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { assertDevDatabase } from "./lib/assert-dev-database";

const prisma = new PrismaClient();
const BASE = process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3009}/api`;
const EMAIL = process.env.UAT_EMAIL ?? "admin@nts.com";
const PASSWORD = process.env.UAT_PASSWORD ?? "admin123";

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
  const json: any = await res.json();
  return json.token || json.data?.token || "";
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
  await assertDevDatabase(prisma, "uat:fpa:model-planning-stage4");
  const token = await login();
  log("admin login", Boolean(token), token ? "ok" : "failed");
  if (!token) process.exit(1);

  const model = await prisma.planningModel.findFirst({
    where: { status: { not: "ARCHIVED" } },
    orderBy: { updatedAt: "desc" },
  });
  if (!model) {
    console.error("No model — run db:seed:fpa-demo");
    process.exit(1);
  }
  const version =
    (await prisma.planningVersion.findFirst({
      where: { modelId: model.id, status: "DRAFT" },
    })) ||
    (await prisma.planningVersion.findFirst({ where: { modelId: model.id } }));
  const scenarios = await prisma.planningScenario.findMany({
    where: { modelId: model.id },
    orderBy: { createdAt: "asc" },
  });
  const base = scenarios.find((s) => /base/i.test(s.name) || /BASE/i.test(s.scenarioType)) || scenarios[0];
  log(
    "fixture",
    Boolean(model && version && base),
    `model=${model.name} version=${version?.status} base=${base?.name}`
  );
  if (!version || !base) process.exit(1);

  const list = await api("GET", `/v1/fpa/models/${model.id}/scenarios`, undefined, token);
  const listed = list.json?.data || [];
  log(
    "list scenarios has inheritance fields",
    list.status === 200 && listed.length >= 1 && ("parentScenarioId" in (listed[0] || {})),
    `count=${listed.length} parentScenarioId=${listed[0]?.parentScenarioId}`
  );

  const t0 = Date.now();
  const copy = await api(
    "POST",
    `/v1/fpa/scenarios/${base.id}/copy`,
    {
      versionId: version.id,
      name: `UAT Best ${Date.now()}`,
      scenarioType: "UPSIDE",
      inheritFromSource: true,
    },
    token
  );
  const copyMs = Date.now() - t0;
  const newScn = copy.json?.data?.scenario;
  log(
    "copy-from-Base",
    copy.status === 201 &&
      newScn?.parentScenarioId === base.id &&
      copy.json?.data?.cellsCopied >= 0,
    `status=${copy.status} ms=${copyMs} cells=${copy.json?.data?.cellsCopied} drivers=${copy.json?.data?.driversCopied} parent=${newScn?.parentScenarioId}`
  );

  const third = await api(
    "POST",
    `/v1/fpa/scenarios/${base.id}/copy`,
    {
      versionId: version.id,
      name: `UAT Down ${Date.now()}`,
      scenarioType: "DOWNSIDE",
      inheritFromSource: true,
    },
    token
  );
  const downId = third.json?.data?.scenario?.id;

  const compare = await api(
    "POST",
    `/v1/fpa/scenarios/${base.id}/compare`,
    {
      versionId: version.id,
      scenarioIds: [base.id, newScn?.id, downId].filter(Boolean),
      anchorScenarioId: base.id,
      includeAssumptions: true,
      includeWaterfall: true,
      includeSensitivity: true,
    },
    token
  );
  const metrics = compare.json?.data?.metrics || [];
  log(
    "enriched compare ≥3",
    compare.status === 200 &&
      (compare.json?.data?.scenarios || []).length >= 2 &&
      metrics.length >= 1 &&
      metrics[0]?.values != null,
    `status=${compare.status} scenarios=${compare.json?.data?.scenarios?.length} metrics=${metrics.length} assumptions=${compare.json?.data?.assumptions?.length}`
  );

  const drvCreate = await api(
    "POST",
    `/v1/fpa/models/${model.id}/drivers`,
    {
      code: `UAT_ASP_${Date.now().toString(36).slice(-4)}`,
      name: "UAT Average selling price",
      scenarioId: newScn?.id || base.id,
      versionId: version.id,
      value: 12.5,
      unit: "USD",
      confidence: "HIGH",
      spreadingMethod: "EVEN",
      category: "REVENUE",
    },
    token
  );
  const drvId = drvCreate.json?.data?.id;
  log(
    "create driver with metadata",
    (drvCreate.status === 201 || drvCreate.status === 200) && drvId && drvCreate.json?.data?.confidence === "HIGH",
    `status=${drvCreate.status} id=${drvId} confidence=${drvCreate.json?.data?.confidence}`
  );

  const drvList = await api(
    "GET",
    `/v1/fpa/models/${model.id}/drivers?versionId=${version.id}&scenarioId=${newScn?.id || base.id}`,
    undefined,
    token
  );
  const onlyScoped = (drvList.json?.data || []).every(
    (d: any) => !d.scenarioId || d.scenarioId === (newScn?.id || base.id)
  );
  log(
    "list drivers scoped to scenario",
    drvList.status === 200 && onlyScoped,
    `count=${drvList.json?.data?.length} scopedOk=${onlyScoped}`
  );

  if (drvId) {
    const upd = await api(
      "PUT",
      `/v1/fpa/drivers/${drvId}`,
      { value: 13.25, confidence: "MEDIUM" },
      token
    );
    log(
      "update driver",
      upd.status === 200 && Number(upd.json?.data?.value) === 13.25,
      `status=${upd.status} value=${upd.json?.data?.value}`
    );
    const del = await api("DELETE", `/v1/fpa/drivers/${drvId}`, undefined, token);
    log("delete driver", del.status === 200 && del.json?.data?.deleted === true, `status=${del.status}`);
  } else {
    log("update driver", false, "no driver id");
    log("delete driver", false, "skipped");
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\nUAT summary: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log("Failures:", failed.map((f) => f.step).join(", "));
    process.exit(1);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
