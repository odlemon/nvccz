// @ts-nocheck
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { methodGuard } from "../middleware/methodGuard"
import { requireAnyPermission } from "../middleware/permissionAuth"
import { prisma } from "../utils/database"
import { scoped, orgOnly, contractVisible, contractWritable, departmentInScope, personInScope, perfActor } from "../services/PerformanceScope"
import { PerformanceContractController } from "../controllers/PerformanceContractController";
import { PerformanceContractLifecycleService, ContractError } from "../services/PerformanceContractLifecycleService";

const router = express.Router();
const READ_KEYS = ["performance.contracts.view", "performance.contracts.manage"]
const WRITE_KEYS = ["performance.contracts.manage"]
const guard = methodGuard(READ_KEYS, WRITE_KEYS)

/**
 * Annual performance contract setup (one PC per scorecard type per period).
 * Resource guard (contracts.view / .manage) plus row scope (PerformanceScope): a contract is seen by the people named on it
 * and by the scope it falls in; signing needs only view, because the service admits only the contract's own signatories.
 */
const readGuard = requireAnyPermission(READ_KEYS)
const contractRule = (mode: "view" | "write") => scoped(async (req, a) => {
  const c = await prisma.performanceContract.findUnique({ where: { id: String(req.params.id) } });
  if (!c) return null;
  if (mode === "view") return (await contractVisible(a, c)) ? null : "This contract is outside what your role can see.";
  return (await contractWritable(a, c)) ? null : "Your role cannot change this contract.";
})
router.get("/", authenticate, guard, PerformanceContractController.list);
const crun = (fn) => async (req: any, res: any) => {
  try {
    res.json({ success: true, data: await fn(req) });
  } catch (e: any) {
    res.status(e instanceof ContractError ? e.statusCode : 500).json({ success: false, message: e?.message || "Error" });
  }
};
router.get("/registry", authenticate, guard, crun(async (req) => PerformanceContractLifecycleService.registry(await perfActor(req.user))));
router.get("/:id/detail", authenticate, guard, contractRule("view"), crun((req) => PerformanceContractLifecycleService.detail(req.params.id)));
router.put("/:id/amend", authenticate, guard, contractRule("write"), crun((req) => PerformanceContractLifecycleService.amend(req.params.id, req.body || {}, req.user)));
router.post("/:id/sign", authenticate, readGuard, contractRule("view"), crun((req) => PerformanceContractLifecycleService.sign(req.params.id, req.body?.note, req.user)));
router.post("/:id/close", authenticate, guard, contractRule("write"), crun((req) => PerformanceContractLifecycleService.close(req.params.id, req.body?.note, req.user)));
router.post("/:id/reopen", authenticate, guard, contractRule("write"), crun((req) => PerformanceContractLifecycleService.reopen(req.params.id, req.body?.note, req.user)));
router.post("/board", authenticate, guard, orgOnly("Only an organisation-wide role can set up the Board contract."), PerformanceContractController.createBoard);
router.post("/ceo", authenticate, guard, orgOnly("Only an organisation-wide role can set up the CEO contract."), PerformanceContractController.createCEO);
router.post("/department", authenticate, guard, scoped(async (req, a) => (departmentInScope(a, req.body?.departmentName) ? null : "You can only set up your own department's contract.")), PerformanceContractController.createDepartment);
router.post("/employee", authenticate, guard, scoped(async (req, a) => { const s = req.body?.subjectUserId; if (s && s === a.id && !a.isAdmin) return "No one sets up the contract they are measured by."; return (await personInScope(a, s)) ? null : "You can only set up contracts for people in your department."; }), PerformanceContractController.createEmployee);

export default router;
