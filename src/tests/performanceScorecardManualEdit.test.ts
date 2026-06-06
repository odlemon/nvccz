jest.mock("../utils/database", () => ({
  prisma: {
    performanceScorecard: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn()
    },
    performanceContract: {
      update: jest.fn()
    },
    department: {
      findUnique: jest.fn(),
      findFirst: jest.fn()
    }
  }
}));

jest.mock("../services/AuditService", () => ({
  __esModule: true,
  default: {
    log: jest.fn().mockResolvedValue(undefined)
  }
}));

import { prisma } from "../utils/database";
import AuditService from "../services/AuditService";
import {
  applyScorecardManualEdit,
  loadScorecardForEdit,
  resolvePersistedScorecardId
} from "../services/performanceScorecardManualEdit";

const mockFindUnique = prisma.performanceScorecard.findUnique as jest.Mock;
const mockFindFirst = prisma.performanceScorecard.findFirst as jest.Mock;
const mockUpdate = prisma.performanceScorecard.update as jest.Mock;
const mockAuditLog = AuditService.log as jest.Mock;

const viewer = {
  id: "user1",
  firstName: "Test",
  lastName: "User",
  email: "test@example.com"
};

const periodStart = new Date("2026-01-01");
const periodEnd = new Date("2026-12-31");

function buildEmployeeScorecard(overrides: Record<string, unknown> = {}) {
  return {
    id: "sc-emp",
    scorecardType: "EMPLOYEE",
    subjectUserId: "emp1",
    status: "DRAFT",
    isLocked: false,
    periodLabel: "2026",
    periodStart,
    periodEnd,
    resultsDeliveryScore: 2,
    budgetScore: 90,
    finalScore: 2,
    matrixRows: [
      {
        id: "goal1",
        goalName: "Revenue target",
        actualValue: 50,
        targetValue: 100,
        rawRating: 2,
        weight: 100,
        effectiveWeight: 100,
        weightedScore: 2,
        allowableVariance: 10,
        isReverseKpi: false,
        isPendingApproval: false,
        excludedFromScoring: false,
        progressPct: 50
      }
    ],
    documentPayload: {},
    warnings: [],
    contractId: "contract1",
    contract: { allocatedBudget: null, qualitativeTemplate: null },
    subjectUser: {
      id: "emp1",
      firstName: "Jane",
      lastName: "Employee",
      email: "jane@example.com",
      userDepartment: "Finance",
      role: { name: "Staff" },
      employee: { lineManagerUserId: "mgr1", terminated: false }
    },
    ...overrides
  };
}

function buildCeoScorecard() {
  return {
    id: "sc-ceo",
    scorecardType: "CEO",
    status: "FINAL",
    isLocked: true,
    periodLabel: "2026",
    periodStart,
    periodEnd,
    resultsDeliveryScore: 4,
    budgetScore: null,
    finalScore: 4,
    matrixRows: [
      {
        id: "g1",
        section: "A1",
        indicatorName: "Revenue",
        targetValue: 100,
        computedActual: 100,
        rawRating: 4,
        weight: 100,
        effectiveWeight: 100,
        weightedScore: 4,
        allowableVariance: 0.1,
        isReverseKpi: false,
        isPendingApproval: false,
        excludedFromScoring: false
      }
    ],
    sections: { A1: { sectionScore: 4 } },
    documentPayload: { sectionTables: {}, subtotals: {} },
    warnings: [],
    contractId: "ceo-contract",
    contract: { sectionWeights: null, qualitativeTemplate: null },
    subjectUser: null
  };
}

describe("performanceScorecardManualEdit", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...buildEmployeeScorecard(),
      ...data,
      status: "DRAFT",
      isLocked: false
    }));
  });

  test("resolvePersistedScorecardId: employee by user + period", async () => {
    mockFindFirst.mockResolvedValue({ id: "sc-emp" });

    const id = await resolvePersistedScorecardId({
      scorecardType: "EMPLOYEE",
      employeeUserId: "emp1",
      periodLabel: "2026"
    });

    expect(id).toBe("sc-emp");
    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          scorecardType: "EMPLOYEE",
          subjectUserId: "emp1"
        })
      })
    );
  });

  test("resolvePersistedScorecardId: CEO by period", async () => {
    mockFindFirst.mockResolvedValue({ id: "sc-ceo" });
    const id = await resolvePersistedScorecardId({ scorecardType: "CEO", periodLabel: "2026" });
    expect(id).toBe("sc-ceo");
  });

  test("loadScorecardForEdit: returns employee payload", async () => {
    mockFindUnique.mockResolvedValue(buildEmployeeScorecard());

    const result = await loadScorecardForEdit("sc-emp", viewer);

    expect(result.scorecardType).toBe("EMPLOYEE");
    expect(result.scorecardId).toBe("sc-emp");
    expect(result.matrixRows).toHaveLength(1);
    expect(result.employee).toBeDefined();
  });

  test("applyScorecardManualEdit: missing editReason", async () => {
    mockFindUnique.mockResolvedValue(buildEmployeeScorecard());

    await expect(
      applyScorecardManualEdit({ scorecardId: "sc-emp", viewer, editReason: "  " })
    ).rejects.toThrow(/editReason is required/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("applyScorecardManualEdit: employee matrix patch recalculates scores", async () => {
    mockFindUnique.mockResolvedValue(buildEmployeeScorecard());
    let capturedUpdate: Record<string, unknown> | null = null;
    mockUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      capturedUpdate = data;
      return { ...buildEmployeeScorecard(), ...data };
    });

    await applyScorecardManualEdit({
      scorecardId: "sc-emp",
      viewer,
      editReason: "Corrected rating",
      matrixRowPatches: [{ goalId: "goal1", rawRating: 6 }]
    });

    const rows = capturedUpdate!.matrixRows as any[];
    expect(rows[0].rawRating).toBe(6);
    expect(Number(capturedUpdate!.resultsDeliveryScore)).toBe(6);
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "SCORECARD_MANUAL_EDIT",
        newValues: expect.objectContaining({ editReason: "Corrected rating", scorecardType: "EMPLOYEE" })
      })
    );
  });

  test("applyScorecardManualEdit: FINAL employee keeps status and lock", async () => {
    const finalCard = buildEmployeeScorecard({ status: "FINAL", isLocked: true });
    mockFindUnique.mockResolvedValue(finalCard);
    mockUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...finalCard,
      ...data,
      status: "FINAL",
      isLocked: true
    }));

    const result = await applyScorecardManualEdit({
      scorecardId: "sc-emp",
      viewer,
      editReason: "Post-finalize correction",
      matrixRowPatches: [{ goalId: "goal1", rawRating: 5 }]
    });

    expect(result.savedRecord.status).toBe("FINAL");
    expect(result.savedRecord.isLocked).toBe(true);
  });

  test("applyScorecardManualEdit: CEO scorecard updates final score", async () => {
    mockFindUnique.mockResolvedValue(buildCeoScorecard());
    mockUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...buildCeoScorecard(),
      ...data,
      status: "FINAL",
      isLocked: true
    }));

    const result = await applyScorecardManualEdit({
      scorecardId: "sc-ceo",
      viewer,
      editReason: "CEO correction",
      matrixRowPatches: [{ goalId: "g1", rawRating: 6 }]
    });

    expect(result.scorecardType).toBe("CEO");
    expect(result.scores.finalScore).toBeGreaterThan(4);
    expect(result.savedRecord.status).toBe("FINAL");
  });
});
