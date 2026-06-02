import {
  enrichPerformanceGoalForApi,
  createCompanyGoalAssigneeCache
} from "../services/performanceGoalApiEnrichment";

jest.mock("../utils/database", () => ({
  prisma: {
    user: {
      findUnique: jest.fn()
    }
  }
}));

jest.mock("../services/performanceGoalDefaultAssignee", () => ({
  resolveDefaultCompanyGoalAssigneeId: jest.fn()
}));

import { prisma } from "../utils/database";
import { resolveDefaultCompanyGoalAssigneeId } from "../services/performanceGoalDefaultAssignee";

const mockFindUnique = prisma.user.findUnique as jest.Mock;
const mockResolveCeo = resolveDefaultCompanyGoalAssigneeId as jest.Mock;

describe("performanceGoalApiEnrichment", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveCeo.mockResolvedValue("ceo-user-1");
    mockFindUnique.mockResolvedValue({
      id: "ceo-user-1",
      firstName: "Tatenda",
      lastName: "R",
      email: "ceo@example.com"
    });
  });

  test("company goal: recomputes progress from current/target when DB progress is 0", async () => {
    const enriched = await enrichPerformanceGoalForApi(
      {
        id: "g1",
        type: "company",
        currentValue: 95,
        targetValue: 100,
        progressPercentage: 0,
        targetOperator: ">=",
        isReverseKpi: false,
        stage: "planning",
        assignedTo: null,
        assignedToId: null,
        kpi: { unitSymbol: "%", unitCategory: "Percentage" }
      },
      createCompanyGoalAssigneeCache()
    );

    expect(enriched.progressPercentage).toBe(95);
    expect(enriched.targetUnit).toBe("%");
    expect(enriched.assignedTo).toMatchObject({
      id: "ceo-user-1",
      firstName: "Tatenda",
      lastName: "R"
    });
    expect(enriched.ownerDisplayName).toBe("Tatenda R");
  });

  test("non-company goal: does not inject CEO assignee", async () => {
    const enriched = await enrichPerformanceGoalForApi({
      id: "g2",
      type: "department",
      currentValue: 50,
      targetValue: 100,
      progressPercentage: 0,
      targetOperator: ">=",
      assignedTo: null,
      assignedToId: null
    });

    expect(enriched.progressPercentage).toBe(50);
    expect(enriched.assignedTo).toBeNull();
    expect(mockResolveCeo).not.toHaveBeenCalled();
  });

  test("company goal keeps existing assignee when set", async () => {
    const enriched = await enrichPerformanceGoalForApi({
      id: "g3",
      type: "company",
      currentValue: 100,
      targetValue: 100,
      progressPercentage: 0,
      assignedTo: { id: "u2", firstName: "Alex", lastName: "M", email: "a@x.com" },
      assignedToId: "u2"
    });

    expect(enriched.progressPercentage).toBe(100);
    expect(enriched.assignedTo.id).toBe("u2");
    expect(mockResolveCeo).not.toHaveBeenCalled();
  });
});
