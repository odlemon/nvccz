/**
 * Sync financial report XLSX templates from the master workbook.
 *
 * Source workbook contains sheets:
 * - INCOME STATEMENTS
 * - STATEMENT OF FINANCIAL POSITION
 * - CASHFLOW STATEMENTS
 * - NON FINANCIAL KPIs
 *
 * Writes to:
 * - templates/financial-reports/income_statement_template.xlsx
 * - templates/financial-reports/statement_of_financial_position_template.xlsx
 * - templates/financial-reports/cashflow_statement_template.xlsx
 * - templates/financial-reports/non_financial_kpis_template.xlsx
 *
 * Usage:
 *   npx ts-node scripts/sync-financial-report-templates-from-master.ts [pathToMasterXlsx]
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import XLSX from "xlsx";

const DEFAULT_MASTER =
  "docs/venture capital investee_FIINANCIALS_REPORTS.xlsx";

const SHEET_TO_TARGET: Array<{ sheet: string; outFile: string; outSheetName: string }> = [
  { sheet: "INCOME STATEMENTS", outFile: "income_statement_template.xlsx", outSheetName: "Income Statement" },
  { sheet: "STATEMENT OF FINANCIAL POSITION", outFile: "statement_of_financial_position_template.xlsx", outSheetName: "Statement of Financial Position" },
  { sheet: "CASHFLOW STATEMENTS", outFile: "cashflow_statement_template.xlsx", outSheetName: "Cash Flow Statement" },
  { sheet: "NON FINANCIAL KPIs", outFile: "non_financial_kpis_template.xlsx", outSheetName: "Non-Financial KPIs" },
];

function assertFileExists(p: string) {
  if (!fs.existsSync(p)) {
    throw new Error(`File not found: ${p}`);
  }
}

async function main() {
  const masterPathArg = process.argv[2] || DEFAULT_MASTER;
  const masterPath = path.isAbsolute(masterPathArg)
    ? masterPathArg
    : path.join(process.cwd(), masterPathArg);
  assertFileExists(masterPath);

  const wb = XLSX.readFile(masterPath, {
    cellFormula: true,
    cellNF: true,
    cellStyles: true,
  });

  const outDir = path.join(process.cwd(), "templates", "financial-reports");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  for (const m of SHEET_TO_TARGET) {
    const ws = wb.Sheets[m.sheet];
    if (!ws) {
      throw new Error(`Missing sheet "${m.sheet}" in master workbook. Found: ${wb.SheetNames.join(", ")}`);
    }

    const outWb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(outWb, ws, m.outSheetName);

    const outPath = path.join(outDir, m.outFile);
    XLSX.writeFile(outWb, outPath, { bookType: "xlsx" });
    // eslint-disable-next-line no-console
    console.log(`[ok] wrote ${outPath} from sheet "${m.sheet}"`);
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});

