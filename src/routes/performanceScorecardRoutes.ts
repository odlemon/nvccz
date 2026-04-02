// @ts-nocheck
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { PerformanceScorecardController } from "../controllers/PerformanceScorecardController";

const router = express.Router();

router.use(authenticate);

/**
 * @swagger
 * components:
 *   schemas:
 *     PerformanceScorecardPeriodRequest:
 *       type: object
 *       properties:
 *         periodStart:
 *           type: string
 *           format: date-time
 *         periodEnd:
 *           type: string
 *           format: date-time
 *         periodLabel:
 *           type: string
 *     PerformanceScorecardEnvelope:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *         data:
 *           type: object
 *           properties:
 *             scorecardType:
 *               type: string
 *             employee:
 *               type: object
 *               nullable: true
 *             department:
 *               type: string
 *               nullable: true
 *             goals:
 *               type: array
 *               items:
 *                 type: object
 *             sections:
 *               type: array
 *               items:
 *                 type: object
 *             scores:
 *               type: object
 *             warnings:
 *               type: array
 *               items:
 *                 type: string
 *             document:
 *               type: object
 *             savedRecord:
 *               type: object
 *               nullable: true
 *         timestamp:
 *           type: string
 *           format: date-time
 *     PerformanceOrgBscEnvelope:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         message:
 *           type: string
 *         data:
 *           type: object
 *           properties:
 *             reviewPeriod:
 *               type: string
 *             visionStatement:
 *               type: string
 *               nullable: true
 *             annualStrategyDocumentUrl:
 *               type: string
 *               nullable: true
 *             overallScore:
 *               type: number
 *             pillars:
 *               type: array
 *               items:
 *                 type: object
 *             access:
 *               type: object
 *               properties:
 *                 drillDownToDepartment:
 *                   type: boolean
 *                 drillDownToIndividual:
 *                   type: boolean
 *         timestamp:
 *           type: string
 *           format: date-time
 *     StandardErrorEnvelope:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         message:
 *           type: string
 *         error:
 *           type: string
 *           nullable: true
 *         timestamp:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/performance/scorecards/user:
 *   get:
 *     summary: Preview the current user's employee scorecard
 *     tags: [Performance Scorecards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: periodStart
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: periodEnd
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: periodLabel
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User scorecard retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PerformanceScorecardEnvelope'
 *       403:
 *         description: Access denied
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 */
router.get("/user", PerformanceScorecardController.getUserScorecard);

/**
 * @swagger
 * /api/performance/scorecards/employee/{employeeId}:
 *   get:
 *     summary: Preview an employee scorecard
 *     tags: [Performance Scorecards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: employeeId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: periodStart
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: periodEnd
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: periodLabel
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Employee scorecard retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PerformanceScorecardEnvelope'
 *       403:
 *         description: Access denied
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 *       404:
 *         description: Employee or contract not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 */
router.get("/employee/:employeeId", PerformanceScorecardController.getEmployeeScorecard);

/**
 * @swagger
 * /api/performance/scorecards/employee/{employeeId}/generate:
 *   post:
 *     summary: Persist an employee scorecard draft
 *     tags: [Performance Scorecards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: employeeId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PerformanceScorecardPeriodRequest'
 *     responses:
 *       201:
 *         description: Employee scorecard generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PerformanceScorecardEnvelope'
 *       403:
 *         description: Access denied
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 */
router.post("/employee/:employeeId/generate", PerformanceScorecardController.generateEmployeeScorecard);

/**
 * @swagger
 * /api/performance/scorecards/department/{department}:
 *   get:
 *     summary: Preview a department scorecard
 *     tags: [Performance Scorecards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: department
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: periodStart
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: periodEnd
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: periodLabel
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Department scorecard retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PerformanceScorecardEnvelope'
 *       403:
 *         description: Access denied
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 */
router.get("/department/:department", PerformanceScorecardController.getDepartmentScorecard);

/**
 * @swagger
 * /api/performance/scorecards/department/{department}/generate:
 *   post:
 *     summary: Persist a department scorecard draft
 *     tags: [Performance Scorecards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: department
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PerformanceScorecardPeriodRequest'
 *     responses:
 *       201:
 *         description: Department scorecard generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PerformanceScorecardEnvelope'
 *       403:
 *         description: Access denied
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 */
router.post("/department/:department/generate", PerformanceScorecardController.generateDepartmentScorecard);

/**
 * @swagger
 * /api/performance/scorecards/ceo:
 *   get:
 *     summary: Preview the CEO scorecard
 *     tags: [Performance Scorecards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: periodStart
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: periodEnd
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: periodLabel
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: CEO scorecard retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PerformanceScorecardEnvelope'
 *       403:
 *         description: Access denied
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 */
router.get("/ceo", PerformanceScorecardController.getCEOScorecard);

/**
 * @swagger
 * /api/performance/scorecards/ceo/generate:
 *   post:
 *     summary: Persist a CEO scorecard draft
 *     tags: [Performance Scorecards]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PerformanceScorecardPeriodRequest'
 *     responses:
 *       201:
 *         description: CEO scorecard generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PerformanceScorecardEnvelope'
 *       403:
 *         description: Access denied
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 */
router.post("/ceo/generate", PerformanceScorecardController.generateCEOScorecard);

/**
 * @swagger
 * /api/performance/scorecards/board:
 *   get:
 *     summary: Preview the Board scorecard
 *     tags: [Performance Scorecards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: periodStart
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: periodEnd
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: periodLabel
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Board scorecard retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PerformanceScorecardEnvelope'
 *       403:
 *         description: Access denied
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 */
router.get("/board", PerformanceScorecardController.getBoardScorecard);

/**
 * @swagger
 * /api/performance/scorecards/board/generate:
 *   post:
 *     summary: Persist a Board scorecard draft
 *     tags: [Performance Scorecards]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PerformanceScorecardPeriodRequest'
 *     responses:
 *       201:
 *         description: Board scorecard generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PerformanceScorecardEnvelope'
 *       403:
 *         description: Access denied
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 */
router.post("/board/generate", PerformanceScorecardController.generateBoardScorecard);

/**
 * @swagger
 * /api/performance/scorecards/org-bsc:
 *   get:
 *     summary: Get the live organisational Balanced Scorecard dashboard
 *     tags: [Performance Scorecards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: periodStart
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: periodEnd
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: periodLabel
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Organisational BSC dashboard retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PerformanceOrgBscEnvelope'
 *       403:
 *         description: Access denied
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 */
router.get("/org-bsc", PerformanceScorecardController.getOrgBSCDashboard);

/**
 * @swagger
 * /api/performance/scorecards/{scorecardId}/finalize:
 *   post:
 *     summary: Finalize and lock a generated scorecard
 *     tags: [Performance Scorecards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: scorecardId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Scorecard finalised successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PerformanceScorecardEnvelope'
 *       403:
 *         description: Access denied
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 *       404:
 *         description: Scorecard not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardErrorEnvelope'
 */
router.post("/:scorecardId/finalize", PerformanceScorecardController.finalizeScorecard);

export default router;
