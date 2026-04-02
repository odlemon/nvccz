import { resolveTaskPerformanceZone } from "../services/TaskCollaborationService";

describe("C.06 task Red Zone", () => {
  test("overdue flag yields RED ZONE in API shaping", () => {
    expect(
      resolveTaskPerformanceZone({
        stage: "in_progress",
        isOverdue: true,
        date: new Date("2020-01-01T12:00:00.000Z")
      })
    ).toBe("RED ZONE");
  });

  test("explicit overdue stage yields RED ZONE", () => {
    expect(resolveTaskPerformanceZone({ stage: "overdue", isOverdue: false })).toBe("RED ZONE");
  });
});
