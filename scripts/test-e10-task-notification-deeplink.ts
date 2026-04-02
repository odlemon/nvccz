/**
 * E.10 — Verify task notifications expose deep link fields (path, modalTarget, taskId).
 *
 * Phase 1: mergeTaskNotificationData() edge cases (no HTTP).
 * Phase 2: GET /api/homepage/notifications with JWT (optional if API up).
 * Phase 3: DB row shape — latest TASK_* per user must merge to include path + modalTarget.
 *
 * Run: npx ts-node --transpile-only scripts/test-e10-task-notification-deeplink.ts
 */
import "dotenv/config";
import { mergeTaskNotificationData } from "../src/utils/taskNotificationDeepLink";
import { buildTaskDeepLink } from "../src/services/TaskCollaborationService";
import { prisma } from "../src/utils/database";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function runMergeTests() {
  const tid = "cmtk_test_task_123";
  const full = buildTaskDeepLink(tid, "cmk_comment_1");
  let merged = mergeTaskNotificationData("TASK_MENTION", full, "Task", tid) as Record<string, unknown>;
  assert(merged.path === `/tasks/${tid}`, "full stored data: path");
  assert(merged.modalTarget === "kanban-task", "full stored data: modalTarget");
  assert(merged.taskId === tid, "full stored data: taskId");
  assert(merged.commentId === "cmk_comment_1", "full stored data: commentId");

  merged = mergeTaskNotificationData("TASK_ASSIGNED", { taskId: tid }, "Task", tid) as Record<string, unknown>;
  assert(merged.path === `/tasks/${tid}`, "legacy {taskId} only: path");
  assert(merged.modalTarget === "kanban-task", "legacy: modalTarget");
  assert(merged.taskId === tid, "legacy: taskId");

  merged = mergeTaskNotificationData("TASK_RED_ZONE", null, "Task", tid) as Record<string, unknown>;
  assert(merged?.path === `/tasks/${tid}`, "null data + relatedEntity: path");
  assert(merged?.modalTarget === "kanban-task", "null data + relatedEntity: modalTarget");

  const passthrough = mergeTaskNotificationData("GOAL_BEHIND", { goalId: "g1", path: "/x" }, "PerformanceGoal", "g1");
  assert((passthrough as Record<string, unknown>).goalId === "g1", "non-task type must pass data through");

  console.log(JSON.stringify({ phase: "merge", pass: true }, null, 2));
}

async function verifyDbTaskNotifications() {
  const sample = await prisma.notification.findFirst({
    where: { type: { in: ["TASK_ASSIGNED", "TASK_MENTION", "TASK_RED_ZONE"] } },
    orderBy: { createdAt: "desc" }
  });
  if (!sample) {
    console.log(JSON.stringify({ phase: "db", skipped: true, reason: "no TASK_* notifications in DB" }, null, 2));
    return;
  }
  const merged = mergeTaskNotificationData(sample.type, sample.data, sample.relatedEntity, sample.relatedEntityId) as Record<
    string,
    unknown
  >;
  assert(typeof merged.taskId === "string" && merged.taskId.length > 0, "db sample: taskId");
  assert(merged.path === `/tasks/${merged.taskId}`, "db sample: path matches taskId");
  assert(merged.modalTarget === "kanban-task", "db sample: modalTarget");
  console.log(
    JSON.stringify(
      {
        phase: "db",
        pass: true,
        notificationId: sample.id,
        type: sample.type,
        storedDataKeys: sample.data && typeof sample.data === "object" ? Object.keys(sample.data as object) : [],
        mergedKeys: Object.keys(merged)
      },
      null,
      2
    )
  );
}

async function runHttpTests() {
  const BASE = process.env.API_BASE_URL || `http://127.0.0.1:${process.env.PORT || "3009"}`;
  const EMAIL = process.env.TEST_ADMIN_EMAIL || "admin@nts.com";
  const PASSWORD = process.env.TEST_ADMIN_PASSWORD || "admin123";

  async function req(
    method: string,
    path: string,
    opts: { token?: string; jsonBody?: object } = {}
  ) {
    const url = `${BASE}${path}`;
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(opts.jsonBody ? { "Content-Type": "application/json" } : {})
    };
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    const r = await fetch(url, {
      method,
      headers,
      body: opts.jsonBody ? JSON.stringify(opts.jsonBody) : undefined
    });
    const text = await r.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { _raw: text };
    }
    return { status: r.status, json, text };
  }

  const login = await req("POST", "/api/auth/login", {
    jsonBody: { email: EMAIL, password: PASSWORD }
  });
  if (login.status !== 200 || !login.json?.token) {
    console.log(
      JSON.stringify(
        {
          phase: "http",
          skipped: true,
          reason: "login failed — start API or set TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD",
          status: login.status
        },
        null,
        2
      )
    );
    return;
  }

  const token = login.json.token as string;
  const list = await req("GET", "/api/homepage/notifications?limit=100", { token });
  if (list.status !== 200 || !list.json?.data?.notifications) {
    throw new Error(`E10 HTTP list failed: ${list.status} ${list.text?.slice(0, 200)}`);
  }

  const items = list.json.data.notifications as Array<{ type: string; data: any; relatedEntity?: string }>;
  const taskOnes = items.filter((n) => ["TASK_ASSIGNED", "TASK_MENTION", "TASK_RED_ZONE"].includes(n.type));
  if (taskOnes.length === 0) {
    console.log(
      JSON.stringify(
        {
          phase: "http",
          pass: true,
          note: "no task notifications in first 100 items; merge + db phases still validated",
          totalItems: items.length
        },
        null,
        2
      )
    );
    return;
  }

  for (const n of taskOnes) {
    const d = n.data || {};
    assert(typeof d.taskId === "string" && d.taskId.length > 0, `HTTP ${n.type}: taskId`);
    assert(d.path === `/tasks/${d.taskId}`, `HTTP ${n.type}: path`);
    assert(d.modalTarget === "kanban-task", `HTTP ${n.type}: modalTarget`);
  }

  console.log(
    JSON.stringify(
      {
        phase: "http",
        pass: true,
        checkedTaskNotifications: taskOnes.length,
        typesSeen: [...new Set(taskOnes.map((n) => n.type))]
      },
      null,
      2
    )
  );
}

async function main() {
  runMergeTests();
  await verifyDbTaskNotifications();
  await runHttpTests();
}

main()
  .catch((e) => {
    console.error("E10_TEST_FAILED", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
