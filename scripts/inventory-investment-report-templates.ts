/**
 * Copy Arcus Word templates from reports/investments into storage and patch literal N/A cells.
 * npm run inventory:investment-report-templates
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import {
  countLiteralNaInDocx,
  extractDocxPlaceholders,
  patchLiteralNaInDocx,
} from "../src/services/investmentOps/reporting/extractDocxPlaceholders";

const SOURCE_DIR = path.join(process.cwd(), "reports", "investments");
const TARGET_DIR = path.join(process.cwd(), "storage", "report-templates", "investment-ops");
const META_DIR = path.join(process.cwd(), "storage", "report-templates", "investment-ops", "meta");

const MAP: Record<string, string> = {
  "Arcus_Performance_Report_Template (2).docx": "performance-report.docx",
  "Arcus_Holdings_Report_Template (1).docx": "holdings-report.docx",
  "Arcus_Transaction_Report_Template (1).docx": "transaction-report.docx",
  "Arcus_Asset_Allocation_Report_Template (1).docx": "asset-allocation-report.docx",
  "Arcus_Income_Report_Template (1).docx": "income-report.docx",
  "Arcus_Fee_Report_Template (1).docx": "fee-report.docx",
  "Arcus_Client_Portfolio_Valuation_Statement_Template (1).docx": "client-portfolio-valuation.docx",
  "Arcus_Reconciliation_Exception_Report_Template (1).docx": "reconciliation-exception-report.docx",
  "Arcus_Custodian_Trustee_Reconciliation_Template (1).docx": "custodian-trustee-reconciliation.docx",
  "Arcus_Subscriptions_and_Redemptions_Report_Template (1).docx": "subscriptions-redemptions-report.docx",
  "Arcus_AUM_FUM_Movement_Report_Template (1).docx": "aum-fum-movement-report.docx",
  "Arcus_Trustee_Quarterly_Pack_Template (1).docx": "trustee-quarterly-pack.docx",
  "Arcus_CIS_Monthly_Return_Pack_Template (1).docx": "cis-monthly-return-pack.docx",
  "Arcus_AML_CFT_CPF_Return_Pack_Template (1).docx": "aml-cft-cpf-return-pack.docx",
  "Arcus_SECZIM_Capital_Adequacy_Pack_Template (1).docx": "seczim-capital-adequacy-pack.docx",
  "Arcus_SECZIM_Prudential_Return_Pack_Template (1).docx": "seczim-prudential-return-pack.docx",
};

function main() {
  mkdirSync(TARGET_DIR, { recursive: true });
  mkdirSync(META_DIR, { recursive: true });
  const summary: any[] = [];

  for (const [srcName, destName] of Object.entries(MAP)) {
    const src = path.join(SOURCE_DIR, srcName);
    const dest = path.join(TARGET_DIR, destName);
    if (!existsSync(src)) {
      console.warn(`[skip] missing source ${srcName}`);
      continue;
    }
    copyFileSync(src, dest);
    const naBefore = countLiteralNaInDocx(dest);
    if (naBefore > 0) {
      const replacements = Array.from({ length: naBefore }, (_, i) => `auto_na_field_${i + 1}`);
      patchLiteralNaInDocx(dest, replacements);
    }
    const placeholders = extractDocxPlaceholders(dest);
    const metaPath = path.join(META_DIR, `${destName.replace(".docx", "")}.placeholders.json`);
    writeFileSync(metaPath, JSON.stringify(placeholders, null, 2));
    summary.push({
      destName,
      placeholders: placeholders.length,
      naPatched: naBefore,
    });
    console.log(`[ok] ${destName} — ${placeholders.length} fields, patched ${naBefore} N/A`);
  }

  writeFileSync(path.join(META_DIR, "inventory-summary.json"), JSON.stringify(summary, null, 2));
  console.log(`\nInventory complete: ${summary.length} templates`);
}

main();
