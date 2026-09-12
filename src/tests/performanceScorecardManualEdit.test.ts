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
  EMPLOYEE_PERSONAL_ATTRIBUTES,
  EMPLOYEE_PERSONAL_ATTRIBUTE_COLUMNS
} from "../services/performanceScorecardSupport";
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

function buildQualitativeEvaluation(highlightAttribute = "Teamwork", selectedColumnIndex = 2) {
  return {
    personalAttributes: EMPLOYEE_PERSONAL_ATTRIBUTES.map((attribute) => ({
      attribute,
      columns: EMPLOYEE_PERSONAL_ATTRIBUTE_COLUMNS.map((label, index) => ({
        label,
        selected: attribute === highlightAttribute ? index === selectedColumnIndex : index === 2
      }))
    })),
    trainingAndDevelopment: {
      beginningOfCycle: [{ note: "Leadership workshop Q1" }],
      endOfCycle: [],
      interventions: []
    }
  };
}

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

  test("applyScorecardManualEdit: rejects matrix row patches", async () => {
    mockFindUnique.mockResolvedValue(buildEmployeeScorecard());

    await expect(
      applyScorecardManualEdit({
        scorecardId: "sc-emp",
        viewer,
        editReason: "Should fail",
        matrixRowPatches: [{ goalId: "goal1", rawRating: 6 }],
        qualitativeEvaluation: buildQualitativeEvaluation()
      })
    ).rejects.toThrow(/matrixRowPatches are not editable/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("applyScorecardManualEdit: rejects score overrides", async () => {
    mockFindUnique.mockResolvedValue(buildEmployeeScorecard());

    await expect(
      applyScorecardManualEdit({
        scorecardId: "sc-emp",
        viewer,
        editReason: "Should fail",
        scores: { finalScore: 6 },
        qualitativeEvaluation: buildQualitativeEvaluation()
      })
    ).rejects.toThrow(/scores cannot be overridden/i);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("applyScorecardManualEdit: qualitative edit updates sections only", async () => {
    mockFindUnique.mockResolvedValue(buildEmployeeScorecard());
    let capturedUpdate: Record<string, unknown> | null = null;
    mockUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      capturedUpdate = data;
      return { ...buildEmployeeScorecard(), ...data };
    });

    const result = await applyScorecardManualEdit({
      scorecardId: "sc-emp",
      viewer,
      editReason: "Corrected Teamwork rating",
      qualitativeEvaluation: buildQualitativeEvaluation()
    });

    expect(capturedUpdate!.matrixRows).toBeUndefined();
    expect(capturedUpdate!.resultsDeliveryScore).toBeUndefined();
    expect(capturedUpdate!.qualitativeSections).toBeDefined();
    expect(result.scores.finalScore).toBe(2);
    expect(mockAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "SCORECARD_MANUAL_EDIT",
        newValues: expect.objectContaining({
          editReason: "Corrected Teamwork rating",
          scorecardType: "EMPLOYEE",
          editScope: "qualitativeEvaluation"
        })
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
      editReason: "Post-finalize qualitative correction",
      qualitativeEvaluation: buildQualitativeEvaluation()
    });

    expect(result.savedRecord.status).toBe("FINAL");
    expect(result.savedRecord.isLocked).toBe(true);
    expect(result.scores.finalScore).toBe(2);
  });

  test("applyScorecardManualEdit: CEO qualitative edit preserves computed scores", async () => {
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
      editReason: "CEO qualitative correction",
      qualitativeEvaluation: buildQualitativeEvaluation()
    });

    expect(result.scorecardType).toBe("CEO");
    expect(result.scores.finalScore).toBe(4);
    expect(result.savedRecord.status).toBe("FINAL");
  });
});
