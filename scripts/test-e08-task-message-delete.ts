/**
 * E.08 — Task chat message delete (author-only, list hides soft-deleted, HTTP DELETE /messages/:msgId).
 *
 * Run: npx ts-node --transpile-only scripts/test-e08-task-message-delete.ts
 *
 * Phase 1: TaskCollaborationService + Prisma (needs DATABASE_URL).
 * Phase 2: HTTP against API (needs server + TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD or defaults from test-cashbook script).
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import { TaskCollaborationService } from "../src/services/TaskCollaborationService";

function teamIds(team: unknown): string[] {
  if (!team) return [];
  if (Array.isArray(team)) return team.filter((x): x is string => typeof x === "string");
  if (typeof team === "string") {
    try {
      const p = JSON.parse(team);
      return Array.isArray(p) ? p.filter((x: unknown): x is string => typeof x === "string") : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function runServiceTests() {
  const tasks = await prisma.task.findMany({
    where: { isTrashed: false },
    take: 100,
    orderBy: { updatedAt: "desc" }
  });
  const task =
    tasks.find((t) => {
      const team = teamIds(t.team);
      return team.some((id) => id !== t.createdBy);
    }) || tasks.find((t) => t.createdBy);

  if (!task?.createdBy) {
    throw new Error("E08: no suitable task with createdBy");
  }

  const authorId = task.createdBy;
  const created = await TaskCollaborationService.createTaskComment({
    taskId: task.id,
    actorId: authorId,
    content: `E.08 delete test ${Date.now()}`,
    mentionUserIds: [],
    files: []
  });

  const listedBefore = await TaskCollaborationService.listTaskComments(task.id, authorId);
  if (!listedBefore.some((m) => m.id === created.id)) {
    throw new Error("E08: new message missing from listTaskComments before delete");
  }

  const del = await TaskCollaborationService.deleteTaskComment(task.id, created.id, authorId);
  if (!del.isDeleted || del.taskId !== task.id || del.id !== created.id) {
    throw new Error("E08: deleteTaskComment returned unexpected shape");
  }

  const listedAfter = await TaskCollaborationService.listTaskComments(task.id, authorId);
  if (listedAfter.some((m) => m.id === created.id)) {
    throw new Error("E08: soft-deleted message still in listTaskComments");
  }

  const single = await TaskCollaborationService.getTaskChatMessage(task.id, created.id, authorId);
  if (!single.isDeleted || single.content !== null) {
    throw new Error("E08: getTaskChatMessage should show isDeleted and null content");
  }

  // Cross-user: teammate cannot delete author's message
  const team = teamIds(task.team);
  const otherId = team.find((id) => id !== authorId);
  if (otherId) {
    const m2 = await TaskCollaborationService.createTaskComment({
      taskId: task.id,
      actorId: authorId,
      content: `E.08 cross-user ${Date.now()}`,
      mentionUserIds: [],
      files: []
    });
    let threw = false;
    try {
      await TaskCollaborationService.deleteTaskComment(task.id, m2.id, otherId);
    } catch (e: any) {
      threw = String(e?.message || e).includes("only delete your own");
    }
    if (!threw) {
      throw new Error("E08: expected non-author delete to fail");
    }
    await TaskCollaborationService.deleteTaskComment(task.id, m2.id, authorId);
  }

  console.log(JSON.stringify({ phase: "service", uat: "E.08", pass: true, taskId: task.id }, null, 2));
}

async function runHttpTests() {
  const BASE = process.env.API_BASE_URL || `http://127.0.0.1:${process.env.PORT || "3009"}`;
  const EMAIL = process.env.TEST_ADMIN_EMAIL || "admin@nts.com";
  const PASSWORD = process.env.TEST_ADMIN_PASSWORD || "admin123";

  async function req(method: string, path: string, opts: { token?: string; body?: object } = {}) {
    const url = `${BASE}${path}`;
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json"
    };
    if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
    const r = await fetch(url, {
      method,
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
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
    body: { email: EMAIL, password: PASSWORD }
  });
  if (login.status !== 200 || !login.json?.token || !login.json?.user?.id) {
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
  const userId = login.json.user.id as string;

  const owned = await prisma.task.findFirst({
    where: { createdBy: userId, isTrashed: false },
    select: { id: true }
  });
  if (!owned) {
    console.log(
      JSON.stringify(
        {
          phase: "http",
          skipped: true,
          reason: "no task with createdBy matching logged-in user for HTTP smoke"
        },
        null,
        2
      )
    );
    return;
  }

  const taskId = owned.id;
  const body = { content: `E.08 http ${Date.now()}`, mentionUserIds: [] };
  const post = await req("POST", `/api/tasks/${taskId}/messages`, { token, body });
  if (post.status !== 201 || !post.json?.data?.id) {
    throw new Error(`E08 HTTP POST message failed: ${post.status} ${post.text?.slice(0, 200)}`);
  }
  const msgId = post.json.data.id as string;

  const list1 = await req("GET", `/api/tasks/${taskId}/messages`, { token });
  if (list1.status !== 200 || !Array.isArray(list1.json?.messages)) {
    throw new Error(`E08 HTTP GET messages failed: ${list1.status}`);
  }
  if (!list1.json.messages.some((m: any) => m.id === msgId)) {
    throw new Error("E08 HTTP: posted message not in list before delete");
  }

  const del = await req("DELETE", `/api/tasks/${taskId}/messages/${msgId}`, { token });
  if (del.status !== 200 || !del.json?.success) {
    throw new Error(`E08 HTTP DELETE failed: ${del.status} ${del.text?.slice(0, 300)}`);
  }

  const list2 = await req("GET", `/api/tasks/${taskId}/messages`, { token });
  if (list2.json.messages.some((m: any) => m.id === msgId)) {
    throw new Error("E08 HTTP: message still listed after DELETE");
  }

  console.log(JSON.stringify({ phase: "http", uat: "E.08", pass: true, taskId, msgId }, null, 2));
}

async function main() {
  await runServiceTests();
  await runHttpTests();
}

main()
  .catch((e) => {
    console.error("E08_TEST_FAILED", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
