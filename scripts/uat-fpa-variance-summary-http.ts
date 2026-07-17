/**
 * UAT — variance summary + enriched results (nts only).
 * Run: npm run uat:fpa:variance-summary
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
  await assertDevDatabase(prisma, "uat:fpa:variance-summary");
  const login = await api("POST", "/auth/login", { email: EMAIL, password: PASSWORD });
  const token = login.json?.token || login.json?.data?.token;
  log("login", Boolean(token), token ? "ok" : "fail");
  if (!token) process.exit(1);

  const model = await prisma.planningModel.findFirst({
    where: { status: { not: "ARCHIVED" } },
    orderBy: { updatedAt: "desc" },
  });
  const version = model
    ? await prisma.planningVersion.findFirst({ where: { modelId: model.id } })
    : null;
  log("fixture", Boolean(model && version), `${model?.name} ver=${version?.id}`);
  if (!model || !version) process.exit(1);

  await api(
    "POST",
    "/v1/fpa/variance/calculate",
    { modelId: model.id, versionId: version.id },
    token
  );

  const list = await api(
    "GET",
    `/v1/fpa/variance/results?modelId=${model.id}&versionId=${version.id}&limit=20`,
    undefined,
    token
  );
  const row = list.json?.data?.[0];
  log(
    "enriched results",
    list.status === 200 && row && ("forecast" in row || "actual" in row),
    `status=${list.status} keys=${row ? Object.keys(row).slice(0, 12).join(",") : "none"}`
  );

  const sum = await api(
    "GET",
    `/v1/fpa/variance/summary?modelId=${model.id}&versionId=${version.id}`,
    undefined,
    token
  );
  const d = sum.json?.data || {};
  log(
    "summary shape",
    sum.status === 200 && d.kpis && Array.isArray(d.tornado) && Array.isArray(d.departments),
    `status=${sum.status} tornado=${d.tornado?.length} depts=${d.departments?.length}`
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
