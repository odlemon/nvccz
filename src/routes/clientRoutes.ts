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
 *     summary: "0a. Create LP (client) + optional fund commitment — prerequisite for capital calls"
 *     description: >
 *       **Capital calls need** at least one **ACTIVE** or **PENDING** `investment_commitment` on the fund (single currency across eligible commitments).
 *       Pass `fund_id`, `amount`, `effective_date` (and `currency`) to create the LP and a **PENDING** commitment in one step.
 *       Requires **admin** JWT. Body accepts **snake_case** (`legal_name`) or **camelCase** (`legalName`) per `ClientController`.
 *     tags: [Capital Calls (LP drawdowns), Client Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - legal_name
 *               - email
 *               - country
 *             properties:
 *               investor_id:
 *                 type: string
 *                 description: Optional external reference. If omitted, the server sets `inv-{uuid}`.
 *                 example: "EXT-LP-2026-0042"
 *               type:
 *                 type: string
 *                 enum: [individual, institutional]
 *                 description: Type of investor
 *                 example: "individual"
 *               legal_name:
 *                 type: string
 *                 description: Full legal name of the LP (notice emails use this)
 *                 example: "Jamie Patel"
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Unique; used for capital call notices
 *                 example: "jamie.patel.lp@example.com"
 *               country:
 *                 type: string
 *                 description: ISO country / jurisdiction (e.g. ZW, US)
 *                 example: "ZW"
 *               phone:
 *                 type: string
 *                 description: Phone number
 *                 example: "+263771234567"
 *               address:
 *                 type: string
 *                 description: Physical address
 *                 example: "15 Samora Machel Ave, Harare"
 *               tax_id:
 *                 type: string
 *                 description: Tax identification number
 *                 example: "63-1234567-Z"
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, INACTIVE, SUSPENDED]
 *                 default: ACTIVE
 *                 description: Client status
 *               fund_id:
 *                 type: string
 *                 description: Fund ID — when set with amount + effective_date, creates **PENDING** commitment (fund must be OPEN; amount within min/max and remaining)
 *                 example: "cmjfpk2g0000lktwmt25ni8p8"
 *               amount:
 *                 type: number
 *                 description: Commitment face amount (required when fund_id is set)
 *                 example: 50000
 *               currency:
 *                 type: string
 *                 default: USD
 *                 description: Commitment currency — all eligible commitments on a fund must share one code for a capital call
 *                 example: "USD"
 *               effective_date:
 *                 type: string
 *                 format: date
 *                 description: Commitment effective date (required when fund_id is set)
 *                 example: "2026-04-10"
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
 *           examples:
 *             lpWithZimFundCommitment:
 *               summary: New LP with 50k USD commitment (ZimFund)
 *               value:
 *                 type: "individual"
 *                 legal_name: "Jamie Patel"
 *                 email: "jamie.patel.lp@example.com"
 *                 country: "ZW"
 *                 phone: "+263771234567"
 *                 fund_id: "cmjfpk2g0000lktwmt25ni8p8"
 *                 amount: 50000
 *                 currency: "USD"
 *                 effective_date: "2026-04-10"
 *             lpOnlyNoCommitment:
 *               summary: LP only — add commitment later via PUT /api/clients/{id}
 *               value:
 *                 type: "individual"
 *                 legal_name: "Rudo Moyo"
 *                 email: "rudo.moyo.lp@example.com"
 *                 country: "ZW"
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
 *     summary: "0b. Add or update fund commitment on an existing LP — prerequisite for capital calls"
 *     description: >
 *       Use when the client already exists without a commitment for this fund. Sending `fund_id`, `amount`,
 *       and `effective_date` **creates** a new **PENDING** commitment (or updates if same client+fund already exists).
 *       Requires **admin** JWT.
 *     tags: [Capital Calls (LP drawdowns), Client Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           example: "cmnsk42b50000unukxntnpkov"
 *         description: Client primary key (`data.id` from POST /api/clients)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               investor_id:
 *                 type: string
 *                 example: "EXT-LP-2026-0042"
 *               type:
 *                 type: string
 *                 enum: [individual, institutional]
 *               legal_name:
 *                 type: string
 *                 example: "Jamie Patel"
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "jamie.patel.lp@example.com"
 *               country:
 *                 type: string
 *                 example: "ZW"
 *               phone:
 *                 type: string
 *                 example: "+263771234567"
 *               address:
 *                 type: string
 *               tax_id:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, INACTIVE, SUSPENDED]
 *               fund_id:
 *                 type: string
 *                 description: Target fund for the commitment
 *                 example: "cmjfpk2g0000lktwmt25ni8p8"
 *               amount:
 *                 type: number
 *                 description: Required when fund_id is set
 *                 example: 50000
 *               currency:
 *                 type: string
 *                 default: USD
 *                 example: "USD"
 *               effective_date:
 *                 type: string
 *                 format: date
 *                 example: "2026-04-10"
 *               e_sign:
 *                 type: object
 *                 description: Electronic signature data
 *               notes:
 *                 type: string
 *                 description: Additional notes
 *           examples:
 *             addCommitmentToExistingLp:
 *               summary: Add ZimFund commitment to existing client
 *               value:
 *                 fund_id: "cmjfpk2g0000lktwmt25ni8p8"
 *                 amount: 50000
 *                 currency: "USD"
 *                 effective_date: "2026-04-10"
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
