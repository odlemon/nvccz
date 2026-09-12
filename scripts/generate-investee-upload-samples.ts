/**
 * One-off: copy templates + write minimal PDFs into samples/investee-report-uploads/
 * Naming: [YYYY-MM]_[CompanyName]_[DocType]_vNN.ext (same convention the API/doc expects).
 *
 * Run: npx ts-node scripts/generate-investee-upload-samples.ts
 */
import * as fs from "fs";
import * as path from "path";

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "samples", "investee-report-uploads");
const TPL = path.join(ROOT, "templates", "financial-reports");

/** Minimal valid PDF (one empty page) for Postman / storage smoke tests */
const MINIMAL_PDF = Buffer.from(
  [
    "%PDF-1.4",
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj",
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj",
    "3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R>>endobj",
    "xref",
    "0 4",
    "0000000000 65535 f ",
    "trailer<</Size 4/Root 1 0 R>>",
    "startxref",
    "100",
    "%%EOF",
  ].join("\n")
);

function copy(srcRel: string, destName: string) {
  const src = path.join(TPL, srcRel);
  const dest = path.join(OUT, destName);
  if (!fs.existsSync(src)) {
    throw new Error(`Missing template: ${src}`);
  }
  fs.copyFileSync(src, dest);
  console.log("copied", destName);
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });

  const month = "2026-03";
  const co = "DemoInvestee";

  copy("income_statement_template.xlsx", `${month}_${co}_IncomeStatement_v01.xlsx`);
  copy("statement_of_financial_position_template.xlsx", `${month}_${co}_BalanceSheet_v01.xlsx`);
  copy("cashflow_statement_template.xlsx", `${month}_${co}_CashFlow_v01.xlsx`);
  copy("non_financial_kpis_template.xlsx", `${month}_${co}_NonFinancialKpis_v01.xlsx`);

  const pdfs: Array<[string, string]> = [
    ["Bank statements (dummy)", "BankStatements"],
    ["Tax / compliance placeholder", "TaxCompliance"],
    ["Management accounts placeholder", "ManagementAccounts"],
    ["Business plan placeholder", "BusinessPlan"],
  ];
  for (const [, docType] of pdfs) {
    const name = `${month}_${co}_${docType}_v01.pdf`;
    fs.writeFileSync(path.join(OUT, name), MINIMAL_PDF);
    console.log("wrote", name);
  }

  fs.writeFileSync(
    path.join(OUT, "README.txt"),
    [
      "Investee reporting upload samples (dummy data)",
      "",
      "Naming: [YYYY-MM]_[CompanyName]_[DocType]_vNN.ext",
      "Example month: 2026-03  Company slug: DemoInvestee",
      "",
      "Core financials must be .xlsx. Narrative / compliance can be .pdf.",
      "Match reportingPeriod month (first day of month in API often ties to YYYY-MM in filenames).",
      "",
      "Note: The API may rename files on upload; these names are for your clarity and local testing.",
    ].join("\n")
  );
  console.log("done ->", OUT);
}

main();
