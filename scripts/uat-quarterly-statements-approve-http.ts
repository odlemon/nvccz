/**
 * UAT — Quarterly Client Statements approve flow (HTTP).
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3009}/api`;
const EMAIL = process.env.UAT_EMAIL ?? process.env.E2E_ADMIN_EMAIL ?? "admin@nts.com";
const PASSWORD = process.env.UAT_PASSWORD ?? process.env.E2E_ADMIN_PASSWORD ?? "admin123";

const results: Array<{ step: string; ok: boolean; detail: string }> = [];

function log(step: string, ok: boolean, detail: string) {
  results.push({ step, ok, detail });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${step}: ${detail}`);
}

async function login() {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const json = (await res.json()) as { token?: string };
  return json.token || "";
}

async function api(method: string, path: string, token: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function main() {
  const token = await login();
  log("admin login", Boolean(token), token ? "ok" : "failed");
  if (!token) process.exit(1);

  const run = await prisma.quarterlyStatementRun.findFirst({
    where: { status: "REVIEW" },
    orderBy: { createdAt: "desc" },
    include: { recipients: true },
  });

  if (!run) {
    log("find REVIEW run", false, "none — run core UAT first");
    process.exit(1);
  }
  log("find REVIEW run", true, run.id);

  const submit = await api("POST", `/quarterly-statements/runs/${run.id}/submit-review`, token);
  log("submit review", submit.status === 200, `status ${submit.status}`);

  const approve = await api("POST", `/quarterly-statements/runs/${run.id}/approve`, token);
  log("approve (admin bypass maker=checker)", approve.status === 200, `status ${approve.status}`);

  const after = await prisma.quarterlyStatementRun.findUnique({ where: { id: run.id } });
  log("run COMPLETED", after?.status === "COMPLETED", `status ${after?.status}`);

  const published = await prisma.quarterlyStatementRecipient.count({
    where: { runId: run.id, status: "PUBLISHED" },
  });
  log("recipients published", published > 0, `count ${published}`);

  const passed = results.filter((r) => r.ok).length;
  console.log(`\nUAT quarterly statements approve: ${passed}/${results.length} passed`);
  await prisma.$disconnect();
  process.exit(passed === results.length ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
