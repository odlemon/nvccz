import {
  HARD_CODED_BSC_PILLARS,
  buildExponentialBackoffSchedule,
  normaliseSyncedDecimal,
  resolveReviewWorkflowStatus,
  shouldRaiseDataQualityAlert,
  uniqueGoalIdsForTaskBatch,
  validateFixedPillarSet,
  validateManagerRatings,
  validateQualitativeFeedbackMinimum
} from "../src/services/performanceBackendSupport";

function assert(condition: any, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function main() {
  const pillarCheck = validateFixedPillarSet({
    [HARD_CODED_BSC_PILLARS[0]]: 25,
    [HARD_CODED_BSC_PILLARS[1]]: 25,
    [HARD_CODED_BSC_PILLARS[2]]: 25,
    [HARD_CODED_BSC_PILLARS[3]]: 25
  });
  assert(pillarCheck.valid, "Pillar weights should total 100 with the fixed pillar set.");

  const schedule = buildExponentialBackoffSchedule();
  assert(JSON.stringify(schedule) === JSON.stringify([1000, 2000, 4000, 8000, 16000]), "Backoff schedule mismatch.");

  assert(normaliseSyncedDecimal("123.4567891", 6) === "123.456789", "Decimal normalization mismatch.");
  assert(
    shouldRaiseDataQualityAlert({
      currentValue: 10.5002,
      lastApprovedValue: 10.4,
      formulaType: "AUM_TOTAL"
    }),
    "Expected data quality alert for precision-sensitive KPI drift."
  );

  assert(!validateManagerRatings([{ managerRating: 4.5 }]).valid, "Manager rating validation should reject decimals.");
  assert(validateManagerRatings([{ managerRating: 6 }]).valid, "Manager rating validation should accept 6.");
  assert(!validateManagerRatings([{ managerRating: 7 }]).valid, "Manager rating validation should reject 7.");
  assert(
    validateQualitativeFeedbackMinimum("This manager comment is comfortably above fifty characters long.").valid,
    "Qualitative feedback minimum should accept 50+ chars."
  );

  const workflow = resolveReviewWorkflowStatus({ currentStage: "SELF_REVIEW" });
  assert(workflow.status === "MANAGER_REVIEW", "Review workflow should advance to manager review.");

  const goalIds = uniqueGoalIdsForTaskBatch([
    { goalId: "goal-1" },
    { goalId: "goal-1" },
    { goalId: "goal-2" },
    { goalId: null }
  ]);
  assert(JSON.stringify(goalIds) === JSON.stringify(["goal-1", "goal-2"]), "Unique goal list mismatch.");

  console.log("Performance backend support verification passed.");
}

main();
