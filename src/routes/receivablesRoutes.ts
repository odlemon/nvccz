// @ts-nocheck
/** /api/accounting/receivables — views the Receivables page needs that no other route gives:
 *  GET /unallocated: customer receipts (posted cashbook receipts from a customer) not yet fully allocated to invoices,
 *  with what is left to allocate. Mounted behind the Accounting access guard (reading: accounting readers). */
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { prisma } from "../utils/database";

const router = express.Router();
router.use(authenticate);
router.get("/unallocated", async (req: any, res: any) => {
  try {
    const receipts = await prisma.cashbookEntry.findMany({
      where: { type: "RECEIPT", counterpartyType: "CUSTOMER", status: "POSTED", customerId: { not: null } },
      select: { id: true, transactionDate: true, amount: true, reference: true, description: true, customerId: true, customer: { select: { id: true, name: true } }, bank: { select: { id: true, name: true, currency: { select: { code: true } } } }, allocations: { select: { allocatedAmount: true } } },
      orderBy: { transactionDate: "desc" },
      take: 500,
    });
    const rows = receipts
      .map((r) => {
        const allocated = r.allocations.reduce((t, a) => t + Number(a.allocatedAmount), 0);
        return { id: r.id, date: r.transactionDate, amount: Number(r.amount), allocated: Math.round(allocated * 100) / 100, unallocated: Math.round((Number(r.amount) - allocated) * 100) / 100, reference: r.reference, description: r.description, customer: r.customer, bank: r.bank ? { id: r.bank.id, name: r.bank.name, currency: r.bank.currency?.code || null } : null };
      })
      .filter((r) => r.unallocated > 0.005);
    res.json({ success: true, data: rows });
  } catch (e: any) {
    res.status(500).json({ success: false, message: e?.message || "Failed to list unallocated receipts" });
  }
});
export default router;
