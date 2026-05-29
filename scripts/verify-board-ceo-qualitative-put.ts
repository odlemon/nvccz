/**
 * Smoke: save Board + CEO qualitative evaluation and verify GET scorecard reflects saved grid.
 * Run: npx ts-node --transpile-only scripts/verify-board-ceo-qualitative-put.ts
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import { PerformanceScorecardService } from "../src/services/PerformanceScorecardService";
import {
  EMPLOYEE_PERSONAL_ATTRIBUTES,
  EMPLOYEE_PERSONAL_ATTRIBUTE_COLUMNS
} from "../src/services/performanceScorecardSupport";

async function main() {
  const admin = await prisma.user.findFirst({
    where: { email: "admin@nts.com" },
    select: { id: true, firstName: true, lastName: true, email: true, role: true, roleCode: true }
  });
  if (!admin) {
    throw new Error("admin@nts.com not found — cannot run smoke test.");
  }

  const boardGrid = EMPLOYEE_PERSONAL_ATTRIBUTES.map((attribute) => ({
    attribute,
    columns: EMPLOYEE_PERSONAL_ATTRIBUTE_COLUMNS.map((label, index) => ({
      label,
      selected: attribute === "Ethics" && index === 1
    }))
  }));

  const boardSave = await PerformanceScorecardService.saveBoardQualitativeEvaluation({
    viewer: admin,
    periodLabel: "2026",
    qualitativeEvaluation: { personalAttributes: boardGrid }
  });

  const boardGet = await PerformanceScorecardService.getBoardScorecard({
    viewer: admin,
    periodLabel: "2026"
  });

  const boardEthics = boardGet.document?.qualitativeSections?.personalAttributes?.find(
    (r: { attribute: string }) => r.attribute === "Ethics"
  );
  const boardSelected = boardEthics?.columns?.find((c: { selected?: boolean }) => c.selected)?.label;

  const ceoGrid = EMPLOYEE_PERSONAL_ATTRIBUTES.map((attribute) => ({
    attribute,
    columns: EMPLOYEE_PERSONAL_ATTRIBUTE_COLUMNS.map((label, index) => ({
      label,
      selected: attribute === "Leadership and Management" && index === 0
    }))
  }));

  const ceoSave = await PerformanceScorecardService.saveCEOQualitativeEvaluation({
    viewer: admin,
    periodLabel: "2026",
    qualitativeEvaluation: { personalAttributes: ceoGrid }
  });

  const ceoGet = await PerformanceScorecardService.getCEOScorecard({
    viewer: admin,
    periodLabel: "2026"
  });

  const ceoLead = ceoGet.document?.qualitativeSections?.personalAttributes?.find(
    (r: { attribute: string }) => r.attribute === "Leadership and Management"
  );
  const ceoSelected = ceoLead?.columns?.find((c: { selected?: boolean }) => c.selected)?.label;

  console.log("=== Board qualitative PUT smoke ===");
  console.log("contractId:", boardSave.contractId);
  console.log("draft scorecards synced:", boardSave.savedTo.scorecardIds?.length ?? 0);
  console.log("GET Ethics column selected:", boardSelected, "(expected: Very Good)");

  console.log("\n=== CEO qualitative PUT smoke ===");
  console.log("contractId:", ceoSave.contractId, "ceo:", ceoSave.ceo?.name);
  console.log("GET Leadership column selected:", ceoSelected, "(expected: Excellent)");

  if (boardSelected !== "Very Good") {
    throw new Error(`Board qualitative not reflected in GET — got ${boardSelected}`);
  }
  if (ceoSelected !== "Excellent") {
    throw new Error(`CEO qualitative not reflected in GET — got ${ceoSelected}`);
  }

  console.log("\nOK — qualitative data persists on contract and appears in GET scorecard responses.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
