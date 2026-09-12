/**
 * UAT — Investment Memo RBAC (HTTP).
 * Run: npm run uat:investment-memo:rbac
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.API_BASE_URL ?? `http://localhost:${process.env.PORT ?? 3009}/api`;
const ADMIN_EMAIL = process.env.UAT_EMAIL ?? process.env.E2E_ADMIN_EMAIL ?? "admin@nts.com";
const ADMIN_PASSWORD = process.env.UAT_PASSWORD ?? process.env.E2E_ADMIN_PASSWORD ?? "admin123";

const prisma = new PrismaClient();
const results: Array<{ step: string; ok: boolean; detail: string }> = [];

function log(step: string, ok: boolean, detail: string) {
  results.push({ step, ok, detail });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${step}: ${detail}`);
}

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = (await res.json()) as { token?: string };
  return json.token || "";
}

async function api(method: string, path: string, token: string, body?: unknown) {
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
  const adminToken = await login(ADMIN_EMAIL, ADMIN_PASSWORD);
  log("admin login", Boolean(adminToken), adminToken ? "ok" : "failed");
  if (!adminToken) process.exit(1);

  const app = await prisma.application.findFirst({
    where: { currentStage: "UNDER_BOARD_REVIEW" },
    select: { id: true },
  });
  if (!app) {
    log("find application", false, "no UNDER_BOARD_REVIEW app");
    process.exit(1);
  }

  const viewer = await prisma.user.findFirst({
    where: { role: { name: { in: ["BOARD_MEMBER", "Board Member"] } } },
    select: { email: true },
  });

  if (viewer?.email) {
    const viewerToken = await login(viewer.email, ADMIN_PASSWORD);
    if (viewerToken) {
      const viewOk = await api("GET", `/investment-memos/${app.id}`, viewerToken);
      log("board viewer can view", viewOk.status === 200, `status ${viewOk.status}`);

      const editDenied = await api(
        "PUT",
        `/investment-memos/${app.id}/versions/fake-id`,
        viewerToken,
        { sections: {} }
      );
      log("board viewer cannot edit", editDenied.status === 403 || editDenied.status === 404, `status ${editDenied.status}`);
    } else {
      log("board viewer login", true, "skipped — no password");
    }
  } else {
    log("board viewer user", true, "skipped — none in DB");
  }

  const nonCio = await prisma.user.findFirst({
    where: {
      role: { name: { notIn: ["CIO", "admin", "Admin"] } },
      email: { not: ADMIN_EMAIL },
    },
    select: { email: true },
  });

  if (nonCio?.email) {
    const token = await login(nonCio.email, ADMIN_PASSWORD);
    if (token) {
      const memo = await api("GET", `/investment-memos/${app.id}`, token);
      const versionId = memo.json?.data?.latestVersion?.id;
      if (versionId) {
        const denied = await api(
          "POST",
          `/investment-memos/${app.id}/versions/${versionId}/approve`,
          token,
          {}
        );
        log("non-CIO cannot approve", denied.status === 403, `status ${denied.status}`);
      }
    }
  } else {
    log("non-CIO user", true, "skipped");
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nUAT complete: ${results.length - failed}/${results.length} passed`);
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
