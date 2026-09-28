//@ts-nocheck
import { prisma } from "../utils/database";
import { logger } from "../utils/logger";
import { isModulePrivilegedUser } from "../config/cfoModulePermissions";
import { isExternalPortalUser } from "../utils/portalAuth";
import AuditService from "./AuditService";
import { UserMasterPolicyService } from "./UserMasterPolicyService";
import { ProcurementDecisionLogService } from "./ProcurementDecisionLogService";
import { isUserAvailable, fullNameOf } from "../config/userMasterAccess";

const STAGE = "PURCHASE_REQUISITION";
const STEP_NOTIFICATION = "PROCUREMENT_REQUISITION_APPROVAL";
const DECISION_NOTIFICATION = "PROCUREMENT_REQUISITION_DECISION";
const APPROVALS_PATH = "/procurement/approvals";
const REQUISITIONS_PATH = "/procurement/requisitions";
/** Departments a requisition is raised for; the approval configuration validates against the same list. */
export const REQUISITION_DEPARTMENTS = ["Finance", "Operations", "Procurement", "Human Resources", "Marketing", "Legal", "IT"];
const MAX_STEPS = 6;
const ARCHIVE_CONFIG_NAME = "Retired requisition approval steps";

const PERSON = { id: true, firstName: true, lastName: true, email: true };
const APPROVALS_INCLUDE = {
  approvals: {
    include: {
      stage: { include: { user: { select: PERSON }, department: { select: { name: true } } } },
      approver: { select: PERSON },
      delegatedTo: { select: PERSON },
    },
  },
};
const REQUISITION_INCLUDE = {
  requestedBy: { select: PERSON },
  approvedBy: { select: PERSON },
  currency: { select: { id: true, code: true, name: true, symbol: true } },
  items: true,
};
/** Decisions that are not routed step by step: a role holding the permission makes them. */
const PERMISSION_DECISIONS: Array<[string, string]> = [
  ["Approve a procurement plan", "procurement.plans.approve"],
  ["Award a tender", "procurement.rfq.award"],
  ["Send a purchase order to the vendor", "procurement.orders.send"],
  ["Accept a goods receipt on inspection", "procurement.receiving.approve"],
  ["Approve a supplier invoice for payment", "procurement.invoices.approve"],
  ["Record a supplier payment", "procurement.invoices.pay"],
  ["Approve a vendor registration", "procurement.vendors.approve"],
];

const personName = (u: any) => [u?.firstName, u?.lastName].filter(Boolean).join(" ").trim() || u?.email || "Someone";
const money = (v: any) => Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const clip = (s: any, n: number) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));
const badRequest = (message: string, status = 400) => Object.assign(new Error(message), { status });

/**
 * The approval route of a purchase requisition (SRD §3 "Approval Workflow", §4 System Administrator, §6.2).
 *
 * A requisition is decided in steps, in order, as the approval matrix sets them: the head of the requester's
 * department, a role, or a named person, each step optionally applying only above an amount, so a larger requisition
 * needs a further level. Any one approver on a step decides that step. The approvers of the step a requisition is at
 * are told in the app and by email; the requester is told when a step is approved and when it is decided.
 *
 * Until this service, the matrix existed in the database but the approve button ignored it: any department head
 * approved outright, and the approver rows stayed pending for ever.
 */
export class ProcurementRequisitionApprovalService {
  /** Role codes against the names people know them by ("FIN_MGR" is the Finance Manager). */
  static async roleNames(): Promise<Map<string, string>> {
    const users = await prisma.user.findMany({
      where: { roleCode: { not: null } },
      select: { roleCode: true, role: { select: { name: true } } },
      distinct: ["roleCode"],
    });
    const names = new Map<string, string>();
    for (const u of users) if (u.roleCode) names.set(u.roleCode, u.role?.name || u.roleCode);
    if (!names.has("CFO")) names.set("CFO", "Chief Financial Officer");
    return names;
  }

  /** Staff who can hold an approval step; investee, applicant and LP portal accounts cannot. */
  static async internalStaff() {
    const users = await prisma.user.findMany({
      select: { ...PERSON, roleCode: true, userDepartment: true, departmentRole: true, role: { select: { name: true } } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    });
    return users.filter((u) => !isExternalPortalUser(u));
  }

  /** Who decides a step and when it applies, in the words the approval screens use. */
  static describe(stage: any, roleNames: Map<string, string>, requisitionDepartment?: string | null) {
    const aboveAmount = stage.amountThreshold != null ? Number(stage.amountThreshold) : null;
    if (stage.stepType === "USER") {
      return { kind: "USER", who: stage.user ? personName(stage.user) : stage.stepName, aboveAmount };
    }
    if (stage.stepType === "DEPARTMENT") {
      // On a requisition's own route, "the requester's department" is that requisition's department by name.
      const department = stage.department?.name || stage.requiredUserDepartment || requisitionDepartment || null;
      const title = stage.requiredDepartmentRole === "DEPUTY" ? "Deputy head" : "Head";
      return { kind: "DEPARTMENT_HEAD", who: `${title} of ${department ?? "the requester's department"}`, aboveAmount };
    }
    const code = stage.roleCode || (stage.stepType === "AMOUNT_THRESHOLD" ? "CFO" : null);
    return { kind: "ROLE", who: code ? roleNames.get(code) || code : stage.stepName, aboveAmount };
  }

  /** The step a request waits on: the lowest step that still has an undecided approver. */
  static currentStepOf(request: any): number | null {
    const waiting = (request?.approvals || []).filter((a) => a.status === "PENDING").map((a) => a.stage.stepNumber);
    return waiting.length ? Math.min(...waiting) : null;
  }

  /** A request's steps as the screens show them: who, when it applies, who decided and when, and where it waits. */
  static routeOf(request: any, roleNames: Map<string, string>) {
    const byStep = new Map<number, { stage: any; rows: any[] }>();
    for (const a of request.approvals || []) {
      const n = a.stage.stepNumber;
      if (!byStep.has(n)) byStep.set(n, { stage: a.stage, rows: [] });
      byStep.get(n).rows.push(a);
    }
    const current = request.status === "PENDING" ? this.currentStepOf(request) : null;
    const steps = [...byStep.entries()]
      .sort((x, y) => x[0] - y[0])
      .map(([stepNumber, s], i) => {
        const d = this.describe(s.stage, roleNames, request.entityData?.department ?? null);
        const decided = s.rows.find((r) => r.status === "APPROVED" || r.status === "REJECTED");
        const status = decided
          ? decided.status
          : request.status === "PENDING"
            ? stepNumber === current
              ? "WAITING"
              : "UPCOMING"
            : "NOT_REACHED";
        return {
          position: i + 1,
          stepNumber,
          name: s.stage.stepName,
          kind: d.kind,
          who: d.who,
          aboveAmount: d.aboveAmount,
          approvers: s.rows.map((r) => ({
            id: r.approverId,
            name: personName(r.approver),
            status: r.status,
            note: r.comments ?? null,
          })),
          status,
          decidedBy: decided ? personName(decided.delegatedTo || decided.approver) : null,
          decidedById: decided ? decided.delegatedToId || decided.approverId : null,
          onBehalfOf: decided?.delegatedToId ? personName(decided.approver) : null,
          decidedAt: decided ? decided.approvedAt || decided.rejectedAt : null,
          comments: decided?.comments ?? null,
        };
      });
    const waiting = steps.find((s) => s.status === "WAITING") || null;
    return {
      requestId: request.id,
      status: request.status,
      submittedAt: request.requestDate,
      totalSteps: steps.length,
      currentPosition: waiting ? waiting.position : null,
      waitingOn: waiting ? { who: waiting.who, approvers: waiting.approvers } : null,
      steps,
    };
  }

  /** Adds `approvalRoute` to each requisition (null when it has none), from its latest open or decided request. */
  static async attachRoutes<T>(requisitions: T): Promise<T> {
    const list = (Array.isArray(requisitions) ? requisitions : [requisitions]).filter(Boolean) as any[];
    const ids = list.filter((r) => r.id && String(r.status || "").toUpperCase() !== "DRAFT").map((r) => r.id);
    for (const r of list) r.approvalRoute = null;
    // And the project each is charged to (SRD §7 "Project/Cost Center"), by name; drafts included.
    const projectIds = [...new Set(list.map((r) => r.projectId).filter(Boolean))];
    const projects = projectIds.length
      ? await prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true, clientName: true } })
      : [];
    for (const r of list) r.project = projects.find((p) => p.id === r.projectId) ?? null;
    if (!ids.length) return requisitions;
    const requests = await prisma.approvalRequest.findMany({
      where: { entityId: { in: ids }, stageType: STAGE, status: { in: ["PENDING", "APPROVED", "REJECTED", "RETURNED"] } },
      orderBy: { requestDate: "desc" },
      include: APPROVALS_INCLUDE,
    });
    const latest = new Map<string, any>();
    for (const q of requests) if (!latest.has(q.entityId)) latest.set(q.entityId, q);
    const roleNames = await this.roleNames();
    for (const r of list) {
      const q = latest.get(r.id);
      r.approvalRoute = q && q.approvals.length ? this.routeOf(q, roleNames) : null;
    }
    return requisitions;
  }

  static async openRequest(requisitionId: string) {
    return prisma.approvalRequest.findFirst({
      where: { entityId: requisitionId, stageType: STAGE, status: "PENDING" },
      orderBy: { requestDate: "desc" },
      include: APPROVALS_INCLUDE,
    });
  }

  /**
   * One approver's decision on a requisition travelling its approval route. Returns null when the requisition has no
   * open route (submitted before routes were enforced); the caller then applies the department-head rule.
   *
   * The decider must be an approver on the step the requisition is at. An administrator or the CFO may decide a step
   * assigned to someone else, and is recorded as the person who acted.
   */
  static async decide(params: { requisitionId: string; actorId: string; decision: "APPROVE" | "REJECT" | "RETURN" | "COMMENT"; reason?: string }) {
    const request = await this.openRequest(params.requisitionId);
    const step = request ? this.currentStepOf(request) : null;
    if (!request || step == null) return null;

    const actor = await prisma.user.findUnique({ where: { id: params.actorId }, include: { role: true } });
    if (!actor) throw badRequest("Approver not found");
    const atStep = request.approvals.filter((a) => a.status === "PENDING" && a.stage.stepNumber === step);
    const own = atStep.find((a) => a.approverId === params.actorId);
    if (!own && !isModulePrivilegedUser(actor)) {
      const route = this.routeOf(request, await this.roleNames());
      const waiting = route.steps.find((s) => s.stepNumber === step);
      const names = waiting.approvers.map((p) => p.name).join(", ");
      const later = request.approvals.some(
        (a) => a.approverId === params.actorId && a.status === "PENDING" && a.stage.stepNumber > step
      );
      throw badRequest(
        later
          ? `This requisition is still at step ${waiting.position} of ${route.totalSteps} (${waiting.who}: ${names}). It comes to you once that step is approved.`
          : `This requisition waits for step ${waiting.position} of ${route.totalSteps}, ${waiting.who} (${names}). You are not an approver on that step.`,
        403
      );
    }

    const row = own || atStep[0];
    const { ApprovalService } = await import("./ApprovalService");
    const stepInfo = { stepNumber: row.stage.stepNumber, stepName: row.stage.stepName };
    const onBehalfOfId = own ? null : row.approverId;

    if (params.decision === "COMMENT" || params.decision === "RETURN") {
      await UserMasterPolicyService.assertCanAct(prisma, params.actorId);
      const text = String(params.reason || "").trim();
      if (!text) throw badRequest(params.decision === "RETURN" ? "A comment is required to return a requisition for amendment." : "Write a comment first.");
      const req = await prisma.purchaseRequisition.findUnique({ where: { id: params.requisitionId }, select: { requestedById: true } });
      if (req?.requestedById === params.actorId) throw badRequest("You raised this requisition, so you cannot act on its approval.", 403);
      if (params.decision === "COMMENT") {
        await ProcurementDecisionLogService.record({
          entityType: "PurchaseRequisition", entityId: params.requisitionId, requestId: request.id, approvalId: row.id, ...stepInfo,
          actorId: params.actorId, onBehalfOfId, action: "COMMENTED", comments: text,
          previousStatus: "PENDING_APPROVAL", resultingStatus: "PENDING_APPROVAL",
        });
        await AuditService.log({ userId: params.actorId, action: "COMMENT", entityType: "PurchaseRequisition", entityId: params.requisitionId, newValues: { step: stepInfo.stepName, comment: text } });
        const same = await prisma.purchaseRequisition.findUnique({ where: { id: params.requisitionId }, include: REQUISITION_INCLUDE });
        same.approvalRoute = this.routeOf(request, await this.roleNames());
        return same;
      }
      return this.returnForAmendment({ request, row, actor, text, stepInfo, onBehalfOfId });
    }

    if (params.decision === "APPROVE") {
      await ApprovalService.approveApproval({
        approvalId: row.id,
        approverId: params.actorId,
        comments: own ? undefined : `Approved by ${personName(actor)} as an administrator`,
      });
    } else {
      if (!params.reason) throw badRequest("A reason is required to reject a requisition.");
      await ApprovalService.rejectApproval({ approvalId: row.id, approverId: params.actorId, comments: params.reason });
    }

    const after = await prisma.approvalRequest.findUnique({ where: { id: request.id }, include: APPROVALS_INCLUDE });
    if (params.decision === "APPROVE" && after.status === "APPROVED") {
      await prisma.purchaseRequisition.update({
        where: { id: params.requisitionId },
        data: { approvedById: params.actorId, approvedAt: new Date() },
      });
    }
    const route = this.routeOf(after, await this.roleNames());
    const decidedStep = route.steps.find((s) => s.stepNumber === step);
    await ProcurementDecisionLogService.record({
      entityType: "PurchaseRequisition", entityId: params.requisitionId, requestId: request.id, approvalId: row.id, ...stepInfo,
      actorId: params.actorId, onBehalfOfId,
      action: params.decision === "REJECT" ? "REJECTED" : "APPROVED",
      comments: params.reason || (own ? null : `Approved by ${personName(actor)} as an administrator`),
      previousStatus: "PENDING_APPROVAL",
      resultingStatus: after.status === "APPROVED" ? "APPROVED" : after.status === "REJECTED" ? "REJECTED" : "PENDING_APPROVAL",
      detail: { step: `${decidedStep?.position ?? "?"} of ${route.totalSteps}`, waitingOn: route.waitingOn?.who ?? null },
    });
    await AuditService.log({
      userId: params.actorId,
      action: params.decision === "REJECT" ? "REJECT" : after.status === "APPROVED" ? "APPROVE" : "APPROVE_STEP",
      entityType: "PurchaseRequisition",
      entityId: params.requisitionId,
      newValues: {
        status: after.status === "PENDING" ? "PENDING_APPROVAL" : after.status,
        step: `${decidedStep?.position ?? "?"} of ${route.totalSteps}`,
        stepName: decidedStep?.who ?? null,
        waitingOn: route.waitingOn?.who ?? null,
        ...(own ? {} : { onBehalfOf: decidedStep?.onBehalfOf ?? null }),
        ...(params.reason ? { rejectionReason: params.reason } : {}),
      },
    });

    const requisition = await prisma.purchaseRequisition.findUnique({
      where: { id: params.requisitionId },
      include: REQUISITION_INCLUDE,
    });
    requisition.approvalRoute = route;
    return requisition;
  }

  /**
   * Return for amendment: unlike a rejection this is not a verdict. The route is closed, the requisition goes back to its
   * requester as RETURNED, they amend it and resubmit, and it is routed afresh (criteria may have changed with the
   * amendment). A content fingerprint makes an unchanged resubmission impossible.
   */
  private static async returnForAmendment(a: { request: any; row: any; actor: any; text: string; stepInfo: any; onBehalfOfId: string | null }) {
    const { request, row, actor, text, stepInfo, onBehalfOfId } = a;
    const { computePurchaseRequisitionContentFingerprint } = await import("../utils/purchaseRequisitionContentFingerprint");
    const current = await prisma.purchaseRequisition.findUnique({ where: { id: request.entityId }, include: { items: true } });
    if (!current) throw badRequest("Requisition not found", 404);
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.approval.update({ where: { id: row.id }, data: { status: "RETURNED", comments: text, rejectedAt: now } });
      await tx.approval.updateMany({
        where: { requestId: request.id, status: "PENDING" },
        data: { status: "CANCELLED", comments: "Closed: the requisition was returned for amendment" },
      });
      await tx.approvalRequest.update({ where: { id: request.id }, data: { status: "RETURNED", rejectionReason: text, rejectedAt: now } });
      await tx.purchaseRequisition.update({
        where: { id: current.id },
        data: { status: "RETURNED", rejectionReason: text, rejectionContentFingerprint: computePurchaseRequisitionContentFingerprint(current as any) },
      });
    });
    await ProcurementDecisionLogService.record({
      entityType: "PurchaseRequisition", entityId: current.id, requestId: request.id, approvalId: row.id, ...stepInfo,
      actorId: actor.id, onBehalfOfId, action: "RETURNED", comments: text,
      previousStatus: "PENDING_APPROVAL", resultingStatus: "RETURNED",
    });
    await AuditService.log({
      userId: actor.id, action: "RETURN", entityType: "PurchaseRequisition", entityId: current.id,
      newValues: { status: "RETURNED", step: stepInfo.stepName, reason: text, ...(onBehalfOfId ? { onBehalfOf: onBehalfOfId } : {}) },
    });
    try {
      const { notify } = await import("./notifications/ProcurementNotifier");
      const r = await prisma.purchaseRequisition.findUnique({ where: { id: current.id }, select: { id: true, requisitionNumber: true, title: true, requestedById: true } });
      if (r) await notify("REQUISITION_RETURNED", { userIds: [r.requestedById], actorId: actor.id, entityType: "PurchaseRequisition", entityId: r.id, vars: { ref: r.requisitionNumber, title: r.title, actor: personName(actor), reason: text } });
    } catch (e: any) {
      logger.error("Return notification failed", { error: String(e?.message || e) });
    }
    const out = await prisma.purchaseRequisition.findUnique({ where: { id: current.id }, include: REQUISITION_INCLUDE });
    const after = await prisma.approvalRequest.findUnique({ where: { id: request.id }, include: APPROVALS_INCLUDE });
    out.approvalRoute = this.routeOf(after, await this.roleNames());
    return out;
  }

  /** Who the current approver could hand this step to: the same rules the delegation gate applies, each with a reason if not. */
  static async delegateCandidates(requisitionId: string, actorId: string) {
    const request = await this.openRequest(requisitionId);
    const step = request ? this.currentStepOf(request) : null;
    if (!request || step == null) throw badRequest("This requisition is not waiting on an approver.", 409);
    const row = request.approvals.find((x) => x.status === "PENDING" && x.stage.stepNumber === step && x.approverId === actorId);
    if (!row) throw badRequest("You are not an approver on the step this requisition is at.", 403);
    const canDelegate = row.stage.canDelegate === true;
    const amount = await UserMasterPolicyService.entityAmount(prisma, STAGE, requisitionId, request.entityData);
    const requisition = await prisma.purchaseRequisition.findUnique({ where: { id: requisitionId }, select: { requestedById: true } });
    const peers = request.approvals.filter((x) => x.status === "PENDING" && x.stage.stepNumber === step).map((x) => x.approverId);
    const staff = await prisma.user.findMany({
      where: { id: { not: actorId } },
      select: { id: true, firstName: true, lastName: true, email: true, roleCode: true, userDepartment: true, status: true, effectiveDate: true, endDate: true, approvalLimitAmount: true, approvalLevel: true, accessProfile: true, procurementFunction: true, role: { select: { name: true } } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    });
    const people = staff
      .filter((u) => !isExternalPortalUser(u))
      .map((u) => {
        const why = UserMasterPolicyService.delegateIneligibility(u, {
          requesterId: request.requestedById, raiserId: requisition?.requestedById, amount,
          minApprovalLevel: row.stage.minApprovalLevel ?? null, alreadyAtStep: peers,
        });
        return { id: u.id, name: personName(u), role: u.role?.name ?? null, department: u.userDepartment ?? null, eligible: !why, reason: why?.message ?? null };
      });
    return { canDelegate, step: row.stage.stepName, amount, people };
  }

  /** Hands the caller's step to another user. Allowed only where the matrix step allows delegation and the delegate is eligible. */
  static async delegate(params: { requisitionId: string; actorId: string; delegatedToId: string; reason?: string }) {
    const request = await this.openRequest(params.requisitionId);
    const step = request ? this.currentStepOf(request) : null;
    if (!request || step == null) throw badRequest("This requisition is not waiting on an approver.", 409);
    const row = request.approvals.find((x) => x.status === "PENDING" && x.stage.stepNumber === step && x.approverId === params.actorId);
    if (!row) throw badRequest("Only an approver on the step this requisition is at can delegate it.", 403);
    if (row.stage.canDelegate !== true) throw badRequest(`Delegation is not allowed on the step "${row.stage.stepName}". Ask an administrator to enable it in the approval matrix.`, 403);
    if (!String(params.reason || "").trim()) throw badRequest("Say why you are delegating.");
    const { ApprovalService } = await import("./ApprovalService");
    await ApprovalService.delegateApproval({ approvalId: row.id, fromUserId: params.actorId, delegatedToId: params.delegatedToId, reason: String(params.reason).trim() });
    await this.notifyCurrentStepQuietly(request.id);
    const out = await prisma.purchaseRequisition.findUnique({ where: { id: params.requisitionId }, include: REQUISITION_INCLUDE });
    const after = await this.openRequest(params.requisitionId);
    out.approvalRoute = after ? this.routeOf(after, await this.roleNames()) : null;
    return out;
  }

  /** The requisition's decision history: every submit, decision, comment, delegation and return, in order. */
  static async decisions(requisitionId: string) {
    return ProcurementDecisionLogService.list("PurchaseRequisition", requisitionId);
  }

  /** Requisitions waiting on this person: they are an approver on the step each one is at. */
  static async awaitingIds(userId: string): Promise<string[]> {
    const rows = await prisma.approval.findMany({
      where: { approverId: userId, status: "PENDING", request: { status: "PENDING", stageType: STAGE } },
      select: {
        stage: { select: { stepNumber: true } },
        request: {
          select: {
            entityId: true,
            approvals: { where: { status: "PENDING" }, select: { stage: { select: { stepNumber: true } } } },
          },
        },
      },
    });
    return rows
      .filter((r) => r.stage.stepNumber === Math.min(...r.request.approvals.map((a) => a.stage.stepNumber)))
      .map((r) => r.request.entityId);
  }

  /** A department's requisitions pending approval with no open route, decided by its head or deputy. */
  static async unroutedPendingIds(department: string): Promise<string[]> {
    const pending = await prisma.purchaseRequisition.findMany({
      where: { status: "PENDING_APPROVAL", department },
      select: { id: true },
    });
    if (!pending.length) return [];
    const routed = await prisma.approvalRequest.findMany({
      where: {
        entityId: { in: pending.map((p) => p.id) },
        stageType: STAGE,
        status: "PENDING",
        approvals: { some: { status: "PENDING" } },
      },
      select: { entityId: true },
    });
    const withRoute = new Set(routed.map((r) => r.entityId));
    return pending.map((p) => p.id).filter((id) => !withRoute.has(id));
  }

  static async notifyCurrentStepQuietly(requestId: string) {
    try {
      await this.notifyCurrentStep(requestId);
    } catch (e: any) {
      logger.error("Approval step notification failed", { requestId, error: String(e?.message || e) });
    }
  }

  /** Tells the approvers of the step a request is at, in the app (requisitions) and by email, once per step. */
  static async notifyCurrentStep(requestId: string) {
    const request = await prisma.approvalRequest.findUnique({ where: { id: requestId }, include: APPROVALS_INCLUDE });
    if (!request || request.status !== "PENDING") return;
    const step = this.currentStepOf(request);
    if (step == null) return;
    const rows = request.approvals.filter((a) => a.status === "PENDING" && a.stage.stepNumber === step);
    const route = this.routeOf(request, await this.roleNames());
    const waiting = route.steps.find((s) => s.stepNumber === step);

    if (request.stageType === STAGE) {
      const r = await prisma.purchaseRequisition.findUnique({
        where: { id: request.entityId },
        select: {
          id: true,
          requisitionNumber: true,
          title: true,
          department: true,
          totalAmount: true,
          currency: { select: { code: true } },
          requestedBy: { select: PERSON },
        },
      });
      if (r) {
        const earlier = await prisma.notification.findMany({
          where: { userId: { in: rows.map((x) => x.approverId) }, type: "PROCUREMENT_APPROVAL_REQUIRED", relatedEntityId: r.id },
          select: { userId: true, data: true },
        });
        const fresh = rows.filter((row) => !earlier.some((n: any) => n.userId === row.approverId && n.data?.requestId === request.id && n.data?.stepNumber === step));
        if (waiting.position === 1) {
          // the route has just started: the requester gets a receipt for the submission
          const { notify: receipt } = await import("./notifications/ProcurementNotifier");
          await receipt("REQUISITION_SUBMITTED", {
            userIds: [r.requestedBy.id], entityType: "PurchaseRequisition", entityId: r.id, data: { path: REQUISITIONS_PATH, requestId: request.id },
            vars: { ref: r.requisitionNumber, title: r.title, department: r.department, amount: `${r.currency?.code ?? ""} ${money(r.totalAmount)}`.trim(), steps: route.totalSteps },
          });
        }
        if (fresh.length) {
          const { notify } = await import("./notifications/ProcurementNotifier");
          const amount = `${r.currency?.code ?? ""} ${money(r.totalAmount)}`.trim();
          await notify("APPROVAL_REQUIRED", {
            data: { path: APPROVALS_PATH, requisitionId: r.id, requisitionNumber: r.requisitionNumber, requestId: request.id, stepNumber: step, position: waiting.position, totalSteps: route.totalSteps },
            userIds: fresh.map((x) => x.approverId), entityType: "PurchaseRequisition", entityId: r.id,
            vars: { ref: r.requisitionNumber, title: r.title, amount, requester: personName(r.requestedBy), department: r.department, step: `${waiting.position} of ${route.totalSteps}` },
          });
        }
      }
    }
  }

  static async afterDecisionQuietly(
    requestId: string,
    opts: { actorId?: string; outcome: "STEP_APPROVED" | "APPROVED" | "REJECTED"; reason?: string }
  ) {
    try {
      await this.afterDecision(requestId, opts);
    } catch (e: any) {
      logger.error("Requisition decision notification failed", { requestId, error: String(e?.message || e) });
    }
  }

  /**
   * After a decision: the next step's approvers are told it is theirs, and the requester hears what happened. The
   * requester is emailed when the requisition is approved or rejected, and told in the app at every step.
   */
  static async afterDecision(
    requestId: string,
    { actorId, outcome, reason }: { actorId?: string; outcome: "STEP_APPROVED" | "APPROVED" | "REJECTED"; reason?: string }
  ) {
    const request = await prisma.approvalRequest.findUnique({ where: { id: requestId }, include: APPROVALS_INCLUDE });
    if (!request || request.stageType !== STAGE) return;
    if (outcome === "STEP_APPROVED" && request.status === "PENDING") await this.notifyCurrentStep(requestId);

    const r = await prisma.purchaseRequisition.findUnique({
      where: { id: request.entityId },
      select: { id: true, requisitionNumber: true, title: true, department: true, requestedBy: { select: PERSON } },
    });
    if (!r?.requestedBy) return;
    const actor = actorId ? await prisma.user.findUnique({ where: { id: actorId }, select: PERSON }) : null;
    const by = personName(actor);
    const route = this.routeOf(request, await this.roleNames());
    const decidedSteps = route.steps.filter((s) => s.status === "APPROVED").length;

    if (outcome === "REJECTED") {
      const { notify } = await import("./notifications/ProcurementNotifier");
      await notify("REQUISITION_REJECTED", { userIds: [r.requestedBy.id], actorId: actorId ?? null, entityType: "PurchaseRequisition", entityId: r.id, vars: { ref: r.requisitionNumber, title: r.title, actor: by, reason: reason ?? "no reason given" } });
      return;
    }

    let title: string;
    let message: string;
    if (outcome === "APPROVED") {
      title = `${r.requisitionNumber} approved`;
      message = `Approved by ${by}${route.totalSteps > 1 ? `, the last of ${route.totalSteps} approval steps` : ""}. Procurement can now source it.`;
    } else if (outcome === "REJECTED") {
      title = `${r.requisitionNumber} rejected`;
      message = `Rejected by ${by}: ${reason ?? "no reason given"}. Correct it and submit it again.`;
    } else {
      title = `${r.requisitionNumber} approved at step ${decidedSteps} of ${route.totalSteps}`;
      message = `Approved by ${by}. It now waits for ${route.waitingOn?.who ?? "the next step"}.`;
    }
    if (r.requestedBy.id !== actorId) {
      await prisma.notification.create({
        data: {
          userId: r.requestedBy.id,
          type: DECISION_NOTIFICATION,
          title: clip(title, 150),
          message: clip(message, 180),
          relatedEntity: "PurchaseRequisition",
          relatedEntityId: r.id,
          data: { path: REQUISITIONS_PATH, requisitionId: r.id, requisitionNumber: r.requisitionNumber, requestId, outcome },
        },
      });
    }
    if (outcome === "STEP_APPROVED" || !r.requestedBy.email) return;
    const { EmailNotificationService } = await import("./EmailNotificationService");
    const common = {
      submitterName: personName(r.requestedBy),
      submitterEmail: r.requestedBy.email,
      requisitionNumber: r.requisitionNumber,
      title: r.title,
      department: String(r.department ?? ""),
    };
    if (outcome === "APPROVED") {
      await EmailNotificationService.sendRequisitionApprovedToSubmitter({
        ...common,
        approvedByName: by,
        approvedByEmail: actor?.email ?? "",
      });
    } else {
      await EmailNotificationService.sendRequisitionRejectedToSubmitter({
        ...common,
        rejectedByName: by,
        rejectedByEmail: actor?.email ?? "",
        rejectionReason: reason ?? "",
      });
    }
  }

  // ------------------------------------------------------------------ the approval matrix

  /** The route in force: the active configuration without a department that holds requisition steps. */
  static async generalConfig(db: any = prisma, stage: string = STAGE) {
    return db.procurementApprovalConfig.findFirst({
      where: { isActive: true, department: null, stages: { some: { stageType: stage } } },
      orderBy: { updatedAt: "desc" },
    });
  }

  /** The nine routing criteria a step can carry (amount is `aboveAmount`/amountMin/amountMax); empty lists mean "any". */
  static cleanRules(raw: any) {
    const r = raw && typeof raw === "object" ? raw : {};
    const list = (k: string) => (Array.isArray(r[k]) ? [...new Set(r[k].map((x: any) => String(x).trim()).filter(Boolean))].slice(0, 50) : []);
    const num = (k: string) => (r[k] === "" || r[k] == null || !Number.isFinite(Number(r[k])) ? null : Number(r[k]));
    return {
      departments: list("departments"), businessUnits: list("businessUnits"), costCentres: list("costCentres"),
      categories: list("categories"), branches: list("branches"), methods: list("methods"),
      riskLevels: list("riskLevels"), exceptionTypes: list("exceptionTypes"),
      amountMin: num("amountMin"), amountMax: num("amountMax"),
    };
  }

  static rulesToJson(rules: ReturnType<typeof ProcurementRequisitionApprovalService.cleanRules>) {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(rules)) {
      if (Array.isArray(v) ? v.length : v != null) out[k] = v;
    }
    return Object.keys(out).length ? out : null;
  }

  static matrixStep(stage: any, roleNames: Map<string, string>, staff: any[], departments: string[]) {
    const d = this.describe(stage, roleNames);
    const roleCode = stage.roleCode || (stage.stepType === "AMOUNT_THRESHOLD" ? "CFO" : null);
    const department = stage.department?.name || stage.requiredUserDepartment || null;
    const headRole = stage.requiredDepartmentRole || "HEAD";
    const headsOf = (dept: string) => {
      const found = staff.filter((u) => u.userDepartment === dept && u.departmentRole === headRole);
      return found.length || headRole !== "HEAD" ? found : staff.filter((u) => u.userDepartment === dept && u.departmentRole === "DEPUTY");
    };
    let people: string[];
    if (d.kind === "USER") people = stage.user ? [personName(stage.user)] : [];
    else if (d.kind === "ROLE") people = staff.filter((u) => u.roleCode === roleCode).map(personName);
    else if (department) people = headsOf(department).map(personName);
    else
      people = departments.map((dept) => {
        const heads = headsOf(dept);
        return `${dept}: ${heads.length ? heads.map(personName).join(", ") : "nobody, so its requisitions cannot be submitted"}`;
      });
    return {
      stepNumber: stage.stepNumber,
      name: stage.stepName,
      canDelegate: stage.canDelegate === true,
      matchRules: this.cleanRules(stage.matchRules),
      kind: d.kind,
      who: d.who,
      aboveAmount: d.aboveAmount,
      department,
      deputy: stage.requiredDepartmentRole === "DEPUTY",
      roleCode: d.kind === "ROLE" ? roleCode : null,
      userId: stage.userId || null,
      minApprovalLevel: stage.minApprovalLevel ?? null,
      people,
    };
  }

  /** The requisition approval matrix, with who holds each step today, and the decisions made by permission. */
  static async matrix(user: any, stage: string = STAGE) {
    const canEdit = isModulePrivilegedUser(user);
    const [roleNames, staff, config, roles] = await Promise.all([
      this.roleNames(),
      this.internalStaff(),
      this.generalConfig(prisma, stage),
      prisma.role.findMany({ select: { name: true, permissions: true, _count: { select: { users: true } } } }),
    ]);
    const departments = [...new Set([...REQUISITION_DEPARTMENTS, ...staff.map((u) => u.userDepartment).filter(Boolean)])];
    const stageInclude = { user: { select: PERSON }, department: { select: { name: true } } };
    const stages = config
      ? await prisma.procurementApprovalStage.findMany({
          where: { configId: config.id, stageType: stage },
          orderBy: { stepNumber: "asc" },
          include: stageInclude,
        })
      : [];
    const departmentConfigs = await prisma.procurementApprovalConfig.findMany({
      where: { isActive: true, department: { not: null }, stages: { some: { stageType: stage } } },
      include: { stages: { where: { stageType: stage }, orderBy: { stepNumber: "asc" }, include: stageInclude } },
    });
    const roleCounts = new Map<string, number>();
    for (const u of staff) if (u.roleCode) roleCounts.set(u.roleCode, (roleCounts.get(u.roleCode) || 0) + 1);

    const { ProcurementInvoiceAutoApprovalService } = await import("./ProcurementInvoiceAutoApprovalService");
    return {
      canEdit,
      // Invoice approval is decided by permission, except an exact match when this is on (SRD §6.6).
      invoiceAutoApproval: await ProcurementInvoiceAutoApprovalService.settings(),
      configId: config?.id ?? null,
      updatedAt: config?.updatedAt ?? null,
      steps: stages.map((s) => this.matrixStep(s, roleNames, staff, departments)),
      // A department with its own active route follows that instead; shown so the general route is not mistaken for
      // the only one.
      departmentRoutes: departmentConfigs.map((c) => ({
        department: c.department,
        name: c.name,
        steps: c.stages.map((s) => this.matrixStep(s, roleNames, staff, departments)),
      })),
      departments,
      roles: [...roleCounts.entries()]
        .map(([code, people]) => ({ code, name: roleNames.get(code) || code, people }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      people: canEdit
        ? staff.map((u) => ({ id: u.id, name: personName(u), role: u.role?.name ?? null, department: u.userDepartment ?? null }))
        : [],
      permissionDecisions: PERMISSION_DECISIONS.map(([label, permission]) => ({
        label,
        permission,
        roles: roles
          .filter((r) => Array.isArray(r.permissions) && r.permissions.some((p) => p?.name === permission && p?.value === true))
          .map((r) => ({ name: r.name, people: r._count.users })),
      })),
    };
  }

  /**
   * Replaces the requisition route with the steps given. Only an administrator or the CFO may. Steps that past
   * approvals refer to are retired to an inactive configuration rather than deleted, so a requisition already
   * waiting keeps the route it was given, and history still reads; the new route applies to requisitions submitted
   * from now on.
   */
  static async saveMatrix(user: any, input: any, stage: string = STAGE) {
    if (!isModulePrivilegedUser(user)) {
      throw badRequest("Only an administrator or the Chief Financial Officer can change the approval matrix.", 403);
    }
    const raw = Array.isArray(input?.steps) ? input.steps : null;
    if (!raw || raw.length === 0) throw badRequest("The route needs at least one step.");
    if (raw.length > MAX_STEPS) throw badRequest(`The route can have at most ${MAX_STEPS} steps.`);

    const [staff, roleNames] = await Promise.all([this.internalStaff(), this.roleNames()]);
    const departments = new Set([...REQUISITION_DEPARTMENTS, ...staff.map((u) => u.userDepartment).filter(Boolean)]);
    const clean = raw.map((s: any, i: number) => {
      const n = i + 1;
      const kind = String(s?.kind || "").toUpperCase();
      const above = s?.aboveAmount === "" || s?.aboveAmount == null ? null : Number(s.aboveAmount);
      if (above != null && (!Number.isFinite(above) || above < 0)) {
        throw badRequest(`Step ${n}: the amount must be a number of zero or more.`);
      }
      const minLevelRaw = s?.minApprovalLevel === "" || s?.minApprovalLevel == null ? null : Number(s.minApprovalLevel);
      if (minLevelRaw != null && (!Number.isInteger(minLevelRaw) || minLevelRaw < 0 || minLevelRaw > 99)) {
        throw badRequest(`Step ${n}: the minimum approval level must be a whole number from 0 to 99.`);
      }
      if (n === 1 && above != null) {
        throw badRequest("Step 1 applies to every requisition, so it cannot carry an amount. Put amount conditions on later steps.");
      }
      const rules = this.cleanRules(s?.matchRules);
      if (rules.amountMin != null && rules.amountMax != null && rules.amountMin > rules.amountMax) {
        throw badRequest(`Step ${n}: the amount range is upside down (from is above to).`);
      }
      const extra = { canDelegate: s?.canDelegate === true, rules: this.rulesToJson(rules) };
      if (kind === "DEPARTMENT_HEAD") {
        const department = s?.department ? String(s.department) : null;
        if (department && !departments.has(department)) throw badRequest(`Step ${n}: ${department} is not a department.`);
        const role = s?.deputy ? "DEPUTY" : "HEAD";
        if (department) {
          const holders = staff.filter(
            (u) => u.userDepartment === department && (u.departmentRole === role || (role === "HEAD" && u.departmentRole === "DEPUTY"))
          );
          if (!holders.length) {
            throw badRequest(`Step ${n}: nobody is ${role === "DEPUTY" ? "deputy head" : "head or deputy head"} of ${department}.`);
          }
        }
        return { kind, department, role, above, minLevel: minLevelRaw, who: `${role === "DEPUTY" ? "Deputy head" : "Head"} of ${department ?? "the requester's department"}`, ...extra };
      }
      if (kind === "ROLE") {
        const code = String(s?.roleCode || "");
        if (!staff.some((u) => u.roleCode === code)) {
          throw badRequest(`Step ${n}: nobody holds the ${roleNames.get(code) || code || "chosen"} role, so the step could never be decided.`);
        }
        return { kind, roleCode: code, above, minLevel: minLevelRaw, who: roleNames.get(code) || code, ...extra };
      }
      if (kind === "USER") {
        const person = staff.find((u) => u.id === s?.userId);
        if (!person) throw badRequest(`Step ${n}: choose a member of staff.`);
        return { kind, userId: person.id, above, minLevel: minLevelRaw, who: personName(person), ...extra };
      }
      throw badRequest(`Step ${n}: choose who decides the step.`);
    });
    // At least one step must apply to every requisition, or a requisition matching none would have nobody to decide it.
    if (!clean.some((c) => c.above == null && !c.rules)) {
      throw badRequest("At least one step must apply to every requisition (no amount and no routing conditions), so no requisition is left without an approver.");
    }
    const seen = new Map<string, number>();
    clean.forEach((c, i) => {
      const key = [c.kind, c.department, c.role, c.roleCode, c.userId, c.above, c.minLevel, JSON.stringify(c.rules)].join("|");
      if (seen.has(key)) throw badRequest(`Step ${i + 1} repeats step ${seen.get(key)}.`);
      seen.set(key, i + 1);
    });
    const nameOf = (c) => clip(c.above != null ? `${c.who} (above ${money(c.above)})` : c.who, 180);

    const before = await this.matrix(user, stage);
    const configId = await prisma.$transaction(async (tx) => {
      let config = await this.generalConfig(tx, stage);
      if (!config) {
        config = await tx.procurementApprovalConfig.create({
          data: {
            name: stage === STAGE ? "Requisition approval route" : "Award recommendation approval route",
            description: stage === STAGE ? "Who approves a purchase requisition, in order" : "Who approves an award recommendation, in order",
            isActive: true,
            createdById: user.id,
            department: null,
          },
        });
      }
      // Every active general configuration's requisition steps go, so exactly one general route is in force.
      const current = await tx.procurementApprovalStage.findMany({
        where: { stageType: stage, config: { isActive: true, department: null } },
        include: { _count: { select: { approvals: true } } },
        orderBy: [{ configId: "asc" }, { stepNumber: "asc" }],
      });
      const referenced = current.filter((s) => s._count.approvals > 0);
      if (referenced.length) {
        let archive = await tx.procurementApprovalConfig.findFirst({ where: { name: ARCHIVE_CONFIG_NAME, isActive: false } });
        if (!archive) {
          archive = await tx.procurementApprovalConfig.create({
            data: {
              name: ARCHIVE_CONFIG_NAME,
              description: "Steps replaced in the approval matrix. Kept because past approvals refer to them; never used to route.",
              isActive: false,
              createdById: user.id,
              department: null,
            },
          });
        }
        const top = await tx.procurementApprovalStage.aggregate({
          where: { configId: archive.id, stageType: stage },
          _max: { stepNumber: true },
        });
        // Retired in a new block of a hundred, in order, so a past request still reads its steps in sequence.
        const base = Math.ceil(((top._max.stepNumber ?? 0) + 1) / 100) * 100;
        for (const [i, s] of referenced.entries()) {
          await tx.procurementApprovalStage.update({ where: { id: s.id }, data: { configId: archive.id, stepNumber: base + i + 1 } });
        }
      }
      const unreferenced = current.filter((s) => s._count.approvals === 0).map((s) => s.id);
      if (unreferenced.length) await tx.procurementApprovalStage.deleteMany({ where: { id: { in: unreferenced } } });

      for (const [i, c] of clean.entries()) {
        await tx.procurementApprovalStage.create({
          data: {
            configId: config.id,
            stageType: stage,
            stepNumber: i + 1,
            stepName: nameOf(c),
            stepType: c.kind === "DEPARTMENT_HEAD" ? "DEPARTMENT" : c.kind,
            userId: c.kind === "USER" ? c.userId : null,
            roleCode: c.kind === "ROLE" ? c.roleCode : null,
            requiredUserDepartment: c.kind === "DEPARTMENT_HEAD" ? c.department : null,
            requiredDepartmentRole: c.kind === "DEPARTMENT_HEAD" ? c.role : null,
            amountThreshold: c.above,
            minApprovalLevel: c.minLevel ?? null,
            isRequired: true,
            canDelegate: c.canDelegate === true,
            matchRules: c.rules ?? undefined,
            autoApprove: false,
            approvalOrder: "SEQUENTIAL",
          },
        });
      }
      await tx.procurementApprovalConfig.update({ where: { id: config.id }, data: { updatedAt: new Date() } });
      return config.id;
    });

    await AuditService.log({
      userId: user.id,
      action: "UPDATE",
      entityType: stage === STAGE ? "ProcurementApprovalMatrix" : "AwardApprovalMatrix",
      entityId: configId,
      oldValues: { steps: before.steps.map((s) => s.name) },
      newValues: { steps: clean.map((c) => ({ step: nameOf(c), canDelegate: c.canDelegate, rules: c.rules })) },
    });
    return this.matrix(user, stage);
  }
}
