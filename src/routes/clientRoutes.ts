// @ts-nocheck
import express from "express";
import { ClientController } from "../controllers/ClientController";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/permissionAuth";

const router = express.Router();

/**
 * @swagger
 * /api/clients:
 *   post:
 *     summary: Create a new client (investor) with optional investment commitment
 *     description: Create a new client who can invest in funds. Investment commitment is created automatically if fund details are provided.
 *     tags: [Client Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - investor_id
 *               - type
 *               - legal_name
 *               - email
 *               - country
 *             properties:
 *               investor_id:
 *                 type: string
 *                 description: External investor ID (e.g., "inv_001")
 *                 example: "inv_001"
 *               type:
 *                 type: string
 *                 enum: [individual, institutional]
 *                 description: Type of investor
 *                 example: "individual"
 *               legal_name:
 *                 type: string
 *                 description: Full legal name of the investor
 *                 example: "Jamie Patel"
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email address
 *                 example: "jamie@example.com"
 *               country:
 *                 type: string
 *                 description: Country of residence
 *                 example: "US"
 *               phone:
 *                 type: string
 *                 description: Phone number
 *                 example: "+1-555-123-4567"
 *               address:
 *                 type: string
 *                 description: Physical address
 *                 example: "123 Main St, New York, NY 10001"
 *               tax_id:
 *                 type: string
 *                 description: Tax identification number
 *                 example: "123-45-6789"
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, INACTIVE, SUSPENDED]
 *                 default: ACTIVE
 *                 description: Client status
 *               # Investment Commitment Fields (optional)
 *               fund_id:
 *                 type: string
 *                 description: Fund ID for investment commitment
 *                 example: "fund_abc123"
 *               amount:
 *                 type: number
 *                 description: Investment amount (required if fund_id provided)
 *                 example: 100000
 *               currency:
 *                 type: string
 *                 default: USD
 *                 description: Currency code
 *                 example: "USD"
 *               effective_date:
 *                 type: string
 *                 format: date
 *                 description: When the commitment becomes effective (required if fund_id provided)
 *                 example: "2025-09-03"
 *               e_sign:
 *                 type: object
 *                 description: Electronic signature data
 *                 properties:
 *                   signer_name:
 *                     type: string
 *                     example: "Jamie Patel"
 *                   signed_at:
 *                     type: string
 *                     format: date-time
 *                     example: "2025-09-03T14:20:45Z"
 *                   signature_id:
 *                     type: string
 *                     example: "sig_a1b2c3d4"
 *               notes:
 *                 type: string
 *                 description: Additional notes
 *     responses:
 *       201:
 *         description: Client created successfully with investment commitment
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
 *                   example: Client created successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     investorId:
 *                       type: string
 *                     type:
 *                       type: string
 *                     legalName:
 *                       type: string
 *                     email:
 *                       type: string
 *                     country:
 *                       type: string
 *                     status:
 *                       type: string
 *                     investmentCommitments:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           amount:
 *                             type: number
 *                           currency:
 *                             type: string
 *                           effectiveDate:
 *                             type: string
 *                             format: date-time
 *                           status:
 *                             type: string
 *                           fund:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                               name:
 *                                 type: string
 *                               description:
 *                                 type: string
 *                               status:
 *                                 type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad request - validation error
 *       401:
 *         description: Unauthorized
 *       409:
 *         description: Conflict - client already exists
 */
router.post("/", authenticate, authorize(["admin"]), ClientController.createClient);

/**
 * @swagger
 * /api/clients:
 *   get:
 *     summary: Get all clients with filtering
 *     description: Retrieve all clients with pagination and filtering options
 *     tags: [Client Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [individual, institutional]
 *         description: Filter by client type
 *       - in: query
 *         name: country
 *         schema:
 *           type: string
 *         description: Filter by country
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ACTIVE, INACTIVE, SUSPENDED]
 *         description: Filter by status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name, email, or investor ID
 *     responses:
 *       200:
 *         description: Clients retrieved successfully
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
 *                     clients:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           investorId:
 *                             type: string
 *                           type:
 *                             type: string
 *                           legalName:
 *                             type: string
 *                           email:
 *                             type: string
 *                           country:
 *                             type: string
 *                           status:
 *                             type: string
 *                           investmentCommitments:
 *                             type: array
 *                             items:
 *                               type: object
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 */
router.get("/", authenticate, authorize(["admin", "fund_manager"]), ClientController.getAllClients);

/**
 * @swagger
 * /api/clients/statistics:
 *   get:
 *     summary: Get client statistics
 *     description: Get comprehensive statistics about clients and their investments
 *     tags: [Client Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Client statistics retrieved successfully
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
 *                     totalClients:
 *                       type: integer
 *                     individualClients:
 *                       type: integer
 *                     institutionalClients:
 *                       type: integer
 *                     activeClients:
 *                       type: integer
 *                     totalCommitments:
 *                       type: integer
 *                     totalCommitmentAmount:
 *                       type: number
 */
router.get("/statistics", authenticate, authorize(["admin", "fund_manager"]), ClientController.getClientStatistics);

/**
 * @swagger
 * /api/clients/{id}:
 *   get:
 *     summary: Get client by ID
 *     description: Retrieve a specific client with their investment commitments
 *     tags: [Client Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Client ID
 *     responses:
 *       200:
 *         description: Client retrieved successfully
 *       404:
 *         description: Client not found
 */
router.get("/:id", authenticate, authorize(["admin", "fund_manager"]), ClientController.getClientById);

/**
 * @swagger
 * /api/clients/investor/{investorId}:
 *   get:
 *     summary: Get client by investor ID
 *     description: Retrieve a client by their external investor ID
 *     tags: [Client Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: investorId
 *         required: true
 *         schema:
 *           type: string
 *         description: External investor ID
 *     responses:
 *       200:
 *         description: Client retrieved successfully
 *       404:
 *         description: Client not found
 */
router.get("/investor/:investorId", authenticate, authorize(["admin", "fund_manager"]), ClientController.getClientByInvestorId);

/**
 * @swagger
 * /api/clients/{id}:
 *   put:
 *     summary: Update client details with optional investment commitment
 *     description: Update client information and optionally update/create investment commitment
 *     tags: [Client Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Client ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               investor_id:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [individual, institutional]
 *               legal_name:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               country:
 *                 type: string
 *               phone:
 *                 type: string
 *               address:
 *                 type: string
 *               tax_id:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, INACTIVE, SUSPENDED]
 *               # Investment Commitment Fields (optional)
 *               fund_id:
 *                 type: string
 *                 description: Fund ID for investment commitment
 *               amount:
 *                 type: number
 *                 description: Investment amount (required if fund_id provided)
 *               currency:
 *                 type: string
 *                 default: USD
 *                 description: Currency code
 *               effective_date:
 *                 type: string
 *                 format: date
 *                 description: When the commitment becomes effective (required if fund_id provided)
 *               e_sign:
 *                 type: object
 *                 description: Electronic signature data
 *               notes:
 *                 type: string
 *                 description: Additional notes
 *     responses:
 *       200:
 *         description: Client updated successfully
 *       404:
 *         description: Client not found
 *       409:
 *         description: Conflict - duplicate investor ID or email
 */
router.put("/:id", authenticate, authorize(["admin"]), ClientController.updateClient);

/**
 * @swagger
 * /api/clients/{id}:
 *   delete:
 *     summary: Delete client
 *     description: Delete a client (only if no active investment commitments)
 *     tags: [Client Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Client ID
 *     responses:
 *       200:
 *         description: Client deleted successfully
 *       404:
 *         description: Client not found
 *       400:
 *         description: Cannot delete client with active commitments
 */
router.delete("/:id", authenticate, authorize(["admin"]), ClientController.deleteClient);


export default router;
