// @ts-nocheck
import express from "express";
import { ProcurementApprovalConfigController } from "../controllers/ProcurementApprovalConfigController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /procurement-approval-configs:
 *   get:
 *     summary: Get all procurement approval configurations
 *     description: **Required Role:** PROC_MGR, PROC_OFF, or ADMIN
 *     tags: [Procurement - Approval Configuration]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Procurement approval configurations retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get("/", ProcurementApprovalConfigController.getAllProcurementApprovalConfigs);

/**
 * @swagger
 * /procurement-approval-configs:
 *   post:
 *     summary: Create a new department-specific procurement approval configuration
 *     description: **Required Role:** ADMIN. Only one procurement approval configuration is permitted; use this endpoint once to seed the first config, then use PUT for updates. Setting `department` ties the workflow to that department.
 *     tags: [Procurement - Approval Configuration]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
             type: object
             required:
               - name
               - stages
             properties:
               name:
                 type: string
                 description: Configuration name
               description:
                 type: string
                 description: Configuration description
               department:
                 type: string
                 enum: [Finance, Operations, Procurement, Human Resources, Marketing, Legal, IT]
                 description: Department-specific config (null for the shared/general workflow)
               stages:
                 type: array
                 items:
                   type: object
                   required:
                     - stageType
                     - steps
                   properties:
                     stageType:
                       type: string
                       enum: [PURCHASE_REQUISITION, PURCHASE_ORDER, INVOICE, GRN]
                       description: Procurement stage type
                     steps:
                       type: array
                       items:
                         type: object
                         required:
                           - stepNumber
                           - stepName
                           - stepType
                         properties:
                           stepNumber:
                             type: integer
                             description: Step number (must start at 1 and be sequential)
                           stepName:
                             type: string
                             description: Step name
                           stepType:
                             type: string
                             enum: [USER, ROLE, DEPARTMENT, AMOUNT_THRESHOLD]
                             description: Who/what approves this step
                           roleCode:
                             type: string
                             description: Hardcoded role code (e.g., PROC_MGR, FIN_MGR) when stepType is ROLE
                           isRequired:
                             type: boolean
                             default: true
                           approvalOrder:
                             type: string
                             enum: [SEQUENTIAL, PARALLEL]
                             default: SEQUENTIAL
     responses:
       201:
         description: Procurement approval configuration created successfully
       400:
         description: Bad request / config already exists
       401:
         description: Unauthorized
 */
router.post("/", ProcurementApprovalConfigController.createProcurementApprovalConfig);

/**
 * @swagger
 * /procurement-approval-configs/{id}:
 *   put:
 *     summary: Update existing procurement approval configuration (SINGLE CONFIG SYSTEM)
 *     description: **Required Role:** ADMIN or PROC_MGR. Update the ONE and ONLY approval configuration. System enforces only ONE config exists.
 *     tags: [Procurement - Approval Configuration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Configuration ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - stages
 *             properties:
 *               name:
 *                 type: string
 *                 description: Configuration name
 *               description:
 *                 type: string
 *                 description: Configuration description
 *               department:
 *                 type: string
 *                 enum: [Finance, Operations, Procurement, Human Resources, Marketing, Legal, IT]
 *                 description: Department-specific config (null for general/default config)
 *               stages:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - stageType
 *                     - steps
 *                   properties:
 *                     stageType:
 *                       type: string
 *                       enum: [PURCHASE_REQUISITION, PURCHASE_ORDER, INVOICE, GRN]
 *                       description: Procurement stage type
 *                     steps:
 *                       type: array
 *                       items:
 *                         type: object
 *                         required:
 *                           - stepNumber
 *                           - stepName
 *                           - stepType
 *                         properties:
 *                           stepNumber:
 *                             type: integer
 *                             description: Step number (must be sequential)
 *                           stepName:
 *                             type: string
 *                             description: Step name
 *                           stepType:
 *                             type: string
 *                             enum: [USER, ROLE, DEPARTMENT, AMOUNT_THRESHOLD]
 *                             description: Type of approver
 *                           roleCode:
 *                             type: string
 *                             description: Hardcoded role code (FIN_MGR, PROC_OFF, etc.) - Use this for stepType ROLE
 *                           isRequired:
 *                             type: boolean
 *                             default: true
 *                             description: Whether this step is required
 *                           approvalOrder:
 *                             type: string
 *                             enum: [SEQUENTIAL, PARALLEL]
 *                             default: SEQUENTIAL
 *                             description: Approval order for this step
 *     responses:
 *       200:
 *         description: Procurement approval configuration updated successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Configuration not found
 */
router.put("/:id", ProcurementApprovalConfigController.updateProcurementApprovalConfig);


export default router;
