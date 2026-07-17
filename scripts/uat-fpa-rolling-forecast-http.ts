/**
 * UAT — rolling forecast (nts only).
 * Run: npm run uat:fpa:rolling-forecast
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
  await assertDevDatabase(prisma, "uat:fpa:rolling-forecast");
  const login = await api("POST", "/auth/login", { email: EMAIL, password: PASSWORD });
  const token = login.json?.token || login.json?.data?.token;
  log("login", Boolean(token), token ? "ok" : "fail");
  if (!token) process.exit(1);

  const model = await prisma.planningModel.findFirst({
    where: { status: { not: "ARCHIVED" } },
    orderBy: { updatedAt: "desc" },
  });
  const version = model
    ? await prisma.planningVersion.findFirst({
        where: { modelId: model.id, status: { not: "LOCKED" } },
      })
    : null;
  log("fixture", Boolean(model && version), `${model?.name}`);
  if (!model || !version) process.exit(1);

  const get1 = await api(
    "GET",
    `/v1/fpa/models/${model.id}/rolling-forecast?versionId=${version.id}`,
    undefined,
    token
  );
  log(
    "get summary",
    get1.status === 200 && get1.json?.data?.kpis && Array.isArray(get1.json?.data?.methods),
    `status=${get1.status} method=${get1.json?.data?.activeMethod}`
  );

  const cutoff = await api(
    "PUT",
    `/v1/fpa/models/${model.id}/rolling-forecast/cutoff`,
    { versionId: version.id, actualsCutoff: "2026-03-01", horizonMonths: 12 },
    token
  );
  log(
    "set cutoff",
    cutoff.status === 200 && cutoff.json?.data?.actualsCutoff === "2026-03-01",
    `status=${cutoff.status} cutoff=${cutoff.json?.data?.actualsCutoff}`
  );

  const method = await api(
    "PUT",
    `/v1/fpa/models/${model.id}/rolling-forecast/method`,
    { versionId: version.id, method: "RUN_RATE" },
    token
  );
  log(
    "set method",
    method.status === 200 && method.json?.data?.activeMethod === "RUN_RATE",
    `status=${method.status} method=${method.json?.data?.activeMethod}`
  );

  const roll = await api(
    "POST",
    `/v1/fpa/models/${model.id}/rolling-forecast/roll-forward`,
    { versionId: version.id, months: 1 },
    token
  );
  log(
    "roll forward",
    roll.status === 200 && roll.json?.data?.actualsCutoff === "2026-04-01",
    `status=${roll.status} cutoff=${roll.json?.data?.actualsCutoff}`
  );

  const failed = results.filter((r) => !r.ok);
  console.log(`\npassed=${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
