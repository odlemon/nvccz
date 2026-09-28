// @ts-nocheck
import { Request, Response } from "express";
import { prisma } from "../utils/database";
import AuditService from "../services/AuditService";
import { isModulePrivilegedUser } from "../config/cfoModulePermissions";
import { ProcurementRequisitionApprovalService as Approvals } from "../services/ProcurementRequisitionApprovalService";
import { ProcurementRequisitionRulesService as Rules, BUDGET_CHECK_MODES } from "../services/ProcurementRequisitionRulesService";
import { publicErrorMessage } from "../utils/publicErrorMessage";

/**
 * SRD §11/§12 requisition endpoints beyond create/submit/approve/reject: return for amendment, comments, authorised
 * delegation, the decision history, attachments, the budget master, and the requisition's plan/budget position.
 */
const fail = (res: Response, error: any, fallback: string) => {
  const status = error?.statusCode || error?.status || 400;
  return res.status(status).json({ success: false, message: publicErrorMessage(error, fallback), code: error?.code });
};
const ok = (res: Response, data: any, message?: string, status = 200) => res.status(status).json({ success: true, message, data });
const MAX_ATTACHMENTS = 20;
const ATTACHMENT_EXTENSIONS = ["pdf", "doc", "docx", "xls", "xlsx", "csv", "png", "jpg", "jpeg", "txt"];
const uid = (req: Request) => (req as any).user?.id as string;

/** May this person see the requisition? Its requester, anyone with the view-all grant, or anyone on its approval route. */
async function canSee(req: Request, requisitionId: string) {
  const user = (req as any).user;
  const r = await prisma.purchaseRequisition.findUnique({ where: { id: requisitionId }, select: { id: true, requestedById: true, status: true } });
  if (!r) return { r: null, allowed: false };
  if (r.requestedById === user.id || isModulePrivilegedUser(user)) return { r, allowed: true };
  const onRoute = await prisma.approval.count({ where: { approverId: user.id, request: { entityId: requisitionId, stageType: "PURCHASE_REQUISITION" } } });
  if (onRoute) return { r, allowed: true };
  const view = await prisma.user.findUnique({ where: { id: user.id }, select: { role: { select: { permissions: true } } } });
  const perms = Array.isArray(view?.role?.permissions) ? view.role.permissions : [];
  return { r, allowed: perms.some((p: any) => p?.name === "procurement.requisitions.view" && p?.value === true) };
}

export class ProcurementRequisitionFlowController {
  static async returnForAmendment(req: Request, res: Response) {
    try {
      const data = await Approvals.decide({ requisitionId: req.params.id, actorId: uid(req), decision: "RETURN", reason: req.body?.reason ?? req.body?.comments });
      if (!data) return res.status(409).json({ success: false, message: "This requisition has no open approval route to return." });
      return ok(res, data, "Requisition returned to the requester for amendment");
    } catch (e) {
      return fail(res, e, "Failed to return the requisition");
    }
  }

  static async comment(req: Request, res: Response) {
    try {
      const data = await Approvals.decide({ requisitionId: req.params.id, actorId: uid(req), decision: "COMMENT", reason: req.body?.comment ?? req.body?.comments });
      if (!data) return res.status(409).json({ success: false, message: "This requisition has no open approval route." });
      return ok(res, data, "Comment recorded");
    } catch (e) {
      return fail(res, e, "Failed to record the comment");
    }
  }

  static async delegate(req: Request, res: Response) {
    try {
      const data = await Approvals.delegate({ requisitionId: req.params.id, actorId: uid(req), delegatedToId: req.body?.delegatedToId, reason: req.body?.reason });
      try {
        const { default: AuditService } = await import("../services/AuditService");
        await AuditService.log({ userId: uid(req), action: "APPROVAL_DELEGATE", entityType: "PurchaseRequisition", entityId: req.params.id, newValues: { delegatedToId: req.body?.delegatedToId, reason: req.body?.reason ?? null }, eventType: "ASSIGN" });
      } catch (_e) { /* the delegation stands; the audit failure is logged by the writer */ }
      return ok(res, data, "Approval delegated");
    } catch (e) {
      return fail(res, e, "Failed to delegate the approval");
    }
  }

  static async delegateCandidates(req: Request, res: Response) {
    try {
      return ok(res, await Approvals.delegateCandidates(req.params.id, uid(req)));
    } catch (e) {
      return fail(res, e, "Failed to load who can take this over");
    }
  }

  static async decisions(req: Request, res: Response) {
    try {
      const { r, allowed } = await canSee(req, req.params.id);
      if (!r) return res.status(404).json({ success: false, message: "Requisition not found" });
      if (!allowed) return res.status(403).json({ success: false, message: "You cannot see this requisition's decision history." });
      return ok(res, await Approvals.decisions(req.params.id));
    } catch (e) {
      return fail(res, e, "Failed to load the decision history");
    }
  }

  /** Plan line and budget position of a requisition: what it draws, what remains, and whether it would clear the gates today. */
  static async position(req: Request, res: Response) {
    try {
      const { r, allowed } = await canSee(req, req.params.id);
      if (!r) return res.status(404).json({ success: false, message: "Requisition not found" });
      if (!allowed) return res.status(403).json({ success: false, message: "You cannot see this requisition." });
      const pr = await prisma.purchaseRequisition.findUnique({ where: { id: req.params.id }, include: { currency: { select: { code: true } } } });
      const year = String(new Date().getFullYear());
      const budget = pr.budgetCode ? await Rules.budgetPosition(pr.budgetCode, pr.costCentre, year, pr.id) : null;
      const plan = pr.planItemId ? await Rules.planLineConsumption(pr.planItemId, pr.id) : null;
      return ok(res, {
        currency: pr.currency?.code ?? null,
        estimatedTotal: Number(pr.totalAmount),
        budget: budget ? { budgetCode: pr.budgetCode, costCentre: budget.line.costCentre || null, financialYear: budget.line.financialYear, amount: budget.amount, committed: budget.committed, available: budget.available } : null,
        plan: plan ? { planNumber: plan.item.plan.planNumber, requirement: plan.item.description, planned: plan.planned, consumedByOthers: plan.consumed, remaining: plan.remaining } : null,
      });
    } catch (e) {
      return fail(res, e, "Failed to load the requisition's position");
    }
  }

  /**
   * Bulk context for the requisition screens: for each id the caller may see, its decision history, budget/plan position and,
   * for an approver on the current step, who the step could be delegated to. One call instead of one per requisition.
   */
  static async context(req: Request, res: Response) {
    try {
      const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(String).slice(0, 120);
      const out: Record<string, any> = {};
      const year = String(new Date().getFullYear());
      for (const id of ids) {
        const { r, allowed } = await canSee(req, id);
        if (!r || !allowed) continue;
        const pr = await prisma.purchaseRequisition.findUnique({ where: { id }, include: { currency: { select: { code: true } } } });
        const budget = pr.budgetCode ? await Rules.budgetPosition(pr.budgetCode, pr.costCentre, year, pr.id) : null;
        const plan = pr.planItemId ? await Rules.planLineConsumption(pr.planItemId, pr.id) : null;
        let delegate = null;
        if (r.status === "PENDING_APPROVAL") {
          delegate = await Approvals.delegateCandidates(id, uid(req)).catch(() => null);
        }
        out[id] = {
          decisions: await Approvals.decisions(id),
          attachments: await prisma.purchaseRequisitionAttachment.findMany({ where: { requisitionId: id }, orderBy: { createdAt: "asc" }, select: { id: true, fileName: true, fileUrl: true, mimeType: true, fileSizeBytes: true, createdAt: true } }),
          position: {
            currency: pr.currency?.code ?? null,
            estimatedTotal: Number(pr.totalAmount),
            budget: budget ? { budgetCode: pr.budgetCode, costCentre: budget.line.costCentre || null, financialYear: budget.line.financialYear, amount: budget.amount, committed: budget.committed, available: budget.available } : null,
            plan: plan ? { planNumber: plan.item.plan.planNumber, requirement: plan.item.description, planned: plan.planned, consumedByOthers: plan.consumed, remaining: plan.remaining } : null,
          },
          delegate,
        };
      }
      return ok(res, out);
    } catch (e) {
      return fail(res, e, "Failed to load requisition context");
    }
  }

  // ------------------------------------------------------------------ attachments
  static async attachments(req: Request, res: Response) {
    try {
      const { r, allowed } = await canSee(req, req.params.id);
      if (!r) return res.status(404).json({ success: false, message: "Requisition not found" });
      if (!allowed) return res.status(403).json({ success: false, message: "You cannot see this requisition." });
      const rows = await prisma.purchaseRequisitionAttachment.findMany({ where: { requisitionId: req.params.id }, orderBy: { createdAt: "asc" } });
      return ok(res, rows);
    } catch (e) {
      return fail(res, e, "Failed to load attachments");
    }
  }

  static async addAttachment(req: Request, res: Response) {
    try {
      const r = await prisma.purchaseRequisition.findUnique({ where: { id: req.params.id }, select: { requestedById: true, status: true } });
      if (!r) return res.status(404).json({ success: false, message: "Requisition not found" });
      if (r.requestedById !== uid(req)) return res.status(403).json({ success: false, message: "Only the requester can attach files to this requisition." });
      if (!["DRAFT", "REJECTED", "RETURNED"].includes(r.status)) return res.status(409).json({ success: false, message: "Attachments can be changed only while the requisition is a draft, rejected or returned." });
      const files: any[] = (req as any).files ?? [];
      const existing = await prisma.purchaseRequisitionAttachment.count({ where: { requisitionId: req.params.id } });
      const incoming = files.length || 1;
      if (existing + incoming > MAX_ATTACHMENTS) {
        return res.status(400).json({ success: false, message: `A requisition can carry at most ${MAX_ATTACHMENTS} attachments; it has ${existing}.` });
      }
      const created: any[] = [];
      if (files.length) {
        // Uploaded through the platform: validated, stored in the file store, then recorded.
        for (const f of files) {
          const ext = String(f.originalname || "").split(".").pop()?.toLowerCase() ?? "";
          if (!ATTACHMENT_EXTENSIONS.includes(ext)) return res.status(400).json({ success: false, message: `${f.originalname}: only ${ATTACHMENT_EXTENSIONS.join(", ")} files can be attached.` });
          if (!f.buffer?.length) return res.status(400).json({ success: false, message: `${f.originalname} is empty.` });
          const { storeFile } = await import("../services/ProcurementRegistersService");
          const stored = await storeFile(f);
          created.push(
            await prisma.purchaseRequisitionAttachment.create({
              data: { requisitionId: req.params.id, fileName: String(f.originalname).slice(0, 255), fileUrl: stored.downloadURL, mimeType: f.mimetype ? String(f.mimetype).slice(0, 128) : null, fileSizeBytes: f.size ?? f.buffer.length, uploadedById: uid(req) },
            })
          );
        }
      } else {
        const fileName = String(req.body?.fileName ?? "").trim();
        const fileUrl = String(req.body?.fileUrl ?? "").trim();
        if (!fileName || !fileUrl) return res.status(400).json({ success: false, message: "Choose a file to attach." });
        const { isPlatformMediaReference } = await import("../utils/safeFetchUrl");
        if (!isPlatformMediaReference(fileUrl)) return res.status(400).json({ success: false, message: "Attach a file uploaded through the platform." });
        created.push(
          await prisma.purchaseRequisitionAttachment.create({
            data: { requisitionId: req.params.id, fileName: fileName.slice(0, 255), fileUrl, mimeType: req.body?.mimeType ? String(req.body.mimeType).slice(0, 128) : null, fileSizeBytes: Number.isFinite(Number(req.body?.fileSizeBytes)) ? Number(req.body.fileSizeBytes) : null, uploadedById: uid(req) },
          })
        );
      }
      await AuditService.log({ userId: uid(req), action: "UPDATE", entityType: "PurchaseRequisition", entityId: req.params.id, newValues: { attached: created.map((c) => c.fileName) } });
      return ok(res, created, "Attached", 201);
    } catch (e) {
      return fail(res, e, "Failed to attach the file");
    }
  }

  static async removeAttachment(req: Request, res: Response) {
    try {
      const a = await prisma.purchaseRequisitionAttachment.findFirst({ where: { id: req.params.attachmentId, requisitionId: req.params.id } });
      const r = await prisma.purchaseRequisition.findUnique({ where: { id: req.params.id }, select: { requestedById: true, status: true } });
      if (!a || !r) return res.status(404).json({ success: false, message: "Attachment not found" });
      if (r.requestedById !== uid(req)) return res.status(403).json({ success: false, message: "Only the requester can remove attachments." });
      if (!["DRAFT", "REJECTED", "RETURNED"].includes(r.status)) return res.status(409).json({ success: false, message: "Attachments can be changed only while the requisition is a draft, rejected or returned." });
      await prisma.purchaseRequisitionAttachment.delete({ where: { id: a.id } });
      await AuditService.log({ userId: uid(req), action: "UPDATE", entityType: "PurchaseRequisition", entityId: req.params.id, newValues: { detached: a.fileName } });
      return ok(res, { id: a.id }, "Removed");
    } catch (e) {
      return fail(res, e, "Failed to remove the attachment");
    }
  }

  // ------------------------------------------------------------------ budget master
  static async budgets(req: Request, res: Response) {
    try {
      const where: any = {};
      if (req.query.financialYear) where.financialYear = { contains: String(req.query.financialYear) };
      if (req.query.status) where.status = String(req.query.status);
      const rows = await prisma.procurementBudget.findMany({ where, orderBy: [{ financialYear: "desc" }, { budgetCode: "asc" }, { costCentre: "asc" }], take: 500 });
      const out = [];
      for (const b of rows) {
        const year = String(b.financialYear).match(/(\d{4})/)?.[1] ?? String(new Date().getFullYear());
        const pos = await Rules.budgetPosition(b.budgetCode, b.costCentre || null, year);
        out.push({ ...b, amount: Number(b.amount), committed: pos && pos.line.id === b.id ? pos.committed : 0, available: pos && pos.line.id === b.id ? pos.available : Number(b.amount) });
      }
      return ok(res, out);
    } catch (e) {
      return fail(res, e, "Failed to load budgets");
    }
  }

  static async saveBudget(req: Request, res: Response) {
    try {
      const user = (req as any).user;
      if (!isModulePrivilegedUser(user)) return res.status(403).json({ success: false, message: "Only an administrator or the Chief Financial Officer can change budgets." });
      const b = req.body ?? {};
      const financialYear = String(b.financialYear ?? "").trim();
      const budgetCode = String(b.budgetCode ?? "").trim();
      if (!/\d{4}/.test(financialYear)) return res.status(400).json({ success: false, message: "Enter the financial year, for example 2026." });
      if (!budgetCode) return res.status(400).json({ success: false, message: "A budget code is required." });
      const amount = Number(b.amount);
      if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({ success: false, message: "The budget amount must be a number of zero or more." });
      const status = String(b.status ?? "ACTIVE").toUpperCase();
      if (!["ACTIVE", "INACTIVE"].includes(status)) return res.status(400).json({ success: false, message: "Status must be ACTIVE or INACTIVE." });
      const data = {
        financialYear: financialYear.slice(0, 16), budgetCode: budgetCode.slice(0, 64), costCentre: String(b.costCentre ?? "").trim().slice(0, 128),
        department: b.department ? String(b.department).trim().slice(0, 191) : null, description: b.description ? String(b.description).trim().slice(0, 255) : null,
        amount, currencyCode: b.currencyCode ? String(b.currencyCode).trim().toUpperCase().slice(0, 8) : null, status,
        // The GL code a purchase order against this budget line carries (§21).
        glCode: b.glCode ? String(b.glCode).trim().slice(0, 64) : null,
      };
      const id = req.params.id;
      const row = id
        ? await prisma.procurementBudget.update({ where: { id }, data })
        : await prisma.procurementBudget.create({ data: { ...data, createdById: user.id } });
      await AuditService.log({ userId: user.id, action: id ? "UPDATE" : "CREATE", entityType: "ProcurementBudget", entityId: row.id, newValues: data });
      return ok(res, { ...row, amount: Number(row.amount) }, "Budget saved", id ? 200 : 201);
    } catch (e: any) {
      if (e?.code === "P2002") return res.status(409).json({ success: false, message: "That budget code and cost centre already has a budget for the year." });
      return fail(res, e, "Failed to save the budget");
    }
  }

  // ------------------------------------------------------------------ policy settings
  static async policy(_req: Request, res: Response) {
    try {
      const s = await Rules.settings();
      const row = await prisma.procurementSettings.findUnique({ where: { id: "default" } });
      return ok(res, { ...s, prNumberFormat: row?.prNumberFormat ?? "PR-{YYYY}-{######}" });
    } catch (e) {
      return fail(res, e, "Failed to load the requisition policy");
    }
  }

  static async savePolicy(req: Request, res: Response) {
    try {
      const user = (req as any).user;
      if (!isModulePrivilegedUser(user)) return res.status(403).json({ success: false, message: "Only an administrator or the Chief Financial Officer can change the requisition policy." });
      const b = req.body ?? {};
      const data: any = {};
      const { SUGGESTED_VENDOR_POLICIES, PLAN_LINK_POLICIES } = await import("../services/ProcurementRequisitionRulesService");
      const pick = (key: string, list: readonly string[], label: string) => {
        if (b[key] === undefined) return;
        const v = String(b[key]).toUpperCase();
        if (!list.includes(v)) throw Object.assign(new Error(`${label} must be one of: ${list.join(", ")}.`), { status: 400 });
        data[key] = v;
      };
      pick("suggestedVendorPolicy", SUGGESTED_VENDOR_POLICIES, "Suggested vendor policy");
      pick("budgetCheckMode", BUDGET_CHECK_MODES, "Budget check mode");
      pick("planLinkPolicy", PLAN_LINK_POLICIES, "Plan link policy");
      if (b.prNumberFormat !== undefined) {
        const { validateNumberFormat } = await import("../services/DocumentNumberingService");
        const bad = validateNumberFormat(String(b.prNumberFormat));
        if (bad) throw Object.assign(new Error(bad), { status: 400 });
        data.prNumberFormat = String(b.prNumberFormat);
      }
      await prisma.procurementSettings.upsert({ where: { id: "default" }, update: data, create: { id: "default", ...data } });
      await AuditService.log({ userId: user.id, action: "UPDATE", entityType: "ProcurementSettings", entityId: "default", newValues: data });
      return ProcurementRequisitionFlowController.policy(req, res);
    } catch (e) {
      return fail(res, e, "Failed to save the requisition policy");
    }
  }

  /** Vocabulary the requisition form offers, so the screens never hardcode it. */
  static async options(_req: Request, res: Response) {
    try {
      const R = await import("../services/ProcurementRequisitionRulesService");
      const [currencies, staff] = await Promise.all([
        prisma.currency.findMany({ where: { isActive: true }, select: { id: true, code: true, name: true, symbol: true, isDefault: true }, orderBy: { code: "asc" } }),
        Approvals.internalStaff(),
      ]);
      return ok(res, {
        procurementMethods: R.PROCUREMENT_METHODS, riskLevels: R.RISK_LEVELS, exceptionTypes: R.EXCEPTION_TYPES, currencies,
        // Named in pickers (a plan line's responsible officer); names and departments only.
        people: staff.map((u) => ({ id: u.id, name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email, department: u.userDepartment ?? null })),
        policy: { ...(await Rules.settings()), prNumberFormat: (await prisma.procurementSettings.findUnique({ where: { id: "default" } }))?.prNumberFormat ?? "PR-{YYYY}-{######}" },
      });
    } catch (e) {
      return fail(res, e, "Failed to load requisition options");
    }
  }
}
