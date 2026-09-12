// @ts-nocheck
/**
 * Smoke test: verify the new letterhead-aware PDF builders produce valid PDF buffers.
 *
 * Does NOT touch the database or send any email — purely asserts that the renderers compile
 * and emit at least the `%PDF` header, exercising:
 *   - drawLetterhead (with logoBuffer = null fallback)
 *   - buildInvoicePdfBuffer
 *   - buildProcurementInvoicePdfBuffer
 *   - buildVendorQuotationPdfBuffer (ACCEPTED watermark + REJECTED watermark)
 *   - buildPayslipPdfBuffer (regression — refactored to use the shared helper)
 */
import { buildInvoicePdfBuffer } from "../src/utils/invoicePdf";
import { buildProcurementInvoicePdfBuffer } from "../src/utils/procurementInvoicePdf";
import { buildVendorQuotationPdfBuffer } from "../src/utils/vendorQuotationPdf";
import { buildPayslipPdfBuffer } from "../src/utils/payslipPdf";

const fakeLetterhead = {
  displayName: "Smoke Test Co.",
  detailLines: ["1 Test Way", "Harare, Zimbabwe", "Tel: +263 0 000 0000"],
  logoUrlForEmail: null,
  logoBuffer: null,
};

function assertPdf(label: string, buf: Buffer) {
  if (!Buffer.isBuffer(buf) || buf.length < 100) {
    throw new Error(`${label}: invalid buffer (length ${buf?.length})`);
  }
  if (buf.toString("latin1", 0, 4) !== "%PDF") {
    throw new Error(`${label}: missing %PDF magic bytes (got ${JSON.stringify(buf.toString("latin1", 0, 8))})`);
  }
  console.log(`OK ${label} — ${buf.length} bytes`);
}

async function main() {
  const invoicePdf = await buildInvoicePdfBuffer({
    invoiceNumber: "INV-SMOKE-0001",
    transactionDate: new Date(),
    dueDate: new Date(Date.now() + 86400_000 * 7),
    description: "Smoke-test invoice",
    status: "SENT",
    currencyCode: "USD",
    amount: 1000,
    vatAmount: 150,
    totalAmount: 1150,
    paidAmount: 0,
    outstandingAmount: 1150,
    customer: { name: "Test Customer", email: "test@example.com" },
    items: [{ description: "Consulting", quantity: 10, unitPrice: 100, lineTotal: 1000 }],
    letterhead: fakeLetterhead,
  });
  assertPdf("sales invoice PDF", invoicePdf);

  const procPdf = await buildProcurementInvoicePdfBuffer({
    invoiceNumber: "PINV-SMOKE-0001",
    invoiceDate: new Date(),
    dueDate: new Date(Date.now() + 86400_000 * 30),
    status: "APPROVED",
    paymentStatus: "PENDING",
    currencyCode: "USD",
    subtotal: 500,
    taxAmount: 75,
    totalAmount: 575,
    poNumber: "PO-SMOKE-001",
    vendor: { name: "Test Vendor", email: "vendor@example.com" },
    items: [{ itemName: "Widget", quantity: 5, unitPrice: 100, totalPrice: 500 }],
    letterhead: fakeLetterhead,
  });
  assertPdf("procurement invoice PDF", procPdf);

  for (const decision of ["ACCEPTED", "REJECTED"] as const) {
    const quotePdf = await buildVendorQuotationPdfBuffer({
      quotationNumber: `QUO-SMOKE-${decision}`,
      rfqNumber: "RFQ-001",
      status: decision,
      submittedAt: new Date(),
      validUntil: new Date(Date.now() + 86400_000 * 30),
      reviewedAt: new Date(),
      reviewNotes: decision === "ACCEPTED" ? "Best value" : null,
      rejectionReason: decision === "REJECTED" ? "Higher than alternatives" : null,
      paymentTerms: "Net 30",
      deliveryTerms: "FOB",
      deliveryTime: "10 days",
      currencyCode: "USD",
      subtotal: 1000,
      taxAmount: 150,
      totalAmount: 1150,
      vendor: { name: "Smoke Vendor", email: "vendor@example.com", companyName: "Smoke Vendor LLC" },
      items: [{ itemName: "Service", quantity: 1, unitPrice: 1000, totalPrice: 1000 }],
      letterhead: fakeLetterhead,
      decision,
    });
    assertPdf(`vendor quotation PDF (${decision})`, quotePdf);
  }

  const payslipPdf = await buildPayslipPdfBuffer({
    payslipNumber: "PS-SMOKE-001",
    payPeriod: "January 2026",
    paymentDateLabel: "31 Jan 2026",
    currencyCode: "USD",
    employeeName: "Test Employee",
    employeeNumber: "EMP-001",
    employeeEmail: "emp@example.com",
    bankName: "Test Bank",
    bankAccountNumber: "1234567890",
    bankBranchCode: "ABC123",
    grossPay: 1500,
    totalDeductions: 300,
    netPay: 1200,
    basicSalary: 1500,
    allowances: [],
    deductions: [{ name: "Tax", amount: 300 }],
    letterhead: fakeLetterhead,
  });
  assertPdf("payslip PDF (regression after letterhead refactor)", payslipPdf);

  console.log("\nAll PDF letterhead smoke checks PASSED");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
