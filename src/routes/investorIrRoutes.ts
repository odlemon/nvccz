// @ts-nocheck
import { Router, Response, NextFunction } from "express";
import { authenticate } from "../middleware/authenticate";
import { FundraisingRequest } from "../middleware/fundraisingAuth";
import { FundraisingAccessService } from "../services/fundraising/FundraisingAccessService";
import { FundraisingIrController } from "../controllers/FundraisingIrController";

const router = Router();

router.use(authenticate);

function requireIrEdit(req: FundraisingRequest, res: Response, next: NextFunction) {
  try {
    FundraisingAccessService.assertCanEdit(req.user);
    next();
  } catch (e: any) {
    next(e);
  }
}

router.get("/", FundraisingIrController.listInvestors);
router.post("/", requireIrEdit, FundraisingIrController.createInvestor);
router.get("/:investorId", FundraisingIrController.getInvestor);
router.patch("/:investorId", requireIrEdit, FundraisingIrController.patchInvestor);
router.post("/:investorId/contacts", requireIrEdit, FundraisingIrController.addInvestorContact);
router.get("/:investorId/relationship-summary", FundraisingIrController.investorRelationshipSummary);

export default router;
