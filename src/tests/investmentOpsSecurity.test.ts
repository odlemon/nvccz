import path from "path";
import { readFileSync } from "fs";
import { Decimal } from "@prisma/client/runtime/library";

class FileRefError extends Error {
  code = "FILE_REF_FORBIDDEN";
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = "FileRefError";
  }
}

function journalBalance(lines: Array<{ debitAmount?: any; creditAmount?: any }>) {
  const debit = lines.reduce((s, l) => s.plus(new Decimal(String(l.debitAmount ?? 0))), new Decimal(0));
  const credit = lines.reduce(
    (s, l) => s.plus(new Decimal(String(l.creditAmount ?? 0))),
    new Decimal(0)
  );
  return { debit, credit, balanced: debit.minus(credit).abs().lte(new Decimal("0.01")) };
}

function assertNoCallerFileRef(fileRef?: string | null) {
  if (fileRef) {
    throw new FileRefError(
      "Caller-controlled fileRef paths are not allowed; use upload sessions"
    );
  }
}

describe("Investment Ops security invariants", () => {
  it("rejects caller-controlled fileRef (unsafe path injection)", () => {
    expect(() => assertNoCallerFileRef("../../etc/passwd")).toThrow(
      expect.objectContaining({ code: "FILE_REF_FORBIDDEN", status: 400 })
    );
    expect(() => assertNoCallerFileRef(null)).not.toThrow();
    expect(() => assertNoCallerFileRef(undefined)).not.toThrow();
  });

  it("flags unbalanced journals and accepts balanced lines", () => {
    expect(
      journalBalance([
        { debitAmount: "100.00", creditAmount: "0" },
        { debitAmount: "0", creditAmount: "90.00" },
      ]).balanced
    ).toBe(false);
    expect(
      journalBalance([
        { debitAmount: "100.00", creditAmount: "0" },
        { debitAmount: "0", creditAmount: "100.00" },
      ]).balanced
    ).toBe(true);
  });

  it("keeps four-eye guards in order, override, valuation, recon, and accounting paths", () => {
    const root = path.join(__dirname, "..");
    const files = [
      "services/investmentOps/InvestmentOrderPhase2Service.ts",
      "services/investmentOps/InvestmentComplianceService.ts",
      "services/investmentOps/InvestmentValuationService.ts",
      "services/investmentOps/InvestmentReconciliationService.ts",
      "services/investmentOps/InvestmentAccountingFacadeService.ts",
      "services/investmentOps/InvestmentInstrumentService.ts",
    ];
    for (const rel of files) {
      const src = readFileSync(path.join(root, rel), "utf8");
      expect(src).toMatch(/FOUR_EYE_(VIOLATION|SELF_APPROVAL)/);
    }
    const orderSrc = readFileSync(
      path.join(root, "services/investmentOps/InvestmentOrderPhase2Service.ts"),
      "utf8"
    );
    expect(orderSrc).toMatch(/createdById === userId/);
  });

  it("fails closed on settlement accounting unless deferred is explicit", () => {
    const settlementSrc = readFileSync(
      path.join(__dirname, "../services/investmentOps/InvestmentOrderPhase2Service.ts"),
      "utf8"
    );
    expect(settlementSrc).toContain("ORDER_SETTLEMENT_ACCOUNTING_REQUIRED");
    expect(settlementSrc).toContain("allowDeferredAccounting");
  });

  it("defaults valuation runs to async enqueue", () => {
    const valuationSrc = readFileSync(
      path.join(__dirname, "../services/investmentOps/InvestmentValuationService.ts"),
      "utf8"
    );
    expect(valuationSrc).toContain("if (data.processNow === true)");
    expect(valuationSrc).not.toContain("if (data.processNow !== false)");
  });

  it("enforces object-level fund access helpers for IDOR prevention", () => {
    const accessSrc = readFileSync(
      path.join(__dirname, "../services/listedEquity/ListedEquityAccessService.ts"),
      "utf8"
    );
    expect(accessSrc).toContain("FORBIDDEN_FUND_ACCESS");
    expect(accessSrc).toContain("assertObjectFundAccess");
    expect(accessSrc).toContain("accessibleFundIdFilter");

    const docsSrc = readFileSync(
      path.join(__dirname, "../services/investmentOps/InvestmentDocumentationService.ts"),
      "utf8"
    );
    expect(docsSrc).toContain("FILE_REF_FORBIDDEN");
    expect(docsSrc).toContain("UNSAFE_FILE_PATH");
    expect(docsSrc).toContain("export function assertNoCallerFileRef");

    const accountingSrc = readFileSync(
      path.join(__dirname, "../services/investmentOps/InvestmentAccountingFacadeService.ts"),
      "utf8"
    );
    expect(accountingSrc).toContain("JOURNAL_UNBALANCED");
    expect(accountingSrc).toContain("export function journalBalance");
  });
});
