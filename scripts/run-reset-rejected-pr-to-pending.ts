/**
 * One-off: move a rejected purchase requisition back to pending review (no new HTTP route).
 * Edit REQUISITION_ID if you need this again.
 *
 * Usage: npx ts-node scripts/run-reset-rejected-pr-to-pending.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const REQUISITION_ID = "cmp377r4x008jkt0814dv54pb";

async function main() {
  const r = await prisma.purchaseRequisition.findUnique({
    where: { id: REQUISITION_ID },
    select: {
      id: true,
      requisitionNumber: true,
      status: true,
      portfolioCompanyId: true,
      department: true,
    },
  });

  if (!r) {
    throw new Error(`Purchase requisition not found: ${REQUISITION_ID}`);
  }

  if (r.status !== "REJECTED") {
    throw new Error(
      `Expected status REJECTED, got "${r.status}" for ${r.requisitionNumber} (${REQUISITION_ID}). Aborting.`
    );
  }

  const pendingStatus = r.portfolioCompanyId
    ? "PENDING_VC_EXECUTIVE_REVIEW"
    : "PENDING_APPROVAL";

  await prisma.purchaseRequisition.update({
    where: { id: REQUISITION_ID },
    data: {
      status: pendingStatus,
      rejectionContentFingerprint: null,
      ...(r.portfolioCompanyId ? { investeeSubmittedAt: new Date() } : {}),
    },
  });

  console.log(
    `[ok] ${r.requisitionNumber} (${REQUISITION_ID}) → ${pendingStatus}` +
      (r.portfolioCompanyId ? " (Suite 02 investee; investeeSubmittedAt set)" : "")
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
