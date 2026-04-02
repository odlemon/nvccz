/**
 * C.09 Target vs stretch: BSC progress uses contract target; >100% capped unless stretchScoringEnabled.
 * Optional stretch (e.g. 120) is read from goal activities for display alongside target (100).
 */
import {
  computeGoalProgress,
  parseStretchTargetValueFromActivities
} from "../src/services/performanceScorecardSupport";

function main() {
  const target = 100;
  const stretch = 120;
  const actual = 120;

  const activities = { stretchTargetValue: stretch };
  const parsedStretch = parseStretchTargetValueFromActivities(activities);

  const capped = computeGoalProgress({
    actualValue: actual,
    targetValue: target,
    isReverseKpi: false,
    stretchScoringEnabled: false
  });

  const uncapped = computeGoalProgress({
    actualValue: actual,
    targetValue: target,
    isReverseKpi: false,
    stretchScoringEnabled: true
  });

  const pass =
    parsedStretch === stretch &&
    capped.progressPct === 100 &&
    uncapped.progressPct === 120;

  console.log(
    JSON.stringify(
      {
        success: true,
        uat: "C.09",
        scenario: { target, stretchFromActivities: parsedStretch, actual },
        bscProgressPct: {
          stretchScoringDisabled: capped.progressPct,
          stretchScoringEnabled: uncapped.progressPct
        },
        pass
      },
      null,
      2
    )
  );

  if (!pass) {
    process.exit(1);
  }
}

main();
