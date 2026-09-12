/**
 * UAT — exports list + board pack download (nts only).
 * Run: npm run uat:fpa:exports
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
  return { status: res.status, json, res };
}

async function main() {
  await assertDevDatabase(prisma, "uat:fpa:exports");
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
  if (!model || !version) {
    log("fixture", false, "no model");
    process.exit(1);
  }

  const bad = await api(
    "POST",
    "/v1/fpa/exports/board-pack",
    { modelId: model.id, exportType: "NOT_A_TYPE" },
    token
  );
  log(
    "unsupported type",
    bad.status === 400 && bad.json?.code === "UNSUPPORTED_EXPORT_TYPE",
    `status=${bad.status} code=${bad.json?.code}`
  );

  const create = await api(
    "POST",
    "/v1/fpa/exports/board-pack",
    {
      modelId: model.id,
      versionId: version.id,
      exportType: "BOARD_PACK",
      period: "2026-Q2",
    },
    token
  );
  const jobId = create.json?.data?.id;
  log("create board pack", create.status === 201 && Boolean(jobId), `id=${jobId}`);

  const list = await api("GET", `/v1/fpa/exports?modelId=${model.id}&limit=10`, undefined, token);
  log(
    "list jobs",
    list.status === 200 && Array.isArray(list.json?.data) && list.json.data.some((j: any) => j.id === jobId),
    `n=${list.json?.data?.length}`
  );

  if (jobId) {
    const dl = await fetch(`${BASE}/v1/fpa/exports/${jobId}/download`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const buf = Buffer.from(await dl.arrayBuffer());
    log("download bytes", dl.status === 200 && buf.length > 100, `status=${dl.status} bytes=${buf.length}`);
  }

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
