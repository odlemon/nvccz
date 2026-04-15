/**
 * Regression checks for API long-timeout path matching (no server, no DB).
 * Run: npx ts-node --transpile-only scripts/test-api-timeout-paths.ts
 */
// @ts-nocheck
import { shouldUseLongTimeout } from "../src/middleware/apiRequestTimeout";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function req(method: string, path: string) {
  return { method, originalUrl: path, url: path, path };
}

function main() {
  const none: string[] = [];

  assert(
    shouldUseLongTimeout(req("POST", "/api/cashbook/batches/import"), none),
    "cashbook CSV import must use long timeout"
  );
  assert(
    !shouldUseLongTimeout(req("POST", "/api/accounting/cashbook/batches/import"), none),
    "wrong accounting/cashbook path must not be treated as import (legacy bug)"
  );
  assert(
    shouldUseLongTimeout(req("POST", "/api/procurement/suite06/intakes/x/extract"), none),
    "suite06 extract POST long"
  );
  assert(
    shouldUseLongTimeout(
      req("POST", "/api/procurement/suite06/purchase-invoices/pinv-1/run-match"),
      none
    ),
    "suite06 run-match POST long"
  );
  assert(
    shouldUseLongTimeout(req("PATCH", "/api/procurement/suite06/intakes/x/verify"), none),
    "suite06 intake verify PATCH long"
  );
  assert(
    !shouldUseLongTimeout(req("GET", "/api/procurement/suite06/verification-queue"), none),
    "suite06 GET list stays short budget"
  );
  assert(
    shouldUseLongTimeout(
      req("POST", "/api/accounting/purchase-invoices/abc-123/submit"),
      none
    ),
    "vendor bill submit long"
  );
  assert(
    shouldUseLongTimeout(req("POST", "/api/accounting/purchase-invoices/abc-123/pay"), none),
    "vendor bill pay long"
  );
  assert(
    shouldUseLongTimeout(
      req("POST", "/api/accounting/purchase-invoices/from-purchase-order"),
      none
    ),
    "PO to vendor bill convert long"
  );
  assert(
    !shouldUseLongTimeout(req("GET", "/api/procurement/suite06/cfo-dashboard"), none),
    "suite06 GET stays default (short) budget"
  );

  console.log("API timeout path checks OK");
}

main();
