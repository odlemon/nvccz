// @ts-nocheck
import { Router } from "express";
import multer from "multer";
import { authenticate } from "../middleware/authenticate";
import {
  PayrollComplianceController,
  PayrollExtendedController,
} from "../controllers/PayrollExtendedController";

const router = Router();
const certUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

router.post("/courses", authenticate, PayrollComplianceController.createCourse);
router.get("/courses", authenticate, PayrollComplianceController.listCourses);
router.put("/courses/:id", authenticate, PayrollComplianceController.updateCourse);
router.delete("/courses/:id", authenticate, PayrollComplianceController.deleteCourse);

router.post("/assignments", authenticate, PayrollComplianceController.createAssignment);
router.get("/assignments", authenticate, PayrollComplianceController.listAssignments);
router.delete("/assignments/:id", authenticate, PayrollComplianceController.deleteAssignment);

router.post(
  "/certifications",
  authenticate,
  certUpload.single("document"),
  PayrollComplianceController.createCertification
);
router.get("/certifications", authenticate, PayrollComplianceController.listCertifications);
router.get("/certifications/:id", authenticate, PayrollComplianceController.getCertification);
router.put(
  "/certifications/:id",
  authenticate,
  certUpload.single("document"),
  PayrollComplianceController.renewCertification
);
router.post("/certifications/:id/revoke", authenticate, PayrollComplianceController.revokeCertification);

router.get("/dashboard/expiring", authenticate, PayrollComplianceController.expiringDashboard);
router.post("/cron/expiry-check", PayrollComplianceController.runExpiryCron);

export default router;
