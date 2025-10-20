// @ts-nocheck
import express from "express";
import { ProcurementApprovalConfigController } from "../controllers/ProcurementApprovalConfigController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/procurement-approval-configs:
 *   post:
 *     summary: Create a new procurement approval configuration
 *     tags: [Procurement Approval Configuration]
 *     security:
 *       - bearerAuth: []
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
 *                           userId:
 *                             type: string
 *                             description: User ID (required if stepType is USER)
 *                           roleId:
 *                             type: string
 *                             description: Role ID (DEPRECATED - use roleCode instead)
 *                           roleCode:
 *                             type: string
 *                             description: Hardcoded role code (FIN_MGR, PROC_OFF, etc.) - Use this for stepType ROLE
 *                           departmentId:
 *                             type: string
 *                             description: Department ID (required if stepType is DEPARTMENT)
 *                           amountThreshold:
 *                             type: number
 *                             description: Amount threshold (required if stepType is AMOUNT_THRESHOLD)
 *                           isRequired:
 *                             type: boolean
 *                             default: true
 *                             description: Whether this step is required
 *                           canDelegate:
 *                             type: boolean
 *                             default: false
 *                             description: Whether approver can delegate
 *                           autoApprove:
 *                             type: boolean
 *                             default: false
 *                             description: Whether this step auto-approves
 *                           approvalOrder:
 *                             type: string
 *                             enum: [SEQUENTIAL, PARALLEL]
 *                             default: SEQUENTIAL
 *                             description: Approval order for this step
 *     responses:
 *       201:
 *         description: Procurement approval configuration created successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post("/", ProcurementApprovalConfigController.createProcurementApprovalConfig);

/**
 * @swagger
 * /api/procurement-approval-configs:
 *   get:
 *     summary: Get all procurement approval configurations
 *     tags: [Procurement Approval Configuration]
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
 * /api/procurement-approval-configs/active:
 *   get:
 *     summary: Get active procurement approval configuration
 *     tags: [Procurement Approval Configuration]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Active procurement approval configuration retrieved successfully
 *       404:
 *         description: No active configuration found
 *       401:
 *         description: Unauthorized
 */
router.get("/active", ProcurementApprovalConfigController.getActiveProcurementApprovalConfig);

/**
 * @swagger
 * /api/procurement-approval-configs/{id}:
 *   get:
 *     summary: Get procurement approval configuration by ID
 *     tags: [Procurement Approval Configuration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Configuration ID
 *     responses:
 *       200:
 *         description: Procurement approval configuration retrieved successfully
 *       404:
 *         description: Configuration not found
 *       401:
 *         description: Unauthorized
 */
router.get("/:id", ProcurementApprovalConfigController.getProcurementApprovalConfigById);

/**
 * @swagger
 * /api/procurement-approval-configs/stages/{stageType}/steps:
 *   get:
 *     summary: Get approval steps for a specific stage type
 *     tags: [Procurement Approval Configuration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: stageType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [PURCHASE_REQUISITION, PURCHASE_ORDER, INVOICE, GRN]
 *         description: Stage type
 *     responses:
 *       200:
 *         description: Approval steps retrieved successfully
 *       404:
 *         description: No steps found for stage
 *       401:
 *         description: Unauthorized
 */
router.get("/stages/:stageType/steps", ProcurementApprovalConfigController.getApprovalStepsForStage);

/**
 * @swagger
 * /api/procurement-approval-configs/requests:
 *   post:
 *     summary: Create an approval request
 *     tags: [Procurement Approval Requests]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - configId
 *               - stageType
 *               - entityId
 *             properties:
 *               configId:
 *                 type: string
 *                 description: Configuration ID
 *               stageType:
 *                 type: string
 *                 enum: [PURCHASE_REQUISITION, PURCHASE_ORDER, INVOICE, GRN]
 *                 description: Stage type
 *               entityId:
 *                 type: string
 *                 description: Entity ID
 *               entityData:
 *                 type: object
 *                 description: Entity data snapshot
 *     responses:
 *       201:
 *         description: Approval request created successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post("/requests", ProcurementApprovalConfigController.createApprovalRequest);

/**
 * @swagger
 * /api/procurement-approval-configs/requests/my:
 *   get:
 *     summary: Get approval requests for current user
 *     tags: [Procurement Approval Requests]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, APPROVED, REJECTED, CANCELLED]
 *         description: Filter by status
 *     responses:
 *       200:
 *         description: Approval requests retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get("/requests/my", ProcurementApprovalConfigController.getApprovalRequestsForUser);

/**
 * @swagger
 * /api/procurement-approval-configs/requests/{requestId}/stages/{stageId}/approve:
 *   put:
 *     summary: Process an approval (approve/reject)
 *     tags: [Procurement Approval Requests]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: string
 *         description: Request ID
 *       - in: path
 *         name: stageId
 *         required: true
 *         schema:
 *           type: string
 *         description: Stage ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [APPROVED, REJECTED]
 *                 description: Approval status
 *               comments:
 *                 type: string
 *                 description: Approval comments
 *               delegatedToId:
 *                 type: string
 *                 description: User ID to delegate to (if delegation is allowed)
 *     responses:
 *       200:
 *         description: Approval processed successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.put("/requests/:requestId/stages/:stageId/approve", ProcurementApprovalConfigController.processApproval);

/**
 * @swagger
 * /api/procurement-approval-configs/delete-all:
 *   delete:
 *     summary: Delete all procurement approval configurations (Admin only)
 *     tags: [Procurement Approval Configuration]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All configurations deleted successfully
 *       401:
 *         description: Unauthorized
 */
router.delete("/delete-all", ProcurementApprovalConfigController.deleteAllProcurementApprovalConfigs);

export default router;
