// @ts-nocheck
/** Supplier payment runs (SRD ACC-AP-11): see services/PaymentRunService.ts. Mounted at /api/accounting/payment-runs
 *  behind the Accounting access guard: preparers create, submit and cancel; approvers approve and settle. */
import express from "express";
import multer from "multer";
import { authenticate } from "../middleware/authenticate";
import { PaymentRunService } from "../services/PaymentRunService";

const router = express.Router();
router.use(authenticate);
const proof = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^(application\/pdf|image\/(png|jpe?g|webp))$/.test(file.mimetype)),
});
const h = (fn) => async (req: any, res: any) => {
  try { const data = await fn(req); res.status(req.method === "POST" && !req.params.id ? 201 : 200).json({ success: true, data }); }
  catch (e: any) { res.status(e?.statusCode || 400).json({ success: false, message: e?.message || "Payment run request failed" }); }
};

router.get("/", h(() => PaymentRunService.list()));
router.get("/candidates", h((req) => PaymentRunService.candidates(String(req.query.bankId || ""))));
router.post("/", h((req) => PaymentRunService.create(req.body || {}, req.user.id)));
router.get("/:id", h((req) => PaymentRunService.get(req.params.id)));
router.post("/:id/submit", h((req) => PaymentRunService.submit(req.params.id, req.user.id)));
router.post("/:id/approve", h((req) => PaymentRunService.approve(req.params.id, req.user.id)));
router.post("/:id/cancel", h((req) => PaymentRunService.cancel(req.params.id, req.user.id, req.body?.reason)));
router.get("/:id/bank-file", async (req: any, res: any) => {
  try {
    const f = await PaymentRunService.bankFile(req.params.id, req.user.id);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${f.filename}"`);
    res.send("﻿" + f.csv);
  } catch (e: any) { res.status(e?.statusCode || 400).json({ success: false, message: e?.message || "Failed to produce the bank file" }); }
});
router.post("/:id/settle", proof.single("proofOfPayment"), h(async (req) => {
  const file = req.file;
  if (!file) throw Object.assign(new Error("Attach the bank's confirmation of the payments (PDF or image)."), { statusCode: 400 });
  const { FirebaseStorageService } = await import("../services/FirebaseStorageService");
  const ext = (file.originalname.split(".").pop() || "pdf").slice(0, 5);
  const { filePath } = await FirebaseStorageService.uploadImportFile(file.buffer, `run-${req.params.id.slice(0, 12)}-${Date.now()}.${ext}`, `run-${req.params.id.slice(0, 12)}`, String(req.user.id).slice(0, 12));
  return PaymentRunService.settle(req.params.id, req.user.id, { bankReference: req.body?.bankReference, proofPath: filePath });
}));

export default router;
