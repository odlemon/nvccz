// @ts-nocheck
import { Router } from "express";
import { PayrollDashboardController } from "../controllers/PayrollDashboardController";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/permissionAuth";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Dashboards
 *   description: Dashboard endpoints for comprehensive data visualization - Accounting, Payroll, Performance, and Portfolio Management dashboards with filtering capabilities
 */

/**
 * @swagger
 * /payroll/dashboard:
 *   get:
 *     summary: Get payroll dashboard data
 *     description: Returns comprehensive payroll dashboard data including key metrics, monthly trends, department distribution, and payroll list
 *     tags: [Dashboards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 12
 *         description: Month number (1-12). Defaults to current month.
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *         description: Year. Defaults to current year.
 *       - in: query
 *         name: currencyId
 *         schema:
 *           type: string
 *         description: Currency ID filter
 *     responses:
 *       200:
 *         description: Dashboard data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Payroll dashboard data retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     alert:
 *                       type: object
 *                       properties:
 *                         message:
 *                           type: string
 *                           example: "Heads up! Payroll is due in 3 days. Please ensure all employee data, attendance logs, and bonuses are finalized before April 17, 2025 to avoid delays in payment processing."
 *                         dueDate:
 *                           type: string
 *                           format: date-time
 *                         daysUntilDue:
 *                           type: number
 *                           example: 3
 *                         showAlert:
 *                           type: boolean
 *                           example: true
 *                     metrics:
 *                       type: object
 *                       properties:
 *                         totalPayrollThisMonth:
 *                           type: object
 *                           properties:
 *                             value:
 *                               type: number
 *                               example: 273500
 *                             change:
 *                               type: number
 *                               example: 25000
 *                             changePercent:
 *                               type: number
 *                               example: 8.2
 *                         totalEmployeesPaid:
 *                           type: object
 *                           properties:
 *                             value:
 *                               type: number
 *                               example: 134
 *                             change:
 *                               type: number
 *                               example: 3
 *                         averageSalary:
 *                           type: object
 *                           properties:
 *                             value:
 *                               type: number
 *                               example: 3632
 *                             change:
 *                               type: number
 *                               example: 94
 *                     monthlyTrend:
 *                       type: array
 *                       description: Last 6 months of payroll data for chart visualization
 *                       items:
 *                         type: object
 *                         properties:
 *                           month:
 *                             type: string
 *                             example: "Oct"
 *                           monthNumber:
 *                             type: number
 *                             example: 10
 *                           year:
 *                             type: number
 *                             example: 2024
 *                           totalPayroll:
 *                             type: number
 *                           employeeCount:
 *                             type: number
 *                           averageSalary:
 *                             type: number
 *                     departmentDistribution:
 *                       type: array
 *                       description: Payroll breakdown by department showing salary and bonus
 *                       items:
 *                         type: object
 *                         properties:
 *                           department:
 *                             type: string
 *                             example: "IT"
 *                           salary:
 *                             type: number
 *                             example: 50000
 *                           bonus:
 *                             type: number
 *                             example: 5000
 *                           total:
 *                             type: number
 *                             example: 55000
 *                           employeeCount:
 *                             type: number
 *                             example: 15
 *                     payrollList:
 *                       type: array
 *                       description: List of all payroll entries with employee details
 *                       items:
 *                         type: object
 *                         properties:
 *                           employeeId:
 *                             type: string
 *                           name:
 *                             type: string
 *                             example: "John Doe"
 *                           pictureUrl:
 *                             type: string
 *                             nullable: true
 *                           department:
 *                             type: string
 *                             example: "Marketing"
 *                           payDate:
 *                             type: string
 *                             format: date-time
 *                           status:
 *                             type: string
 *                             enum: [Paid, Pending, Draft]
 *                             example: "Paid"
 *                           baseSalary:
 *                             type: number
 *                             example: 4000
 *                           bonuses:
 *                             type: number
 *                             example: 500
 *                           totalSalary:
 *                             type: number
 *                             example: 4500
 *                           payrollRunId:
 *                             type: string
 *                     period:
 *                       type: object
 *                       properties:
 *                         currentMonth:
 *                           type: number
 *                         currentYear:
 *                           type: number
 *                         startDate:
 *                           type: string
 *                           format: date-time
 *                         endDate:
 *                           type: string
 *                           format: date-time
 *                     generatedAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Failed to get payroll dashboard"
 *                 details:
 *                   type: string
 */
router.get(
  "/",
  authenticate,
  authorize(["admin", "hr_manager", "payroll_manager", "finance_manager"]),
  PayrollDashboardController.getDashboard
);

export default router;
