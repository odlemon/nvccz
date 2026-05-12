// @ts-nocheck
/**
 * Ops: set a purchase requisition back to DRAFT and remove in-flight PR approval requests.
 * Refuses if the PR has linked purchase orders.
 *
 * Usage: npx ts-node --transpile-only -r dotenv/config scripts/run-purchase-requisition-to-draft.ts <requisitionId>
 */
import { prisma } from "../src/utils/database";

const requisitionId = process.argv[2];
if (!requisitionId) {
  console.error(
    "Usage: npx ts-node --transpile-only -r dotenv/config scripts/run-purchase-requisition-to-draft.ts <requisitionId>"
  );
  process.exit(1);
}

async function main() {
  const req = await prisma.purchaseRequisition.findUnique({
    where: { id: requisitionId },
    select: {
      id: true,
      requisitionNumber: true,
      title: true,
      status: true,
      _count: { select: { purchaseOrders: true } },
    },
  });

  if (!req) {
    console.error("Requisition not found:", requisitionId);
    process.exit(1);
  }

  if (req._count.purchaseOrders > 0) {
    console.error(
      `Refusing: requisition ${req.requisitionNumber} has ${req._count.purchaseOrders} purchase order(s). Unlink or remove POs first.`
    );
    process.exit(1);
  }

  await prisma.$transaction(async (tx) => {
    const del = await tx.approvalRequest.deleteMany({
      where: {
        entityId: requisitionId,
        stageType: "PURCHASE_REQUISITION",
      },
    });
    console.log(`Removed ${del.count} approval request(s) for PURCHASE_REQUISITION / entity ${requisitionId}`);

    await tx.purchaseRequisition.update({
      where: { id: requisitionId },
      data: {
        status: "DRAFT",
        approvedById: null,
        approvedAt: null,
        rejectionReason: null,
        investeeSubmittedAt: null,
      },
    });
  });

  const after = await prisma.purchaseRequisition.findUnique({
    where: { id: requisitionId },
    select: { id: true, requisitionNumber: true, title: true, status: true },
  });
  console.log("Updated:", after);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
