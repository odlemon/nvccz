/**
 * FP&A <-> Performance bridge check (both directions). Run: npx ts-node --transpile-only -r dotenv/config scripts/uat-fpa-performance-bridge.ts
 * Needs the API on PERFORMANCE_API (default http://127.0.0.1:3009/api). Creates one planning task under an existing workflow and removes it again.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { FpaPlanningPmTaskBridge, FPA_MODEL_PLANNING_PM_CATEGORY } from "../src/services/fpa/FpaPlanningPmTaskBridge";

const prisma = new PrismaClient();
const API = process.env.PERFORMANCE_API || "http://127.0.0.1:3009/api";
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => { if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  - " + detail : ""}`); };
const call = async (token: string, method: string, path: string, body?: any) => {
  const r = await fetch(`${API}${path}`, { method, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
  let j: any = null; try { j = await r.json(); } catch { /* none */ }
  return { status: r.status, body: j };
};

async function main() {
  const login = await (await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@nts.com", password: "admin123" }) })).json();
  const token = login.token; const adminId = login.user.id;
  // a throw-away model and workflow (removed at the end) so the check runs on any database
  const stamp = Date.now();
  const model = await prisma.planningModel.create({ data: { name: "UAT bridge model", code: "UAT-BRIDGE-" + stamp, modelType: "BUDGET", ownerUserId: adminId, baseCurrency: "USD", startPeriod: new Date("2026-01-01"), endPeriod: new Date("2026-12-31"), timeGranularity: "MONTHLY", createdById: adminId } });
  const wf = await prisma.planningWorkflow.create({ data: { modelId: model.id, name: "UAT bridge workflow", workflowType: "BUDGET", createdById: adminId } });
  const pt = await prisma.planningTask.create({ data: { workflowId: wf.id, title: "UAT FP&A slice", assigneeId: adminId, status: "PENDING", dueDate: new Date(Date.now() + 10 * 86400000) } });
  try {
    // FP&A -> Performance: the planning task appears as a Performance task
    const made = await FpaPlanningPmTaskBridge.upsertFromPlanningTask({ planningTaskId: pt.id, title: pt.title, assigneeId: adminId, createdById: adminId, dueDate: pt.dueDate, priority: "HIGH", status: "PENDING", cycleId: wf.id, cycleName: "UAT cycle", taskKind: "PLANNING", skipLookup: true });
    check("FP&A -> Performance: planning task is mirrored as a Performance task", !!made && !!made.id);
    const mine = await call(token, "GET", "/tasks/my");
    const t = (mine.body.tasks || []).find((x: any) => x.id === made!.id);
    check("it is on the assignee's task list, tagged as FP&A planning", !!t && t.category === FPA_MODEL_PLANNING_PM_CATEGORY && t.stage === "todo");
    // Performance -> FP&A
    const start = await call(token, "PUT", `/tasks/${made!.id}/stage`, { stage: "in_progress" });
    const afterStart = await prisma.planningTask.findUnique({ where: { id: pt.id } });
    check("Performance -> FP&A: starting the task marks the planning task IN_PROGRESS", start.status === 200 && afterStart!.status === "IN_PROGRESS", `${start.status} ${afterStart!.status}`);
    const done = await call(token, "PUT", `/tasks/${made!.id}/stage`, { stage: "completed" });
    check("completing it in Performance is refused (FP&A submission workflow is not bypassed)", done.status >= 400 && /Submit the planning slice in FP&A/.test(JSON.stringify(done.body)), `${done.status} ${JSON.stringify(done.body).slice(0, 120)}`);
    const back = await call(token, "PUT", `/tasks/${made!.id}/stage`, { stage: "todo" });
    check("it cannot be pushed back to to-do once FP&A has started", back.status >= 400, String(back.status));
    const del = await call(token, "DELETE", `/tasks/${made!.id}`);
    check("deleting the mirrored task is refused", del.status >= 400 && /FP&A/.test(JSON.stringify(del.body)), `${del.status}`);
    check("the planning task is untouched by the refused actions", (await prisma.planningTask.findUnique({ where: { id: pt.id } }))!.status === "IN_PROGRESS");
    // an activity whose achievement would complete the mirrored task is recorded, but the stage stays with FP&A
    const act = await call(token, "POST", `/tasks/${made!.id}/activity`, { type: "progress", activity: "worked the numbers", percentValueAchieved: 100 });
    const afterAct = await prisma.task.findUnique({ where: { id: made!.id }, select: { stage: true } });
    check("a task activity cannot complete the mirrored task (FP&A decides)", act.status < 500 && afterAct!.stage !== "completed", `${act.status} ${afterAct!.stage}`);
    // FP&A -> Performance: submission completes the Performance task
    await FpaPlanningPmTaskBridge.syncStatus(pt.id, "SUBMITTED");
    const fin = await call(token, "GET", "/tasks/my");
    const t2 = (fin.body.tasks || []).find((x: any) => x.id === made!.id);
    check("FP&A -> Performance: submitting the slice completes the Performance task", !!t2 && t2.stage === "completed", t2 && t2.stage);
    await FpaPlanningPmTaskBridge.syncStatus(pt.id, "CANCELLED");
    check("FP&A -> Performance: cancelling the planning task removes the mirror (not shown as completed)", !!(await prisma.task.findUnique({ where: { id: made!.id }, select: { isTrashed: true } }))?.isTrashed);
    await FpaPlanningPmTaskBridge.trashLinked(pt.id);
    check("FP&A -> Performance: removing the planning task trashes the mirror", !!(await prisma.task.findUnique({ where: { id: made!.id }, select: { isTrashed: true } }))?.isTrashed);
  } finally {
    const linked = await FpaPlanningPmTaskBridge.findLinkedPmTaskId(pt.id).catch(() => null);
    const ids = (await prisma.task.findMany({ where: { category: FPA_MODEL_PLANNING_PM_CATEGORY, taskMetadata: { path: "$.planningTaskId", equals: pt.id } }, select: { id: true } })).map((x) => x.id);
    if (linked) ids.push(linked);
    if (ids.length) {
      await prisma.activityLog.deleteMany({ where: { taskId: { in: ids } } }).catch(() => undefined);
      await prisma.task.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.planningTask.delete({ where: { id: pt.id } }).catch(() => undefined);
    await prisma.planningWorkflow.delete({ where: { id: wf.id } }).catch(() => undefined);
    await prisma.planningModel.delete({ where: { id: model.id } }).catch(() => undefined);
  }
  console.log(failed ? `\n${failed} failed` : "\nall passed");
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); process.exit(failed ? 1 : 0); });
