// @ts-nocheck
import express from "express";
import { ApprovalWorkflowController } from "../controllers/ApprovalWorkflowController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/approval-workflows:
 *   post:
 *     summary: Create a new approval workflow
 *     tags: [Approval Workflows]
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
 *               - module
 *               - entityType
 *               - steps
 *             properties:
 *               name:
 *                 type: string
 *                 description: Workflow name
 *               description:
 *                 type: string
 *                 description: Workflow description
 *               module:
 *                 type: string
 *                 enum: [PROCUREMENT, PAYROLL, EXPENSE]
 *                 description: Module this workflow applies to
 *               entityType:
 *                 type: string
 *                 enum: [PURCHASE_REQUISITION, PURCHASE_ORDER, INVOICE, EXPENSE]
 *                 description: Entity type this workflow applies to
 *               steps:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - stepNumber
 *                     - stepName
 *                     - stepType
 *                   properties:
 *                     stepNumber:
 *                       type: integer
 *                       description: Step number (must be sequential)
 *                     stepName:
 *                       type: string
 *                       description: Step name
 *                     stepType:
 *                       type: string
 *                       enum: [USER, ROLE, DEPARTMENT, AMOUNT_THRESHOLD]
 *                       description: Type of approver
 *                     userId:
 *                       type: string
 *                       description: User ID (required if stepType is USER)
 *                     roleId:
 *                       type: string
 *                       description: Role ID (required if stepType is ROLE)
 *                     departmentId:
 *                       type: string
 *                       description: Department ID (required if stepType is DEPARTMENT)
 *                     amountThreshold:
 *                       type: number
 *                       description: Amount threshold (required if stepType is AMOUNT_THRESHOLD)
 *                     isRequired:
 *                       type: boolean
 *                       default: true
 *                       description: Whether this step is required
 *                     canDelegate:
 *                       type: boolean
 *                       default: false
 *                       description: Whether approver can delegate
 *                     autoApprove:
 *                       type: boolean
 *                       default: false
 *                       description: Whether this step auto-approves
 *                     approvalOrder:
 *                       type: string
 *                       enum: [SEQUENTIAL, PARALLEL]
 *                       default: SEQUENTIAL
 *                       description: Approval order for this step
 *     responses:
 *       201:
 *         description: Approval workflow created successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post("/", ApprovalWorkflowController.createApprovalWorkflow);

/**
 * @swagger
 * /api/approval-workflows:
 *   get:
 *     summary: Get all approval workflows
 *     tags: [Approval Workflows]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: module
 *         schema:
 *           type: string
 *           enum: [PROCUREMENT, PAYROLL, EXPENSE]
 *         description: Filter by module
 *       - in: query
 *         name: entityType
 *         schema:
 *           type: string
 *           enum: [PURCHASE_REQUISITION, PURCHASE_ORDER, INVOICE, EXPENSE]
 *         description: Filter by entity type
 *     responses:
 *       200:
 *         description: Approval workflows retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get("/", ApprovalWorkflowController.getAllApprovalWorkflows);

/**
 * @swagger
 * /api/approval-workflows/{id}:
 *   get:
 *     summary: Get approval workflow by ID
 *     tags: [Approval Workflows]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Workflow ID
 *     responses:
 *       200:
 *         description: Approval workflow retrieved successfully
 *       404:
 *         description: Workflow not found
 *       401:
 *         description: Unauthorized
 */
router.get("/:id", ApprovalWorkflowController.getApprovalWorkflowById);

/**
 * @swagger
 * /api/approval-workflows/{module}/{entityType}:
 *   get:
 *     summary: Get workflow by module and entity type
 *     tags: [Approval Workflows]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: module
 *         required: true
 *         schema:
 *           type: string
 *           enum: [PROCUREMENT, PAYROLL, EXPENSE]
 *         description: Module name
 *       - in: path
 *         name: entityType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [PURCHASE_REQUISITION, PURCHASE_ORDER, INVOICE, EXPENSE]
 *         description: Entity type
 *     responses:
 *       200:
 *         description: Workflow retrieved successfully
 *       404:
 *         description: No active workflow found
 *       401:
 *         description: Unauthorized
 */
router.get("/:module/:entityType", ApprovalWorkflowController.getWorkflowByModuleAndEntity);

/**
 * @swagger
 * /api/approval-workflows/requests:
 *   post:
 *     summary: Create an approval request
 *     tags: [Approval Requests]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - workflowId
 *               - entityType
 *               - entityId
 *             properties:
 *               workflowId:
 *                 type: string
 *                 description: Workflow ID
 *               entityType:
 *                 type: string
 *                 description: Entity type
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
router.post("/requests", ApprovalWorkflowController.createApprovalRequest);

/**
 * @swagger
 * /api/approval-workflows/requests/my:
 *   get:
 *     summary: Get approval requests for current user
 *     tags: [Approval Requests]
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
router.get("/requests/my", ApprovalWorkflowController.getApprovalRequestsForUser);

/**
 * @swagger
 * /api/approval-workflows/requests/{requestId}/steps/{stepId}/approve:
 *   put:
 *     summary: Process an approval (approve/reject)
 *     tags: [Approval Requests]
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
 *         name: stepId
 *         required: true
 *         schema:
 *           type: string
 *         description: Step ID
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
router.put("/requests/:requestId/steps/:stepId/approve", ApprovalWorkflowController.processApproval);

export default router;
