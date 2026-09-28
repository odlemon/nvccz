// @ts-nocheck
/** Employee expense claims (SRD ACC-EXP-03…07): see services/ExpenseClaimService.ts. Mounted at /api/accounting/claims.
 *  Every staff member reaches their own claims, so the path is exempt from the Accounting access guard; each step checks
 *  its own rights in the service (line manager, finance reviewer, finance manager — never the claimant). */
import express from "express";
import multer from "multer";
import { authenticate } from "../middleware/authenticate";
import { isExternalPortalUser } from "../utils/portalAuth";
import { userHasEffectivePermission } from "../config/cfoModulePermissions";
import { prisma } from "../utils/database";
import { ExpenseClaimService as S } from "../services/ExpenseClaimService";

const router = express.Router();
router.use(authenticate);
router.use((req: any, res: any, next: any) => (isExternalPortalUser(req.user) ? res.status(403).json({ success: false, message: "Expense claims are for staff." }) : next()));
const receipt = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^(application\/pdf|image\/(png|jpe?g|webp|heic))$/.test(file.mimetype)),
});
const h = (fn, created = false) => async (req: any, res: any) => {
  try { const data = await fn(req); res.status(created ? 201 : 200).json({ success: true, data }); }
  catch (e: any) { res.status(e?.statusCode || 400).json({ success: false, message: e?.message || "Claim request failed" }); }
};
async function storeReceipt(req: any) {
  if (!req.file) return undefined;
  const { FirebaseStorageService } = await import("../services/FirebaseStorageService");
  const { downloadURL } = await FirebaseStorageService.uploadAccountingDocument(req.file.buffer, req.file.originalname, "CLAIM_RECEIPT");
  return { url: downloadURL, name: String(req.file.originalname).slice(0, 255) };
}

/** What the claim forms need: categories, currencies, projects; expense accounts for reviewers, banks for payers. */
router.get("/options", h(async (req) => {
  const has = (k) => userHasEffectivePermission(req.user, k);
  const [categories, currencies, projects] = await Promise.all([
    prisma.expenseCategory.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.currency.findMany({ where: { isActive: true }, select: { code: true, name: true }, orderBy: { code: "asc" } }).catch(() => prisma.currency.findMany({ select: { code: true, name: true } })),
    prisma.project.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }).catch(() => []),
  ]);
  const accounts = has("manage_accounting") || has("manage_ledger")
    ? await prisma.chartOfAccounts.findMany({ where: { isActive: true, accountType: { contains: "Expense" } }, select: { id: true, accountNo: true, accountName: true }, orderBy: { accountNo: "asc" } })
    : [];
  const banks = has("manage_ledger") ? await prisma.bank.findMany({ where: { isActive: true }, select: { id: true, name: true, accountNumber: true, currency: { select: { code: true } } }, orderBy: { name: "asc" } }) : [];
  const roles = { lineManager: has("accounting.timesheets.manage"), reviewer: has("manage_accounting"), approver: has("manage_ledger"), register: ["view_accounting", "manage_accounting", "view_ledger", "manage_ledger"].some(has) };
  return { me: req.user.id, categories, currencies, projects, accounts, banks: banks.map((b) => ({ id: b.id, name: b.name, accountNumber: b.accountNumber, currency: b.currency?.code })), roles, policy: await S.policy() };
}));
router.get("/policy", h(() => S.policy()));
router.put("/policy", h((req) => S.savePolicy(req.body || {}, req.user)));
router.get("/", h((req) => S.list(req.user, String(req.query.scope || "mine"))));
router.post("/", h((req) => S.create(req.body || {}, req.user), true));
router.get("/:id", h((req) => S.get(req.params.id, req.user)));
router.patch("/:id", h((req) => S.update(req.params.id, req.body || {}, req.user)));
router.post("/:id/lines", receipt.single("receipt"), h(async (req) => S.addLine(req.params.id, req.body || {}, req.user, await storeReceipt(req)), true));
router.post("/:id/lines/:lineId/receipt", receipt.single("receipt"), h(async (req) => {
  const r = await storeReceipt(req);
  if (!r) throw Object.assign(new Error("Attach the receipt (PDF or image)."), { statusCode: 400 });
  return S.attachReceipt(req.params.id, req.params.lineId, req.user, r);
}));
router.delete("/:id/lines/:lineId", h((req) => S.removeLine(req.params.id, req.params.lineId, req.user)));
router.post("/:id/submit", h((req) => S.submit(req.params.id, req.user)));
router.post("/:id/withdraw", h((req) => S.withdraw(req.params.id, req.user)));
router.post("/:id/manager-approve", h((req) => S.managerApprove(req.params.id, req.user)));
router.post("/:id/review", h((req) => S.review(req.params.id, req.body || {}, req.user)));
router.post("/:id/approve", h((req) => S.approve(req.params.id, req.body || {}, req.user)));
router.post("/:id/return", h((req) => S.returnClaim(req.params.id, req.body?.reason, req.user)));
router.post("/:id/reject", h((req) => S.reject(req.params.id, req.body?.reason, req.user)));
router.post("/:id/reimburse", h((req) => S.reimburse(req.params.id, req.body || {}, req.user)));

export default router;
