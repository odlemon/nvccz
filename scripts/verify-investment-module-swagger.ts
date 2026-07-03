/**
 * Verify investment/fund swagger modules have requestBody examples on mutating ops.
 * Run: npx ts-node --transpile-only scripts/verify-investment-module-swagger.ts
 */
import { fundPerformanceReportingSwaggerPaths } from "../src/config/fund-performance-reporting-swagger-paths";
import { quarterlyClientStatementsSwaggerPaths } from "../src/config/quarterly-client-statements-swagger-paths";
import { fundraisingLpPipelineSwaggerPaths } from "../src/config/fundraising-lp-pipeline-swagger-paths";
import { capTableManagementSwaggerPaths } from "../src/config/cap-table-management-swagger-paths";
import { lpPortalSwaggerPaths } from "../src/config/lp-portal-swagger-paths";
import { dealExecutionPackSwaggerPaths } from "../src/config/deal-execution-pack-swagger-paths";

const MODULES: Array<{ name: string; paths: Record<string, unknown> }> = [
  { name: "Fund Performance Reporting", paths: fundPerformanceReportingSwaggerPaths as Record<string, unknown> },
  { name: "Quarterly Client Statements", paths: quarterlyClientStatementsSwaggerPaths as Record<string, unknown> },
  { name: "Fundraising LP Pipeline", paths: fundraisingLpPipelineSwaggerPaths as Record<string, unknown> },
  { name: "Cap Table Management", paths: capTableManagementSwaggerPaths as Record<string, unknown> },
  { name: "LP Portal", paths: lpPortalSwaggerPaths as Record<string, unknown> },
  { name: "Deal Execution Pack", paths: dealExecutionPackSwaggerPaths as Record<string, unknown> },
];

const MUTATING = new Set(["post", "put", "patch"]);
let failures = 0;

for (const mod of MODULES) {
  console.log(`\n=== ${mod.name} ===`);
  for (const [path, methods] of Object.entries(mod.paths)) {
    if (!methods || typeof methods !== "object") continue;
    for (const [method, op] of Object.entries(methods as Record<string, unknown>)) {
      if (!MUTATING.has(method)) continue;
      const operation = op as Record<string, unknown>;
      const body = operation.requestBody as Record<string, unknown> | undefined;
      if (!body) {
        console.log(`[skip] ${method.toUpperCase()} ${path} — no body required`);
        continue;
      }
      const content = body.content as Record<string, unknown> | undefined;
      const json = content?.["application/json"] as Record<string, unknown> | undefined;
      const multipart = content?.["multipart/form-data"] as Record<string, unknown> | undefined;
      const media = json || multipart;
      const hasExamples = Boolean(media?.examples || media?.example);
      if (!hasExamples) {
        console.log(`[FAIL] ${method.toUpperCase()} ${path} — missing examples`);
        failures++;
      } else {
        console.log(`[ok] ${method.toUpperCase()} ${path}`);
      }
    }
  }
}

console.log(`\nSwagger verify: ${failures} failure(s)`);
process.exit(failures ? 1 : 0);
