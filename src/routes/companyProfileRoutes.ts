// @ts-nocheck
import express from "express";
import { CompanyProfileController } from "../controllers/CompanyProfileController";
import { CompanyProfileAddressController } from "../controllers/CompanyProfileAddressController";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/authenticate";
import multer from "multer";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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
 * /api/company-profile/logo:
 *   post:
 *     summary: Upload company logo
 *     description: Upload a logo image for the company profile (multipart/form-data). Returns the stored URL.
 *     tags: [Company Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [logo]
 *             properties:
 *               logo:
 *                 type: string
 *                 format: binary
 *                 description: Logo image file (png/jpg/webp, max 10MB)
 *     responses:
 *       200:
 *         description: Logo uploaded and saved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     logoUrl:
 *                       type: string
 *                       example: "http://31.220.82.129/uploads/application-documents/logo.png"
 */
router.post(
  "/logo",
  upload.single("logo"),
  CompanyProfileController.uploadCompanyLogo
);

/**
 * @swagger
 * /api/company-profile/addresses:
 *   get:
 *     summary: List all letterhead addresses
 *     description: Returns all addresses for the company profile, active address listed first.
 *     tags: [Company Profile]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Addresses retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/CompanyProfileAddress'
 */
router.get("/addresses", CompanyProfileAddressController.list);

/**
 * @swagger
 * /api/company-profile/addresses:
 *   post:
 *     summary: Create a letterhead address (with optional logo)
 *     description: |
 *       Creates a new company address used on letterheads/invoices. Accepts **multipart/form-data**
 *       so the logo can be uploaded alongside the address fields.
 *       If `isActive` is `true`, any previously active address is automatically deactivated.
 *       Only 1 address can be active at a time.
 *     tags: [Company Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [line1]
 *             properties:
 *               logo:
 *                 type: string
 *                 format: binary
 *                 description: Logo image (optional)
 *               label:
 *                 type: string
 *                 example: Head Office
 *               line1:
 *                 type: string
 *                 example: "123 Main Street"
 *               line2:
 *                 type: string
 *               city:
 *                 type: string
 *                 example: Harare
 *               state:
 *                 type: string
 *               postalCode:
 *                 type: string
 *               country:
 *                 type: string
 *               isActive:
 *                 type: string
 *                 enum: ["true", "false"]
 *                 example: "true"
 *     responses:
 *       201:
 *         description: Address created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/CompanyProfileAddress'
 */
router.post(
  "/addresses",
  upload.single("logo"),
  CompanyProfileAddressController.create
);

/**
 * @swagger
 * /api/company-profile/addresses/{id}:
 *   put:
 *     summary: Update a letterhead address (with optional new logo)
 *     description: |
 *       Updates an existing address. Accepts **multipart/form-data** — include the `logo` file
 *       only when you want to change the logo. Send only the fields you want to change.
 *       Setting `isActive` to `"true"` deactivates all other addresses.
 *     tags: [Company Profile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Address ID
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               logo:
 *                 type: string
 *                 format: binary
 *                 description: New logo image (optional)
 *               label:
 *                 type: string
 *               line1:
 *                 type: string
 *               line2:
 *                 type: string
 *               city:
 *                 type: string
 *               state:
 *                 type: string
 *               postalCode:
 *                 type: string
 *               country:
 *                 type: string
 *               isActive:
 *                 type: string
 *                 enum: ["true", "false"]
 *     responses:
 *       200:
 *         description: Address updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/CompanyProfileAddress'
 *       404:
 *         description: Address not found
 */
router.put("/addresses/:id", upload.single("logo"), CompanyProfileAddressController.update);

/**
 * @swagger
 * /api/company-profile/addresses/{id}/set-active:
 *   post:
 *     summary: Set an address as the active (letterhead) address
 *     description: Marks the specified address as active and deactivates all others. Only 1 can be active.
 *     tags: [Company Profile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Address ID
 *     responses:
 *       200:
 *         description: Active address updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/CompanyProfileAddress'
 *       404:
 *         description: Address not found
 */
router.post("/addresses/:id/set-active", CompanyProfileAddressController.setActive);

/**
 * @swagger
 * /api/company-profile/addresses/{id}:
 *   delete:
 *     summary: Delete a letterhead address
 *     tags: [Company Profile]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Address ID
 *     responses:
 *       200:
 *         description: Address deleted
 *       404:
 *         description: Address not found
 */
router.delete("/addresses/:id", CompanyProfileAddressController.remove);

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