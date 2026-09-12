/**
 * Audit DOCX template placeholders vs coverage strategy.
 * Run: npx ts-node --transpile-only scripts/audit-report-placeholders.ts
 */
import fs from "fs";
import path from "path";
import {
  extractDocxPlaceholders,
  normalizeDocxDelimiters,
  countLiteralNaInDocx,
} from "../src/services/investmentOps/reporting/extractDocxPlaceholders";
import {
  INVESTMENT_REPORT_TEMPLATES,
  resolveDocxTemplatePath,
} from "../src/services/investmentOps/reporting/investmentReportTemplates";

async function main() {
  const results: Array<{
    code: string;
    file: string;
    count: number;
    normalized: number;
    literalNa: number;
    placeholders: string[];
    requiresFundId: boolean;
    requiresClientId?: boolean;
    scopeType: string;
  }> = [];

  for (const t of INVESTMENT_REPORT_TEMPLATES.filter((x) => x.docxTemplate)) {
    const p = resolveDocxTemplatePath(t);
    if (!fs.existsSync(p)) {
      console.error("MISSING", t.code, p);
      continue;
    }
    const normalized = normalizeDocxDelimiters(p);
    const placeholders = extractDocxPlaceholders(p);
    const literalNa = countLiteralNaInDocx(p);
    results.push({
      code: t.code,
      file: t.docxTemplate!,
      count: placeholders.length,
      normalized,
      literalNa,
      placeholders,
      requiresFundId: t.requiresFundId,
      requiresClientId: t.requiresClientId,
      scopeType: t.scopeType,
    });
    console.log(
      `${t.code}: ${placeholders.length} placeholders, literalNa=${literalNa}, normalized=${normalized}`
    );
  }

  const all = [...new Set(results.flatMap((r) => r.placeholders))].sort();
  const outPath = path.join(process.cwd(), "tmp-report-placeholder-audit.json");
  fs.writeFileSync(outPath, JSON.stringify({ results, allPlaceholders: all }, null, 2));
  console.log(`Wrote ${outPath} (${all.length} unique keys)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
