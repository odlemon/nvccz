//@ts-nocheck
import { prisma } from "../utils/database";
import { logger } from "../utils/logger";
import { isModulePrivilegedUser } from "../config/cfoModulePermissions";
import { isExternalPortalUser } from "../utils/portalAuth";
import AuditService from "./AuditService";

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
          approvers: s.rows.map((r) => ({ id: r.approverId, name: personName(r.approver) })),
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
      where: { entityId: { in: ids }, stageType: STAGE, status: { in: ["PENDING", "APPROVED", "REJECTED"] } },
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
  static async decide(params: { requisitionId: string; actorId: string; decision: "APPROVE" | "REJECT"; reason?: string }) {
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

    // A DEPARTMENT-type step's Approval row must still target the requisition's own department. Security UAT
    // (2026-09-18, SRD §70 test 2 / §12 segregation of duties) found a department head holding a (misconfigured)
    // DEPARTMENT-step approval for a requisition raised by a different department, and was able to both view and
    // approve it — `own` above only checks "is there a pending Approval row for me", not "does that row's step
    // actually apply to this requisition's department". An administrator/CFO still decides on anyone's behalf, as
    // before; a ROLE/USER/AMOUNT_THRESHOLD step (CFO, PROC_MGR, a named person, ...) is legitimately cross-department
    // and is not affected.
    const decidingRow = own || atStep[0];
    if (decidingRow.stage.stepType === "DEPARTMENT" && !isModulePrivilegedUser(actor)) {
      const pr = await prisma.purchaseRequisition.findUnique({
        where: { id: params.requisitionId },
        select: { department: true },
      });
      const targetDepartment = pr?.department ?? request.entityData?.department ?? null;
      if (!targetDepartment || actor.userDepartment !== targetDepartment) {
        throw badRequest(
          `You are not assigned to the ${targetDepartment ?? "requesting"} department, so you are not an approver on this requisition's step.`,
          403
        );
      }
    }

    const row = own || atStep[0];
    const { ApprovalService } = await import("./ApprovalService");
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
        const title = clip(`${r.requisitionNumber} needs your approval`, 150);
        const message = clip(
          `${personName(r.requestedBy)} requests "${r.title}" (${r.department ?? "no department"}, ${r.currency?.code ?? "USD"} ${money(r.totalAmount)}). Step ${waiting.position} of ${route.totalSteps}: ${waiting.who}.`,
          180
        );
        for (const row of rows) {
          const earlier = await prisma.notification.findMany({
            where: { userId: row.approverId, type: STEP_NOTIFICATION, relatedEntityId: r.id },
            select: { data: true },
          });
          if (earlier.some((n) => n.data?.requestId === request.id && n.data?.stepNumber === step)) continue;
          await prisma.notification.create({
            data: {
              userId: row.approverId,
              type: STEP_NOTIFICATION,
              title,
              message,
              relatedEntity: "PurchaseRequisition",
              relatedEntityId: r.id,
              data: {
                path: APPROVALS_PATH,
                requisitionId: r.id,
                requisitionNumber: r.requisitionNumber,
                requestId: request.id,
                stepNumber: step,
                position: waiting.position,
                totalSteps: route.totalSteps,
              },
            },
          });
        }
      }
    }

    // Email through the engine's own step notification, numbered as the approver sees the route.
    const { ProcurementApprovalConfigService } = await import("./ProcurementApprovalConfigService");
    await ProcurementApprovalConfigService.sendApprovalStepNotifications(
      request.id,
      { ...rows[0].stage, stepNumber: waiting.position },
      request.stageType
    );
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
  static async generalConfig(db: any = prisma) {
    return db.procurementApprovalConfig.findFirst({
      where: { isActive: true, department: null, stages: { some: { stageType: STAGE } } },
      orderBy: { updatedAt: "desc" },
    });
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
      kind: d.kind,
      who: d.who,
      aboveAmount: d.aboveAmount,
      department,
      deputy: stage.requiredDepartmentRole === "DEPUTY",
      roleCode: d.kind === "ROLE" ? roleCode : null,
      userId: stage.userId || null,
      people,
    };
  }

  /** The requisition approval matrix, with who holds each step today, and the decisions made by permission. */
  static async matrix(user: any) {
    const canEdit = isModulePrivilegedUser(user);
    const [roleNames, staff, config, roles] = await Promise.all([
      this.roleNames(),
      this.internalStaff(),
      this.generalConfig(),
      prisma.role.findMany({ select: { name: true, permissions: true, _count: { select: { users: true } } } }),
    ]);
    const departments = [...new Set([...REQUISITION_DEPARTMENTS, ...staff.map((u) => u.userDepartment).filter(Boolean)])];
    const stageInclude = { user: { select: PERSON }, department: { select: { name: true } } };
    const stages = config
      ? await prisma.procurementApprovalStage.findMany({
          where: { configId: config.id, stageType: STAGE },
          orderBy: { stepNumber: "asc" },
          include: stageInclude,
        })
      : [];
    const departmentConfigs = await prisma.procurementApprovalConfig.findMany({
      where: { isActive: true, department: { not: null }, stages: { some: { stageType: STAGE } } },
      include: { stages: { where: { stageType: STAGE }, orderBy: { stepNumber: "asc" }, include: stageInclude } },
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
  static async saveMatrix(user: any, input: any) {
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
      if (n === 1 && above != null) {
        throw badRequest("Step 1 applies to every requisition, so it cannot carry an amount. Put amount conditions on later steps.");
      }
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
        return { kind, department, role, above, who: `${role === "DEPUTY" ? "Deputy head" : "Head"} of ${department ?? "the requester's department"}` };
      }
      if (kind === "ROLE") {
        const code = String(s?.roleCode || "");
        if (!staff.some((u) => u.roleCode === code)) {
          throw badRequest(`Step ${n}: nobody holds the ${roleNames.get(code) || code || "chosen"} role, so the step could never be decided.`);
        }
        return { kind, roleCode: code, above, who: roleNames.get(code) || code };
      }
      if (kind === "USER") {
        const person = staff.find((u) => u.id === s?.userId);
        if (!person) throw badRequest(`Step ${n}: choose a member of staff.`);
        return { kind, userId: person.id, above, who: personName(person) };
      }
      throw badRequest(`Step ${n}: choose who decides the step.`);
    });
    const seen = new Map<string, number>();
    clean.forEach((c, i) => {
      const key = [c.kind, c.department, c.role, c.roleCode, c.userId, c.above].join("|");
      if (seen.has(key)) throw badRequest(`Step ${i + 1} repeats step ${seen.get(key)}.`);
      seen.set(key, i + 1);
    });
    const nameOf = (c) => clip(c.above != null ? `${c.who} (above ${money(c.above)})` : c.who, 180);

    const before = await this.matrix(user);
    const configId = await prisma.$transaction(async (tx) => {
      let config = await this.generalConfig(tx);
      if (!config) {
        config = await tx.procurementApprovalConfig.create({
          data: {
            name: "Requisition approval route",
            description: "Who approves a purchase requisition, in order",
            isActive: true,
            createdById: user.id,
            department: null,
          },
        });
      }
      // Every active general configuration's requisition steps go, so exactly one general route is in force.
      const current = await tx.procurementApprovalStage.findMany({
        where: { stageType: STAGE, config: { isActive: true, department: null } },
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
          where: { configId: archive.id, stageType: STAGE },
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
            stageType: STAGE,
            stepNumber: i + 1,
            stepName: nameOf(c),
            stepType: c.kind === "DEPARTMENT_HEAD" ? "DEPARTMENT" : c.kind,
            userId: c.kind === "USER" ? c.userId : null,
            roleCode: c.kind === "ROLE" ? c.roleCode : null,
            requiredUserDepartment: c.kind === "DEPARTMENT_HEAD" ? c.department : null,
            requiredDepartmentRole: c.kind === "DEPARTMENT_HEAD" ? c.role : null,
            amountThreshold: c.above,
            isRequired: true,
            canDelegate: false,
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
      entityType: "ProcurementApprovalMatrix",
      entityId: configId,
      oldValues: { steps: before.steps.map((s) => s.name) },
      newValues: { steps: clean.map(nameOf) },
    });
    return this.matrix(user);
  }
}
