import {
  applyDueDateStageToTask,
  isRedZoneTask,
  isTaskPastDueByClock,
  resolveTaskPerformanceZone,
  resolveTaskStageAndOverdueFields
} from "../services/TaskCollaborationService";

describe("C.06 task Red Zone", () => {
  test("past due by clock (DB flag still false) yields RED ZONE — e.g. after 10:00 deadline, at 10:01", () => {
    const past = new Date(Date.now() - 60_000);
    const t = { stage: "in_progress", isOverdue: false, date: past, isTrashed: false };
    expect(isTaskPastDueByClock(t)).toBe(true);
    expect(isRedZoneTask(t)).toBe(true);
    expect(resolveTaskPerformanceZone(t)).toBe("RED ZONE");
  });

  test("completed work is never red by clock", () => {
    const past = new Date(Date.now() - 60_000);
    expect(
      isRedZoneTask({ stage: "completed", isOverdue: false, date: past, isTrashed: false })
    ).toBe(false);
  });

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

  test("create with past due date forces overdue stage (ignores todo from body)", () => {
    const past = new Date(Date.now() - 86_400_000);
    const resolved = resolveTaskStageAndOverdueFields("todo", past);
    expect(resolved.stage).toBe("overdue");
    expect(resolved.originalStage).toBe("todo");
    expect(resolved.isOverdue).toBe(true);
  });

  test("list shaping sets stage overdue when due date passed", () => {
    const past = new Date(Date.now() - 60_000);
    const shaped = applyDueDateStageToTask({
      stage: "in_progress",
      isOverdue: false,
      date: past,
      isTrashed: false
    });
    expect(shaped.stage).toBe("overdue");
    expect((shaped as Record<string, unknown>).originalStage).toBe("in_progress");
  });
});
