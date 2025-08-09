// @ts-nocheck
import express from "express";
import { CompanyProfileController } from "../controllers/CompanyProfileController";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/authenticate";

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/company-profile:
 *   post:
 *     summary: Create company profile
 *     description: Create a new company profile with social media URLs (Admin only)
 *     tags: [Company Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateCompanyProfileRequest'
 *     responses:
 *       201:
 *         description: Company profile created successfully
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
 *                   example: Company profile created successfully
 *                 data:
 *                   $ref: '#/components/schemas/CompanyProfile'
 *       400:
 *         description: Bad request - company profile already exists
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - insufficient permissions
 */
router.post("/", authorize(["admin"]), CompanyProfileController.createCompanyProfile);

/**
 * @swagger
 * /api/company-profile:
 *   get:
 *     summary: Get company profile
 *     description: Retrieve the company profile with social media URLs
 *     tags: [Company Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Company profile retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/CompanyProfile'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Company profile not found
 */
router.get("/", CompanyProfileController.getCompanyProfile);

/**
 * @swagger
 * /api/company-profile:
 *   put:
 *     summary: Update company profile
 *     description: Update the company profile with social media URLs (Admin only)
 *     tags: [Company Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateCompanyProfileRequest'
 *     responses:
 *       200:
 *         description: Company profile updated successfully
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
 *                   example: Company profile updated successfully
 *                 data:
 *                   $ref: '#/components/schemas/CompanyProfile'
 *       400:
 *         description: Bad request - company profile not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - insufficient permissions
 */
router.put("/", authorize(["admin"]), CompanyProfileController.updateCompanyProfile);

/**
 * @swagger
 * /api/company-profile:
 *   delete:
 *     summary: Delete company profile
 *     description: Delete the company profile (Admin only)
 *     tags: [Company Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Company profile deleted successfully
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
 *                   example: Company profile deleted successfully
 *       400:
 *         description: Bad request - company profile not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - insufficient permissions
 */
router.delete("/", authorize(["admin"]), CompanyProfileController.deleteCompanyProfile);

/**
 * @swagger
 * /api/company-profile/upsert:
 *   post:
 *     summary: Create or update company profile
 *     description: Create a new company profile or update existing one (Admin only)
 *     tags: [Company Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateCompanyProfileRequest'
 *     responses:
 *       200:
 *         description: Company profile created or updated successfully
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
 *                   example: Company profile created successfully
 *                 data:
 *                   $ref: '#/components/schemas/CompanyProfile'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - insufficient permissions
 */
router.post("/upsert", authorize(["admin"]), CompanyProfileController.createOrUpdateCompanyProfile);

export default router; 