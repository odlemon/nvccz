// @ts-nocheck
import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/permissionAuth";
import { VatRateController } from "../controllers/VatRateController";

const router = Router();

router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: VAT Rates
 *   description: Manage VAT rates. Only one rate can be active at a time — the active rate is what all services use for VAT calculations.
 */

/**
 * @swagger
 * /api/accounting/vat-rates:
 *   get:
 *     summary: List all VAT rates
 *     description: Returns all VAT rates, active one first.
 *     tags: [VAT Rates]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of VAT rates
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
 *                     $ref: '#/components/schemas/VatRate'
 */
router.get("/", authorize(["admin", "finance_manager", "ceo"]), VatRateController.list);

/**
 * @swagger
 * /api/accounting/vat-rates/active:
 *   get:
 *     summary: Get the currently active VAT rate
 *     description: Returns the single active VAT rate used by all accounting services.
 *     tags: [VAT Rates]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Active VAT rate
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/VatRate'
 */
router.get("/active", authorize(["admin", "finance_manager", "ceo"]), VatRateController.getActive);

/**
 * @swagger
 * /api/accounting/vat-rates:
 *   post:
 *     summary: Create a new VAT rate
 *     description: |
 *       Creates a new VAT rate. If `isActive` is `true` and another rate is already active,
 *       the request will be **rejected with 409** — deactivate the current rate first.
 *       Only one rate can be active at any time.
 *     tags: [VAT Rates]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, rateDecimal]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Standard VAT 15%"
 *               rateDecimal:
 *                 type: number
 *                 description: Decimal multiplier between 0 and 1 (e.g. 0.15 = 15%, 0.155 = 15.5%)
 *                 example: 0.15
 *               isActive:
 *                 type: boolean
 *                 description: Set to true to make this the active rate (fails if another is active)
 *                 example: false
 *     responses:
 *       201:
 *         description: VAT rate created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/VatRate'
 *       409:
 *         description: Another VAT rate is already active
 */
router.post("/", authorize(["admin", "finance_manager", "ceo"]), VatRateController.create);

/**
 * @swagger
 * /api/accounting/vat-rates/{id}:
 *   put:
 *     summary: Update a VAT rate
 *     description: |
 *       Update the name or decimal rate. Setting `isActive` to `true` will fail with **409**
 *       if a different rate is already active — use the `/set-active` endpoint to switch.
 *     tags: [VAT Rates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: VAT rate ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Standard VAT 15%"
 *               rateDecimal:
 *                 type: number
 *                 example: 0.15
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: VAT rate updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/VatRate'
 *       404:
 *         description: VAT rate not found
 *       409:
 *         description: Another VAT rate is already active
 */
router.put("/:id", authorize(["admin", "finance_manager", "ceo"]), VatRateController.update);

/**
 * @swagger
 * /api/accounting/vat-rates/{id}/set-active:
 *   post:
 *     summary: Switch the active VAT rate
 *     description: |
 *       Marks this rate as active. Will **fail with 409** if a different rate is currently active —
 *       you must first deactivate the current one via `PUT /:id` with `isActive: false`.
 *     tags: [VAT Rates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: VAT rate ID to activate
 *     responses:
 *       200:
 *         description: Active VAT rate switched
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/VatRate'
 *       404:
 *         description: VAT rate not found
 *       409:
 *         description: Another VAT rate is already active — deactivate it first
 */
router.post("/:id/set-active", authorize(["admin", "finance_manager", "ceo"]), VatRateController.setActive);

/**
 * @swagger
 * /api/accounting/vat-rates/{id}:
 *   delete:
 *     summary: Delete a VAT rate
 *     description: Permanently deletes a VAT rate. The **active rate cannot be deleted** — deactivate it first.
 *     tags: [VAT Rates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: VAT rate ID
 *     responses:
 *       200:
 *         description: VAT rate deleted
 *       400:
 *         description: Cannot delete the active VAT rate
 *       404:
 *         description: VAT rate not found
 */
router.delete("/:id", authorize(["admin", "finance_manager", "ceo"]), VatRateController.remove);

export default router;

