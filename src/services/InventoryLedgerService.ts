// @ts-nocheck
/**
 * Perpetual inventory (SRD ACC-INV-02/03/05/07): every stock movement changes the quantity, the item's moving weighted
 * average cost and the ledger together, in one transaction, so the stock sub-ledger and the inventory account agree.
 *
 *   IN          receipt at its cost          Dr inventory account   Cr the account it came from (payable, bank, opening)
 *   OUT         issue at the average cost    Dr the account it is used for (cost of sales, an expense)   Cr inventory
 *   ADJUSTMENT  count difference (±) at the average cost   Dr/Cr inventory against a variance account
 *
 * The journal is posted with the movement (a stock movement is a fact, like a sales invoice's cost of sales) and is
 * referenced STK-<movement id>; it is corrected by another movement, never voided on its own. Weighted average, not FIFO
 * (decision D21). Amounts are in the base currency.
 */
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../utils/database";
import { assignNextAuditIdAndCreateJournal } from "./AuditTrailSequenceService";
import AuditService from "./AuditService";
import { NegativeStockConfirmationRequiredError } from "../errors/InventoryErrors";

const r2 = (x: number) => Math.round(x * 100) / 100;
const r4 = (x: number) => Math.round(x * 10000) / 10000;
const fail = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });

export type MoveStockParams = {
  itemId: string;
  movementType: "IN" | "OUT" | "ADJUSTMENT";
  /** IN / OUT: a positive quantity. ADJUSTMENT: the signed difference (+ found, − missing). */
  quantity: number;
  /** IN only: the unit cost received at. */
  unitCost?: number;
  /** The other side of the journal. Required unless skipJournal. */
  contraAccountId?: string | null;
  reference?: string | null;
  description?: string | null;
  createdById: string;
  acknowledgeNegativeStock?: boolean;
  /** The caller posts its own journal (a sales invoice's cost of sales). */
  skipJournal?: boolean;
};

async function tenantToday(): Promise<Date> {
  const { default: FiscalCalendarService } = await import("./FiscalCalendarService");
  const tz = await FiscalCalendarService.getFiscalTimezone().catch(() => "Africa/Harare");
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return new Date(`${day}T12:00:00Z`);
}

async function baseCurrencyId(): Promise<string> {
  const c = (await prisma.currency.findFirst({ where: { isDefault: true }, select: { id: true } })) || (await prisma.currency.findFirst({ where: { code: "USD" }, select: { id: true } }));
  if (!c) throw fail("No base currency is set.");
  return c.id;
}

export class InventoryLedgerService {
  static tenantToday = tenantToday;
  static baseCurrencyId = baseCurrencyId;

  static async moveStock(p: MoveStockParams) {
    const qty = Number(p.quantity);
    if (!Number.isFinite(qty) || qty === 0) throw fail("Give a quantity.");
    if (p.movementType !== "ADJUSTMENT" && qty < 0) throw fail("The quantity must be positive.");
    if (!["IN", "OUT", "ADJUSTMENT"].includes(p.movementType)) throw fail("A movement is a receipt (IN), an issue (OUT) or a count adjustment.");
    const item = await prisma.inventoryItem.findUnique({ where: { id: p.itemId } });
    if (!item) throw fail("Inventory item not found", 404);
    if (item.isActive === false) throw fail(`${item.itemName} is switched off.`);
    let unitIn = 0;
    if (p.movementType === "IN") {
      unitIn = Number(p.unitCost);
      if (!(unitIn > 0)) throw fail("Give the unit cost received at.");
    }
    let contra = null;
    if (!p.skipJournal) {
      if (!p.contraAccountId) throw fail(p.movementType === "IN" ? "Choose the account the stock came from (payable, bank or opening balance)." : p.movementType === "OUT" ? "Choose the account the stock is used for (cost of sales or an expense)." : "Choose the account the count difference goes to.");
      contra = await prisma.chartOfAccounts.findUnique({ where: { id: p.contraAccountId }, select: { id: true, accountNo: true, accountName: true, isActive: true } });
      if (!contra) throw fail("That account was not found.");
      if (contra.isActive === false) throw fail(`${contra.accountNo} ${contra.accountName} is switched off.`);
      if (contra.id === item.inventoryAssetAccountId) throw fail("The other side cannot be the inventory account itself.");
      if (contra.accountNo === "1000") throw fail("1000 is a reporting bucket; choose a specific account.");
    }
    const settings = await (await import("./InventoryService")).InventoryService.getInventorySettings();
    const date = await tenantToday();
    const currencyId = p.skipJournal ? null : await baseCurrencyId();

    const result = await prisma.$transaction(async (tx) => {
      // re-read inside the transaction: the quantity and average are what this movement changes
      const cur = await tx.inventoryItem.findUnique({ where: { id: p.itemId } });
      const onHand = Number(cur.quantityOnHand), avg = Number(cur.costOfPurchase);
      const delta = p.movementType === "IN" ? qty : p.movementType === "OUT" ? -qty : qty;
      const after = r4(onHand + delta);
      if (after < 0) {
        if (!settings.allowNegativeStock) throw fail(`Not enough ${cur.itemName} (SKU ${cur.skuNumber}): ${onHand} on hand, ${Math.abs(delta)} requested.`, 409);
        if (!p.acknowledgeNegativeStock) throw new NegativeStockConfirmationRequiredError([{ itemId: cur.id, itemName: cur.itemName, skuNumber: cur.skuNumber, quantityOnHand: onHand, quantityRequested: Math.abs(delta), shortfall: Math.abs(delta) - onHand, projectedQuantityAfterSale: after }]);
      }
      // receipts move the average; everything else leaves at it
      const unit = p.movementType === "IN" ? unitIn : avg;
      const newAvg = p.movementType === "IN" ? (after > 0 && onHand > 0 ? r4((onHand * avg + qty * unitIn) / after) : unitIn) : avg;
      const value = r2(Math.abs(delta) * unit);
      if (p.movementType !== "IN" && !(avg > 0) && !p.skipJournal) throw fail(`${cur.itemName} has no cost yet; receive it first.`);
      const movement = await tx.stockMovement.create({
        data: {
          itemId: cur.id, movementType: p.movementType,
          quantity: new Decimal(p.movementType === "ADJUSTMENT" ? delta : qty),
          unitCost: new Decimal(unit), totalCost: new Decimal(delta < 0 ? -value : value),
          reference: p.reference || null, description: p.description || null, createdById: p.createdById,
        },
      });
      await tx.inventoryItem.update({ where: { id: cur.id }, data: { quantityOnHand: new Decimal(after), costOfPurchase: new Decimal(newAvg) } });
      let journal = null;
      if (!p.skipJournal && value > 0) {
        const intoStock = delta > 0;
        journal = await assignNextAuditIdAndCreateJournal(tx, {
          transactionDate: date, referenceNumber: `STK-${movement.id}`, currencyId, status: "POSTED", createdById: p.createdById, totalAmount: new Decimal(value),
          description: `${p.movementType === "IN" ? "Stock received" : p.movementType === "OUT" ? "Stock issued" : "Stock count adjustment"}: ${Math.abs(delta)} × ${cur.itemName} (${cur.skuNumber})${p.reference ? ` · ${p.reference}` : ""}`,
        }, { source: "API" });
        const inv = { chartOfAccountId: cur.inventoryAssetAccountId, description: `${cur.skuNumber} ${cur.itemName}` };
        const other = { chartOfAccountId: contra.id, description: p.description || `${cur.skuNumber} ${cur.itemName}` };
        await tx.journalEntryLine.createMany({
          data: [
            { journalEntryId: journal.id, ...(intoStock ? inv : other), debitAmount: new Decimal(value), creditAmount: new Decimal(0) },
            { journalEntryId: journal.id, ...(intoStock ? other : inv), debitAmount: new Decimal(0), creditAmount: new Decimal(value) },
          ],
        });
      }
      return { movement, journal, onHand: after, averageCost: newAvg, value };
    }, { maxWait: 10_000, timeout: 30_000 });

    await AuditService.log({ userId: p.createdById, action: "CREATE", entityType: "StockMovement", entityId: result.movement.id, newValues: { item: item.skuNumber, movementType: p.movementType, quantity: qty, unitCost: Number(result.movement.unitCost), value: result.value, onHandAfter: result.onHand, averageCostAfter: result.averageCost, journal: result.journal?.referenceNumber || null, reason: p.description || null } }).catch(() => null);
    return result;
  }

  /** Ledger against stock: each inventory account's balance beside the value of the items that post to it. */
  static async tieOut() {
    const items = await prisma.inventoryItem.findMany({ where: { isActive: true }, select: { quantityOnHand: true, costOfPurchase: true, inventoryAssetAccountId: true, inventoryAssetAccount: { select: { accountNo: true, accountName: true } } } });
    const byAcc = new Map();
    for (const i of items) {
      const k = i.inventoryAssetAccountId;
      const r = byAcc.get(k) || { accountId: k, account: i.inventoryAssetAccount ? `${i.inventoryAssetAccount.accountNo} ${i.inventoryAssetAccount.accountName}` : k, stockValue: 0, items: 0 };
      r.stockValue = r2(r.stockValue + Number(i.quantityOnHand) * Number(i.costOfPurchase)); r.items++;
      byAcc.set(k, r);
    }
    const { buildJournalEntryWhereForGlReporting } = await import("../utils/journalEntryReportingFilter");
    const rows = [];
    for (const r of byAcc.values()) {
      const agg = await prisma.journalEntryLine.aggregate({ where: { chartOfAccountId: r.accountId, journalEntry: buildJournalEntryWhereForGlReporting({ lte: new Date(Date.now() + 366 * 86400000) }) }, _sum: { debitAmount: true, creditAmount: true } });
      const ledger = r2(Number(agg._sum.debitAmount || 0) - Number(agg._sum.creditAmount || 0));
      rows.push({ ...r, ledgerBalance: ledger, difference: r2(ledger - r.stockValue) });
    }
    return rows;
  }

  /** Opening + receipts − issues ± adjustments = closing, by value and quantity, for a date range (tenant days). */
  static async rollForward(from: string, to: string) {
    const start = new Date(`${from}T00:00:00+02:00`), end = new Date(`${to}T23:59:59.999+02:00`);
    const items = await prisma.inventoryItem.findMany({ select: { id: true, skuNumber: true, itemName: true, unitOfMeasure: true, isActive: true } });
    const mv = await prisma.stockMovement.findMany({ where: { createdAt: { lte: end } }, select: { itemId: true, movementType: true, quantity: true, totalCost: true, createdAt: true } });
    const signedQty = (m) => (m.movementType === "OUT" ? -Math.abs(Number(m.quantity)) : m.movementType === "IN" ? Math.abs(Number(m.quantity)) : Number(m.quantity));
    const signedVal = (m) => (m.movementType === "OUT" ? -Math.abs(Number(m.totalCost)) : m.movementType === "IN" ? Math.abs(Number(m.totalCost)) : Number(m.totalCost));
    const rows = items.map((i) => {
      const mine = mv.filter((m) => m.itemId === i.id);
      const before = mine.filter((m) => m.createdAt < start), within = mine.filter((m) => m.createdAt >= start);
      const sum = (arr, f) => r2(arr.reduce((s, m) => s + f(m), 0));
      const t = (type) => within.filter((m) => m.movementType === type);
      const r = {
        itemId: i.id, sku: i.skuNumber, name: i.itemName, unit: i.unitOfMeasure,
        opening: { qty: sum(before, signedQty), value: sum(before, signedVal) },
        receipts: { qty: sum(t("IN"), signedQty), value: sum(t("IN"), signedVal) },
        issues: { qty: sum(t("OUT"), signedQty), value: sum(t("OUT"), signedVal) },
        adjustments: { qty: sum(t("ADJUSTMENT"), signedQty), value: sum(t("ADJUSTMENT"), signedVal) },
      };
      r.closing = { qty: r2(r.opening.qty + r.receipts.qty + r.issues.qty + r.adjustments.qty), value: r2(r.opening.value + r.receipts.value + r.issues.value + r.adjustments.value) };
      return r;
    }).filter((r) => r.opening.qty || r.receipts.qty || r.issues.qty || r.adjustments.qty || r.closing.qty);
    return { from, to, rows };
  }
}

export default InventoryLedgerService;
