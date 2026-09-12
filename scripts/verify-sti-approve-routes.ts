/**
 * Lightweight check that STI approve routes are registered (no server / DB).
 * Run: npx ts-node --transpile-only scripts/verify-sti-approve-routes.ts
 */
import fs from "fs";
import path from "path";

const routesPath = path.join(__dirname, "../src/routes/shortTermInvestmentRoutes.ts");
const src = fs.readFileSync(routesPath, "utf8");

const required = [
  ['/accruals/:accrualId/approve', 'Single accrual approve'],
  ['/accruals/:instrumentId/approve-all', 'Approve all (Swagger-adjacent path)'],
  ['/instruments/:id/accruals/approve-all', 'Approve all (legacy path)'],
  ['postApproveAccrual', 'Controller handler for single approve'],
  ['postApproveAllAccruals', 'Controller handler for approve all'],
] as const;

let failed = false;
for (const [needle, label] of required) {
  if (!src.includes(needle)) {
    console.error(`MISSING (${label}): expected substring ${JSON.stringify(needle)}`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log("OK: STI approve route wiring present in shortTermInvestmentRoutes.ts");
