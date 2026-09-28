// @ts-nocheck
import express from "express";
import multer from "multer";
import { requireAnyPermission } from "../middleware/permissionAuth";
import { PROCUREMENT_PERMISSIONS as P } from "../config/procurementPermissions";
import {
  ProcurementContracts,
  ProcurementDocuments,
  ProcurementPlans,
  ProcurementPlanUse,
  RegisterError,
} from "../services/ProcurementRegistersService";
import { publicErrorMessage } from "../utils/publicErrorMessage";

/**
 * Procurement V23 registers: document vault, contracts, annual plans.
 *
 * Mounted inside procurementRoutes after its `authenticate` and `requireInternalStaffUser()`
 * guards, so every route here is staff-only; each also carries its own procurement.* grant.
 *
 *   GET    /procurement/documents                   ?folder&status&search
 *   POST   /procurement/documents                   multipart files[] + name, folder, documentType, relatedRecord, classification, source, description
 *   POST   /procurement/documents/:id/version       multipart file
 *   PATCH  /procurement/documents/:id/status        {status: under_review|approved|archived}
 *   GET    /procurement/contracts
 *   POST   /procurement/contracts                   {title, vendorId | quotationId, value, currencyCode, startDate, endDate, paymentTerms, scope}
 *   PUT    /procurement/contracts/:id               draft only
 *   POST   /procurement/contracts/:id/activate
 *   POST   /procurement/contracts/:id/terminate
 *   GET    /procurement/plans                       ?fiscalYear
 *   POST   /procurement/plans                       {name, department, fiscalYear, budget, currencyCode, notes}
 *   PUT    /procurement/plans/:id                   draft or rejected only
 *   POST   /procurement/plans/:id/items             {description, category, quarter, method, estimatedValue, department}
 *   PUT    /procurement/plans/:id/items/:itemId      same fields, all optional; draft or rejected plan only
 *   DELETE /procurement/plans/:id/items/:itemId
 *   POST   /procurement/plans/:id/submit
 *   POST   /procurement/plans/:id/approve           procurement.plans.approve; not by the plan's author
 *   POST   /procurement/plans/:id/reject            {reason}
 */
const router = express.Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024, files: 10 } });

const run = (fn: (req, res) => Promise<any>, status = 200) => async (req, res) => {
  try {
    const data = await fn(req, res);
    res.status(status).json({ success: true, data });
  } catch (err: any) {
    const code = err instanceof RegisterError || Number.isInteger(err?.status) ? err.status : 500;
    if (code >= 500) console.error("procurement registers:", err);
    res.status(code).json({ success: false, message: code >= 500 ? publicErrorMessage(err, "Request failed") : err?.message || "Request failed" });
  }
};

const uid = (req) => req.user?.id;

// ---------------------------------------------------------------- documents
router.get("/documents", requireAnyPermission([P.documentsView, P.documentsManage]), run((req) => ProcurementDocuments.list(req.query)));
router.post(
  "/documents",
  requireAnyPermission([P.documentsManage]),
  upload.array("files", 10),
  run((req) => ProcurementDocuments.upload({ ...req.body, files: req.files ?? [], uploadedById: uid(req) }), 201),
);
router.post(
  "/documents/:id/version",
  requireAnyPermission([P.documentsManage]),
  upload.single("file"),
  run((req) => ProcurementDocuments.uploadVersion(req.params.id, req.file, uid(req), req.body?.note)),
);
router.get("/documents/:id", requireAnyPermission([P.documentsView, P.documentsManage]), run((req) => ProcurementDocuments.get(req.params.id)));
router.get(
  "/documents/:id/preview",
  requireAnyPermission([P.documentsView, P.documentsManage]),
  run((req) => ProcurementDocuments.preview(req.params.id, { version: req.query.version ? Number(req.query.version) : undefined, userId: uid(req) })),
);
// The stored bytes: inline (preview) or as an attachment (download). Either way the access is written to the audit trail.
router.get("/documents/:id/file", requireAnyPermission([P.documentsView, P.documentsManage]), async (req, res) => {
  try {
    const disposition = String(req.query.disposition) === "attachment" ? "attachment" : "inline";
    const out = await ProcurementDocuments.file(req.params.id, { version: req.query.version ? Number(req.query.version) : undefined, disposition, userId: uid(req) });
    res.setHeader("Content-Type", out.mime);
    res.setHeader("Content-Length", String(out.buffer.length));
    res.setHeader("Content-Disposition", `${disposition}; filename="${encodeURIComponent(out.filename)}"; filename*=UTF-8''${encodeURIComponent(out.filename)}`);
    // The browser app is on another origin: without this it cannot read the file name and would save the download as "document".
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition, Content-Length");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
    res.status(200).end(out.buffer);
  } catch (err: any) {
    const code = Number.isInteger(err?.status) ? err.status : 500;
    if (code >= 500) console.error("procurement document file:", err);
    res.status(code).json({ success: false, message: code >= 500 ? publicErrorMessage(err, "Request failed") : err?.message || "Request failed" });
  }
});
router.patch("/documents/:id/status", requireAnyPermission([P.documentsManage]), run((req) => ProcurementDocuments.setStatus(req.params.id, req.body?.status, uid(req))));

// ---------------------------------------------------------------- contracts
router.get("/contracts", requireAnyPermission([P.contractsView, P.contractsManage]), run(() => ProcurementContracts.list()));
router.post("/contracts", requireAnyPermission([P.contractsManage]), run((req) => ProcurementContracts.create(req.body ?? {}, uid(req)), 201));
router.put("/contracts/:id", requireAnyPermission([P.contractsManage]), run((req) => ProcurementContracts.update(req.params.id, req.body ?? {}, uid(req))));
router.post("/contracts/:id/activate", requireAnyPermission([P.contractsManage]), run((req) => ProcurementContracts.setStatus(req.params.id, "ACTIVE", uid(req))));
router.post("/contracts/:id/terminate", requireAnyPermission([P.contractsManage]), run((req) => ProcurementContracts.setStatus(req.params.id, "TERMINATED", uid(req))));

// ---------------------------------------------------------------- plans
// Plan lines a requisition may draw on (approved plans only) and the consumption of one line. Ahead of /plans/:id.
router.get("/plans/available-lines", run((req) => ProcurementPlanUse.availableLines(req.query)));
router.get("/plans/items/:itemId/consumption", run((req) => ProcurementPlanUse.lineConsumption(req.params.itemId)));
router.get("/plans", requireAnyPermission([P.plansView, P.plansManage, P.plansApprove]), run((req) => ProcurementPlans.list(req.query)));
router.post("/plans", requireAnyPermission([P.plansManage]), run((req) => ProcurementPlans.create(req.body ?? {}, uid(req)), 201));
router.put("/plans/:id", requireAnyPermission([P.plansManage]), run((req) => ProcurementPlans.update(req.params.id, req.body ?? {}, uid(req))));
router.post("/plans/:id/items", requireAnyPermission([P.plansManage]), run((req) => ProcurementPlans.addItem(req.params.id, req.body ?? {}, uid(req)), 201));
router.put("/plans/:id/items/:itemId", requireAnyPermission([P.plansManage]), run((req) => ProcurementPlans.updateItem(req.params.id, req.params.itemId, req.body ?? {}, uid(req))));
router.delete("/plans/:id/items/:itemId", requireAnyPermission([P.plansManage]), run((req) => ProcurementPlans.removeItem(req.params.id, req.params.itemId, uid(req))));
router.post("/plans/:id/submit", requireAnyPermission([P.plansManage]), run((req) => ProcurementPlans.submit(req.params.id, uid(req))));
router.post("/plans/:id/approve", requireAnyPermission([P.plansApprove]), run((req) => ProcurementPlans.decide(req.params.id, "APPROVED", uid(req))));
router.post("/plans/:id/reject", requireAnyPermission([P.plansApprove]), run((req) => ProcurementPlans.decide(req.params.id, "REJECTED", uid(req), req.body?.reason)));

export default router;
