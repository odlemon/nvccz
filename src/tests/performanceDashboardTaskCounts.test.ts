import {
  classifyDashboardTaskStage,
  countInProgressColumnTasks,
  taskBelongsToDashboardPeriod,
  taskCountsForDashboard
} from "../services/PerformanceDashboardService";

describe("performanceDashboardTaskCounts", () => {
  test("classifyDashboardTaskStage matches Kanban columns", () => {
    expect(classifyDashboardTaskStage("todo")).toBe("pending");
    expect(classifyDashboardTaskStage("in_progress")).toBe("inProgress");
    expect(classifyDashboardTaskStage("delayed")).toBe("inProgress");
    expect(classifyDashboardTaskStage("completed")).toBe("completed");
    expect(classifyDashboardTaskStage("overdue")).toBe("overdue");
  });

  test("taskCountsForDashboard sums to total", () => {
    const tasks = [
      { stage: "in_progress" },
      { stage: "in_progress" },
      { stage: "delayed" },
      { stage: "completed" },
      { stage: "completed" },
      { stage: "completed" },
      { stage: "completed" },
      { stage: "overdue" }
    ];
    const c = taskCountsForDashboard(tasks);
    expect(c.total).toBe(8);
    expect(c.inProgress + c.overdue).toBe(4);
    expect(c.completed).toBe(4);
    expect(c.pending + c.inProgress + c.completed + c.overdue).toBe(8);
    expect(countInProgressColumnTasks(tasks)).toBe(2);
  });

  test("taskBelongsToDashboardPeriod includes open tasks created before period end", () => {
    const start = new Date("2026-05-01T00:00:00.000Z");
    const end = new Date("2026-05-31T23:59:59.999Z");
    expect(
      taskBelongsToDashboardPeriod(
        {
          stage: "in_progress",
          createdAt: new Date("2026-03-01"),
          updatedAt: new Date("2026-03-02"),
          date: new Date("2026-05-10")
        },
        start,
        end
      )
    ).toBe(true);
  });
});
