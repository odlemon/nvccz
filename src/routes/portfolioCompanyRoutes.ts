// @ts-nocheck
import express from "express";
import { PortfolioCompanyController } from "../controllers/PortfolioCompanyController";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/permissionAuth";

const router = express.Router();

/**
 * @swagger
 * /api/portfolio-companies:
 *   post:
 *     summary: Create a new portfolio company with user account
 *     tags: [Portfolio Companies]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - firstName
 *               - lastName
 *               - email
 *               - password
 *               - name
 *               - registrationNumber
 *               - industry
 *               - foundingDate
 *               - address
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 6
 *               name:
 *                 type: string
 *               registrationNumber:
 *                 type: string
 *               industry:
 *                 type: string
 *               foundingDate:
 *                 type: string
 *                 format: date
 *               address:
 *                 type: string
 *               website:
 *                 type: string
 *                 format: uri
 *               description:
 *                 type: string
 *               logoUrl:
 *                 type: string
 *                 format: uri
 *     responses:
 *       201:
 *         description: Portfolio company created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/PortfolioCompany'
 */
router.post("/", PortfolioCompanyController.createPortfolioCompany);

/**
 * @swagger
 * /api/portfolio-companies:
 *   get:
 *     summary: Get all portfolio companies
 *     tags: [Portfolio Companies]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of portfolio companies
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PortfolioCompany'
 */
router.get("/", authenticate, authorize(["admin"]), PortfolioCompanyController.getAllPortfolioCompanies);

/**
 * @swagger
 * /api/portfolio-companies/{id}:
 *   get:
 *     summary: Get portfolio company by ID
 *     tags: [Portfolio Companies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Portfolio company details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/PortfolioCompany'
 */
router.get("/:id", authenticate, authorize(["admin", "applicant"]), PortfolioCompanyController.getPortfolioCompanyById);

/**
 * @swagger
 * /api/portfolio-companies/user/{user_id}:
 *   get:
 *     summary: Get portfolio company by user ID
 *     tags: [Portfolio Companies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: user_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Portfolio company details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/PortfolioCompany'
 */
router.get("/user/:user_id", authenticate, authorize(["admin", "applicant"]), PortfolioCompanyController.getPortfolioCompanyByUserId);

/**
 * @swagger
 * /api/portfolio-companies/me:
 *   get:
 *     summary: Get current user's portfolio company
 *     tags: [Portfolio Companies]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current user's portfolio company details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/PortfolioCompany'
 */
router.get("/me", authenticate, authorize(["applicant"]), PortfolioCompanyController.getCurrentUserPortfolioCompany);

/**
 * @swagger
 * /api/portfolio-companies/{id}:
 *   put:
 *     summary: Update portfolio company details
 *     tags: [Portfolio Companies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               industry:
 *                 type: string
 *               foundingDate:
 *                 type: string
 *                 format: date
 *               address:
 *                 type: string
 *               website:
 *                 type: string
 *                 format: uri
 *               description:
 *                 type: string
 *               logoUrl:
 *                 type: string
 *                 format: uri
 *     responses:
 *       200:
 *         description: Portfolio company updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/PortfolioCompany'
 */
router.put("/:id", authenticate, authorize(["admin", "applicant"]), PortfolioCompanyController.updatePortfolioCompany);

/**
 * @swagger
 * /api/portfolio-companies/me:
 *   put:
 *     summary: Update current user's portfolio company
 *     tags: [Portfolio Companies]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               industry:
 *                 type: string
 *               foundingDate:
 *                 type: string
 *                 format: date
 *               address:
 *                 type: string
 *               website:
 *                 type: string
 *                 format: uri
 *               description:
 *                 type: string
 *               logoUrl:
 *                 type: string
 *                 format: uri
 *               status:
 *                 type: string
 *                 enum: ['PENDING', 'APPROVED', 'REJECTED', 'ACTIVE', 'SUSPENDED']
 *               companySize:
 *                 type: string
 *                 enum: ['SMALL', 'MEDIUM', 'LARGE']
 *               employeeCount:
 *                 type: integer
 *               annualRevenue:
 *                 type: number
 *               fundingStage:
 *                 type: string
 *                 enum: ['SEED', 'SERIES_A', 'SERIES_B', 'SERIES_C', 'LATE_STAGE']
 *               contactPerson:
 *                 type: string
 *               contactPhone:
 *                 type: string
 *               contactEmail:
 *                 type: string
 *               socialMedia:
 *                 type: object
 *     responses:
 *       200:
 *         description: Portfolio company updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/PortfolioCompany'
 */
router.put("/me", authenticate, authorize(["applicant"]), PortfolioCompanyController.updateCurrentUserPortfolioCompany);

/**
 * @swagger
 * /api/portfolio-companies/{id}:
 *   delete:
 *     summary: Delete portfolio company
 *     tags: [Portfolio Companies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Portfolio company deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 */
router.delete("/:id", authenticate, authorize(["admin"]), PortfolioCompanyController.deletePortfolioCompany);

export default router;
