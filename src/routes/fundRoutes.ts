//@ts-nocheck
import express from "express";
import { FundController } from "../controllers/FundController";
import { CapitalCallController } from "../controllers/CapitalCallController";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/permissionAuth";
import multer from "multer";

const router = express.Router();

const fundDocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

/**
 * @swagger
 * /funds:
 *   post:
 *     summary: Create a new fund
 *     description: Admin only. `createdById` is set from the authenticated user. Initial `remainingAmount` equals `totalAmount`.
 *     tags: [Fund Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateFundRequest'
 *           examples:
 *             sportsFund:
 *               summary: Large fund with wide LP ticket range
 *               value:
 *                 name: Sports Growth Fund I
 *                 description: Early-stage sports and media investments.
 *                 totalAmount: 50000000
 *                 minInvestment: 10000
 *                 maxInvestment: 10000000
 *                 focusIndustries: ['Sports', 'Media', 'Technology']
 *                 applicationStart: '2025-01-01T00:00:00.000Z'
 *                 applicationEnd: '2027-12-31T23:59:59.999Z'
 *                 status: OPEN
 *     responses:
 *       201:
 *         description: Fund created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   $ref: '#/components/schemas/Fund'
 *                 message: { type: string, example: 'Fund created successfully' }
 *       400:
 *         description: Validation or create error
 */
router.post("/", authenticate, authorize(["admin", "portfolio_mgr"]), FundController.createFund);

/**
 * @swagger
 * /funds:
 *   get:
 *     summary: List funds (paginated, filters)
 *     tags: [Fund Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [OPEN, CLOSED, COMING_SOON] }
 *       - in: query
 *         name: industry
 *         schema: { type: string }
 *       - in: query
 *         name: minAvailableBalance
 *         schema: { type: number }
 *       - in: query
 *         name: maxAvailableBalance
 *         schema: { type: number }
 *     responses:
 *       200:
 *         description: Funds retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     funds:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/Fund' }
 *                     total: { type: integer, example: 3 }
 *                     page: { type: integer, example: 1 }
 *                     totalPages: { type: integer, example: 1 }
 */
router.get("/", authenticate, authorize(["admin", "fund_manager", "portfolio_mgr", "inv_analyst"]), FundController.getAllFunds);

/**
 * @swagger
 * /funds/statistics:
 *   get:
 *     summary: Aggregate fund statistics
 *     tags: [Fund Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalFunds: { type: integer, example: 5 }
 *                     openFunds: { type: integer, example: 3 }
 *                     closedFunds: { type: integer, example: 1 }
 *                     comingSoonFunds: { type: integer, example: 1 }
 *                     totalAmount: { type: number, example: 120000000 }
 *                     totalRemainingAmount: { type: number, example: 45000000 }
 *                     totalDisbursedAmount: { type: number, example: 75000000 }
 */
router.get("/statistics", authenticate, authorize(["admin", "fund_manager", "portfolio_mgr", "inv_analyst"]), FundController.getFundStatistics);

/**
 * Capital calls (LP drawdowns) — see Swagger tag **Capital Calls (LP drawdowns)** for schemas.
 */
router.post("/:fundId/capital-calls", authenticate, CapitalCallController.initiate);
router.get("/:fundId/capital-calls", authenticate, CapitalCallController.list);
router.get("/:fundId/capital-calls/lp-summary", authenticate, CapitalCallController.lpSummary);
router.get(
  "/:fundId/capital-calls/:capitalCallId/allocations/:allocationId/notice",
  authenticate,
  CapitalCallController.getNoticeData
);
router.get("/:fundId/capital-calls/:capitalCallId", authenticate, CapitalCallController.getOne);
router.post("/:fundId/capital-calls/:capitalCallId/send-notices", authenticate, CapitalCallController.sendNotices);
router.get(
  "/:fundId/capital-calls/:capitalCallId/allocations/:allocationId/payments",
  authenticate,
  CapitalCallController.listAllocationPayments
);
router.post(
  "/:fundId/capital-calls/:capitalCallId/allocations/:allocationId/payments",
  authenticate,
  CapitalCallController.recordPayment
);

/**
 * @swagger
 * /funds/{fundId}:
 *   get:
 *     summary: Get fund by ID
 *     tags: [Fund Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fundId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Fund retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/Fund' }
 *       404:
 *         description: Fund not found
 */
router.get("/:fundId", authenticate, authorize(["admin", "fund_manager", "portfolio_mgr", "inv_analyst"]), FundController.getFundById);

/**
 * @swagger
 * /funds/{fundId}:
 *   put:
 *     summary: Update fund details
 *     description: Admin only. Optional fields. If `totalAmount` is increased, `remainingAmount` is scaled proportionally from prior total/remaining.
 *     tags: [Fund Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fundId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateFundRequest'
 *           examples:
 *             raiseMaxAndSize:
 *               summary: Raise max LP ticket and fund size
 *               value:
 *                 maxInvestment: 15000000
 *                 totalAmount: 75000000
 *             fullPatch:
 *               summary: Update several fields
 *               value:
 *                 name: Sports Growth Fund I (Updated)
 *                 minInvestment: 25000
 *                 maxInvestment: 12000000
 *                 status: OPEN
 *     responses:
 *       200:
 *         description: Fund updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/Fund' }
 *                 message: { type: string, example: 'Fund updated successfully' }
 *       400:
 *         description: Update error
 */
router.put("/:fundId", authenticate, authorize(["admin", "portfolio_mgr"]), FundController.updateFund);

/**
 * @swagger
 * /funds/{fundId}/performance-snapshots:
 *   get:
 *     summary: List a fund's recorded performance snapshots (NAV/called/distributed over time)
 *     tags: [Fund Management]
 */
router.get(
  "/:fundId/performance-snapshots",
  authenticate,
  authorize(["admin", "fund_manager", "portfolio_mgr", "inv_analyst"]),
  FundController.getPerformanceSnapshots
);

/**
 * @swagger
 * /funds/{fundId}/documents:
 *   get:
 *     summary: List a fund's documents
 *     tags: [Fund Management]
 *   post:
 *     summary: Upload a document to a fund
 *     tags: [Fund Management]
 */
router.get(
  "/:fundId/documents",
  authenticate,
  authorize(["admin", "fund_manager", "portfolio_mgr", "inv_analyst"]),
  FundController.listDocuments
);
router.post(
  "/:fundId/documents",
  authenticate,
  authorize(["admin", "fund_manager", "portfolio_mgr", "inv_analyst"]),
  fundDocumentUpload.single("file"),
  FundController.uploadDocument
);

/**
 * @swagger
 * /funds/{fundId}/close:
 *   post:
 *     summary: Close a fund
 *     tags: [Fund Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fundId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Fund closed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/Fund' }
 *                 message: { type: string, example: 'Fund closed successfully' }
 */
router.post("/:fundId/close", authenticate, authorize(["admin", "portfolio_mgr"]), FundController.closeFund);

/**
 * @swagger
 * /funds/industry/{industry}:
 *   get:
 *     summary: Get funds by industry focus
 *     tags: [Fund Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: industry
 *         required: true
 *         schema: { type: string }
 *         example: Technology
 *     responses:
 *       200:
 *         description: Funds retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Fund' }
 */
router.get("/industry/:industry", authenticate, authorize(["admin", "fund_manager", "portfolio_mgr", "inv_analyst"]), FundController.getFundsByIndustry);

/**
 * @swagger
 * /funds/status/{status}:
 *   get:
 *     summary: Get funds by status
 *     tags: [Fund Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: status
 *         required: true
 *         schema: { type: string, enum: [OPEN, CLOSED, COMING_SOON] }
 *     responses:
 *       200:
 *         description: Funds retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Fund' }
 */
router.get("/status/:status", authenticate, authorize(["admin", "fund_manager", "portfolio_mgr", "inv_analyst"]), FundController.getFundsByStatus);

/**
 * @swagger
 * /funds/balance/{minBalance}/{maxBalance}:
 *   get:
 *     summary: Get funds by available balance (remaining) range
 *     tags: [Fund Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: minBalance
 *         required: true
 *         schema: { type: number }
 *         example: 1000000
 *       - in: path
 *         name: maxBalance
 *         required: true
 *         schema: { type: number }
 *         example: 50000000
 *     responses:
 *       200:
 *         description: Funds retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Fund' }
 */
router.get(
  "/balance/:minBalance/:maxBalance",
  authenticate,
  authorize(["admin", "fund_manager", "portfolio_mgr", "inv_analyst"]),
  FundController.getFundsByAvailableBalance
);

export default router;
