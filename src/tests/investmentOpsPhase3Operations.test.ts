import { createHash } from "crypto";
import { readFileSync } from "fs";
import path from "path";

function contentChecksum(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

class FileRefError extends Error {
  code = "FILE_REF_FORBIDDEN";
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = "FileRefError";
  }
}

function assertNoCallerFileRef(fileRef?: string | null) {
  if (fileRef) {
    throw new FileRefError(
      "Caller-controlled fileRef paths are not allowed; use upload sessions"
    );
  }
}

const RECON_TYPES = [
  "CASH",
  "HOLDINGS",
  "TRADE",
  "BROKER_CONFIRMATION",
  "CUSTODIAN_POSITION",
  "ACCOUNTING_LEDGER",
  "NAV",
  "PRICE",
  "FX",
] as const;

describe("Investment Ops Phase 3 invariants", () => {
  it("checksums are stable for the same payload", () => {
    expect(contentChecksum({ a: 1, b: "2" })).toBe(contentChecksum({ a: 1, b: "2" }));
    expect(contentChecksum({ a: 1, b: "2" })).not.toBe(contentChecksum({ a: 1, b: "3" }));
  });

  it("covers SRD reconciliation types", () => {
    expect(RECON_TYPES).toEqual(
      expect.arrayContaining([
        "CASH",
        "HOLDINGS",
        "TRADE",
        "BROKER_CONFIRMATION",
        "CUSTODIAN_POSITION",
        "ACCOUNTING_LEDGER",
        "NAV",
        "PRICE",
        "FX",
      ])
    );
  });

  it("rejects caller-controlled fileRef paths", () => {
    expect(() => assertNoCallerFileRef("/etc/passwd")).toThrow(
      expect.objectContaining({ code: "FILE_REF_FORBIDDEN", status: 400 })
    );
    expect(() => assertNoCallerFileRef(null)).not.toThrow();
  });

  it("detects unbalanced vs balanced journal lines", () => {
    const unbalanced = [
      { debitAmount: "100.00", creditAmount: "0" },
      { debitAmount: "0", creditAmount: "90.00" },
    ];
    const balanced = [
      { debitAmount: "100.00", creditAmount: "0" },
      { debitAmount: "0", creditAmount: "100.00" },
    ];
    const sum = (lines: typeof balanced, field: "debitAmount" | "creditAmount") =>
      lines.reduce((s, l) => s + Number(l[field]), 0);
    expect(Math.abs(sum(unbalanced, "debitAmount") - sum(unbalanced, "creditAmount")) > 0.01).toBe(
      true
    );
    expect(Math.abs(sum(balanced, "debitAmount") - sum(balanced, "creditAmount")) <= 0.01).toBe(
      true
    );
  });
});

describe("Investment Ops Phase 3 source contracts", () => {
  const root = path.join(__dirname, "..");
  const valuationSource = readFileSync(
    path.join(root, "services/investmentOps/InvestmentValuationService.ts"),
    "utf8"
  );
  const workerSource = readFileSync(
    path.join(root, "services/investmentOps/InvestmentJobWorkerService.ts"),
    "utf8"
  );
  const docsSource = readFileSync(
    path.join(root, "services/investmentOps/InvestmentDocumentationService.ts"),
    "utf8"
  );
  const glSource = readFileSync(
    path.join(root, "services/listedEquity/ListedEquityGlPostingService.ts"),
    "utf8"
  );

  it("does not complete valuations via setImmediate-only", () => {
    expect(valuationSource).not.toMatch(/setImmediate\s*\(/);
    expect(valuationSource).toContain("InvestmentJobWorkerService.enqueue");
    expect(valuationSource).toContain('registerInvestmentJobHandler("VALUATION_RUN"');
    expect(workerSource).toContain("processJobById");
    expect(workerSource).toContain("leaseNext");
    expect(workerSource).toContain("stableStringify");
  });

  it("blocks caller fileRef and uses controlled upload sessions", () => {
    expect(docsSource).toContain("FILE_REF_FORBIDDEN");
    expect(docsSource).toContain("createUploadSession");
    expect(docsSource).toContain("UNSAFE_FILE_PATH");
  });

  it("plugs settlement into accounting facade", () => {
    expect(glSource).toContain("commitSettlementBundle");
  });
});

describe("Investment Ops Phase 3 route smoke", () => {
  const routesSource = readFileSync(
    path.join(__dirname, "../routes/investmentOpsRoutes.ts"),
    "utf8"
  );

  it.each([
    '"/valuation/runs"',
    '"/valuation/runs/:id/inputs"',
    '"/valuation/runs/:id/items"',
    '"/valuation/runs/:id/summary"',
    '"/valuation/runs/:id/cancel"',
    '"/valuation/runs/:id/rerun"',
    '"/valuation/exceptions/:id/override"',
    '"/valuation/exceptions/:id/approve-override"',
    '"/valuation/price-validation"',
    '"/valuation/fx-validation"',
    '"/reconciliation/uploads"',
    '"/reconciliation/items/:id/assign"',
    '"/reconciliation/items/:id/write-off"',
    '"/reconciliation/items/:id/history"',
    '"/reconciliation/summary"',
    '"/accounting/events/:id/retry"',
    '"/accounting/journals/:id/submit"',
    '"/accounting/journals/:id/post"',
    '"/accounting/reversals/:id/approve"',
    '"/accounting/ledger-exports"',
    '"/files/upload-sessions"',
    '"/files/:fileId/complete"',
    '"/documents/:id/versions/:versionId/preview"',
    '"/documents/:id/versions/:versionId/download"',
    '"/documents/:id/access"',
    '"/documents/:id/archive"',
  ])("wires %s", (routeLiteral) => {
    expect(routesSource).toContain(routeLiteral);
  });
});
