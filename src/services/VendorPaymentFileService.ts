// @ts-nocheck
/**
 * Bank payment file for approved, unpaid procurement invoices.
 *
 * Each line is built from the VENDOR'S OWN banking details on record (account name, institution, account number,
 * branch, SWIFT/BIC, IBAN, currency), never a typed-in destination. A vendor that fails the vendor gate
 * (not Approved / non-compliant / blocked) or has no usable bank account is left OUT of the file and reported
 * with the reason, so the file can never instruct a payment the system would refuse.
 */
import { prisma } from "../utils/database";
import { VendorGateService } from "./VendorGateService";
import { VendorBankService } from "./VendorBankService";

const HEADER = [
  "Vendor Code",
  "Beneficiary Name",
  "Bank",
  "Branch Code",
  "Account Number",
  "SWIFT/BIC",
  "IBAN",
  "Currency",
  "Amount",
  "Reference",
  "Due Date",
];

function csvCell(v: any) {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export class VendorPaymentFileService {
  static async build(opts: { invoiceIds?: string[] } = {}) {
    const invoices = await prisma.procurementInvoice.findMany({
      where: {
        status: "APPROVED",
        paymentStatus: { not: "PAID" },
        ...(opts.invoiceIds?.length ? { id: { in: opts.invoiceIds } } : {}),
      },
      include: { vendor: true, currency: true },
      orderBy: [{ dueDate: "asc" }, { invoiceNumber: "asc" }],
    });

    const included: any[] = [];
    const excluded: Array<{ invoiceNumber: string; vendor: string; reasons: string[] }> = [];
    for (const inv of invoices) {
      const gate = await VendorGateService.evaluate(inv.vendorId, "PAY");
      if (!gate.ok) {
        excluded.push({ invoiceNumber: inv.invoiceNumber, vendor: inv.vendor?.name, reasons: gate.reasons });
        continue;
      }
      try {
        const bank = await VendorBankService.requirePayee(inv.vendorId, inv.currency?.code);
        included.push({
          invoiceId: inv.id,
          vendorCode: inv.vendor?.vendorCode || "",
          beneficiaryName: bank.accountName,
          bankName: bank.bankName,
          branchCode: bank.branchCode,
          accountNumber: bank.accountNumber,
          swiftCode: bank.swiftCode,
          iban: bank.iban || "",
          currency: bank.currencyCode || inv.currency?.code || "",
          amount: Number(inv.totalAmount).toFixed(2),
          reference: inv.invoiceNumber,
          dueDate: inv.dueDate ? new Date(inv.dueDate).toISOString().slice(0, 10) : "",
        });
      } catch (e: any) {
        excluded.push({ invoiceNumber: inv.invoiceNumber, vendor: inv.vendor?.name, reasons: [e.message] });
      }
    }
    const csv = [HEADER, ...included.map((r) => [r.vendorCode, r.beneficiaryName, r.bankName, r.branchCode, r.accountNumber, r.swiftCode, r.iban, r.currency, r.amount, r.reference, r.dueDate])]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n");
    return { included, excluded, csv };
  }
}
