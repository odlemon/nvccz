// @ts-nocheck
/**
 * VAT Audit Trail – Click on VAT Output total → line-by-line list of every invoice that contributed
 *
 * Requirement: Click on the VAT Output total in the VAT Return report.
 * Expected: System displays a line-by-line list of every invoice that contributed to that specific tax liability.
 *
 * Run: npx ts-node scripts/test-vat-output-audit-trail.ts
 * (Test data is left in place; no cleanup.)
 */
import VATReportService from "../src/services/VATReportService";

const failures: string[] = [];
const TOLERANCE = 0.01;

function assert(condition: boolean, msg: string) {
  if (!condition) failures.push(msg);
}

async function main() {
  console.log("=== VAT Output audit trail test (line-by-line list for VAT Output total) ===\n");

  // Use a period that may have VAT data (e.g. full year 2025)
  const startDate = new Date(2024, 0, 1, 0, 0, 0, 0);
  const endDate = new Date(2025, 11, 31, 23, 59, 59, 999);

  const report = await VATReportService.generateVATReport({
    startDate,
    endDate
  });

  const auditTrail = await VATReportService.getVATOutputAuditTrail({
    startDate,
    endDate
  });

  console.log("VAT Report summary:");
  console.log("  Output Tax total:", report.summary.totalOutputTax.toFixed(2));
  console.log("  Output Tax transaction count:", report.outputTax.transactionCount);
  console.log("\nVAT Output audit trail (drill-down):");
  console.log("  totalOutputTax:", auditTrail.totalOutputTax.toFixed(2));
  console.log("  lines count:", auditTrail.lines.length);

  assert(Array.isArray(auditTrail.lines), "Audit trail must return a 'lines' array");
  assert(
    auditTrail.period != null && auditTrail.period.startDate && auditTrail.period.endDate,
    "Audit trail must include period (startDate, endDate)"
  );

  const sumVat = auditTrail.lines.reduce((s: number, line: any) => s + (line.vatAmount || 0), 0);
  assert(
    Math.abs(sumVat - auditTrail.totalOutputTax) < TOLERANCE,
    `Sum of line vatAmount (${sumVat}) must equal totalOutputTax (${auditTrail.totalOutputTax})`
  );
  assert(
    Math.abs(auditTrail.totalOutputTax - report.summary.totalOutputTax) < TOLERANCE,
    `Audit trail totalOutputTax (${auditTrail.totalOutputTax}) must match VAT report summary.totalOutputTax (${report.summary.totalOutputTax})`
  );

  for (let i = 0; i < auditTrail.lines.length; i++) {
    const line = auditTrail.lines[i];
    assert(line.id != null, `Line ${i + 1}: must have id`);
    assert(line.date != null, `Line ${i + 1}: must have date`);
    assert(typeof line.vatAmount === "number", `Line ${i + 1}: must have vatAmount (number)`);
    assert(line.type != null, `Line ${i + 1}: must have type (Invoice, Receipt, Revenue, etc.)`);
    if (line.type === "Invoice") {
      assert(
        line.reference != null || line.invoiceNumber != null,
        `Line ${i + 1}: Invoice must have reference or invoiceNumber`
      );
    }
  }

  const invoiceLines = auditTrail.lines.filter((l: any) => l.type === "Invoice");
  console.log("  Lines that are Invoices:", invoiceLines.length);
  if (auditTrail.lines.length > 0) {
    console.log("\n  Sample line:", JSON.stringify(auditTrail.lines[0], null, 2));
  }

  if (failures.length > 0) {
    console.error("\n❌ FAILED:");
    failures.forEach((f) => console.error("  -", f));
    process.exit(1);
  }

  console.log(
    "\n✅ PASSED: VAT Output audit trail returns a line-by-line list of every transaction (including invoices) that contributed to the VAT Output total."
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
