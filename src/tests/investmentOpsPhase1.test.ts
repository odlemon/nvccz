import { InvestmentOpsError } from "../middleware/investmentOpsFoundation";
import {
  assertFolderMoveIsAcyclic,
  validateAtomicSiblingOrder,
} from "../services/investmentOps/InvestmentOpsPhase1Service";
import { assertInstrumentTransition } from "../services/investmentOps/InvestmentInstrumentService";
import { SETTING_REFERENCE_TYPES } from "../services/investmentOps/InvestmentOpsReferenceService";

describe("Investment Ops Phase 1 invariants", () => {
  const folders = [
    { id: "root", parentId: null },
    { id: "child", parentId: "root" },
    { id: "grandchild", parentId: "child" },
  ];

  it("rejects folder moves below their descendants", () => {
    expect(() => assertFolderMoveIsAcyclic(folders, "root", "grandchild")).toThrow(
      expect.objectContaining<Partial<InvestmentOpsError>>({ code: "FOLDER_CYCLE", status: 409 })
    );
    expect(() => assertFolderMoveIsAcyclic(folders, "child", null)).not.toThrow();
  });

  it("requires an atomic permutation of all active siblings", () => {
    expect(() => validateAtomicSiblingOrder(["a", "b", "c"], ["c", "a", "b"])).not.toThrow();
    expect(() => validateAtomicSiblingOrder(["a", "b", "c"], ["a", "a", "b"])).toThrow(
      expect.objectContaining<Partial<InvestmentOpsError>>({ code: "INVALID_SIBLING_ORDER" })
    );
    expect(() => validateAtomicSiblingOrder(["a", "b"], ["a"])).toThrow();
  });

  it("enforces the instrument maker-checker lifecycle", () => {
    expect(() => assertInstrumentTransition("DRAFT", "PENDING_APPROVAL")).not.toThrow();
    expect(() => assertInstrumentTransition("PENDING_APPROVAL", "ACTIVE")).not.toThrow();
    expect(() => assertInstrumentTransition("PENDING_APPROVAL", "APPROVED")).toThrow(
      expect.objectContaining<Partial<InvestmentOpsError>>({
        code: "INVALID_INSTRUMENT_TRANSITION",
      })
    );
    expect(() => assertInstrumentTransition("ACTIVE", "RESTRICTED")).not.toThrow();
    expect(() => assertInstrumentTransition("RESTRICTED", "ACTIVE")).not.toThrow();
    expect(() => assertInstrumentTransition("DRAFT", "ACTIVE")).toThrow(
      expect.objectContaining<Partial<InvestmentOpsError>>({
        code: "INVALID_INSTRUMENT_TRANSITION",
      })
    );
  });

  it("registers setting-backed catalogs missing dedicated hardened tables", () => {
    expect([...SETTING_REFERENCE_TYPES].sort()).toEqual(
      [
        "corporate-action-mappings",
        "coupon-frequencies",
        "instrument-mappings",
        "instrument-subcategories",
        "settlement-accounts",
        "ssis",
        "tags",
      ].sort()
    );
  });
});
