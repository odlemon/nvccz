/**
 * Deletes procurement RFQ(s) tied to a purchase requisition and sets the PR back to APPROVED
 * so you can call POST /api/procurement/rfq again (that endpoint requires PR status APPROVED).
 *
 * Skips RFQs in status AWARDED (would need manual PO/quote cleanup).
 *
 * Usage:
 *   npx ts-node scripts/run-delete-rfq-and-reset-pr-to-approved.ts <purchaseRequisitionId>
 *   npx ts-node scripts/run-delete-rfq-and-reset-pr-to-approved.ts --rfqNumber=RFQ_20260511_0001
 *
 * Or set env: REQUISITION_ID=... or RFQ_NUMBER=...
 *
 * Run: npm run db:delete-rfq-reset-pr -- <purchaseRequisitionId>
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function parseArgs(): { requisitionId?: string; rfqNumber?: string } {
  const requisitionIdEnv = process.env.REQUISITION_ID?.trim();
  const rfqNumberEnv = process.env.RFQ_NUMBER?.trim();
  let requisitionId: string | undefined = requisitionIdEnv;
  let rfqNumber: string | undefined = rfqNumberEnv;

  for (const a of process.argv.slice(2)) {
    if (a.startsWith("--rfqNumber=")) {
      rfqNumber = a.slice("--rfqNumber=".length).trim();
    } else if (a.startsWith("--requisitionId=")) {
      requisitionId = a.slice("--requisitionId=".length).trim();
    } else if (!a.startsWith("-") && a.trim()) {
      requisitionId = a.trim();
    }
  }
  return { requisitionId, rfqNumber };
}

async function main() {
  const { requisitionId: argReqId, rfqNumber: argRfq } = parseArgs();
  let requisitionId = argReqId;

  if (argRfq && !requisitionId) {
    const rfq = await prisma.procurementRfq.findUnique({
      where: { rfqNumber: argRfq },
      select: { id: true, requisitionId: true, rfqNumber: true, status: true },
    });
    if (!rfq) {
      throw new Error(`Procurement RFQ not found: ${argRfq}`);
    }
    if (!rfq.requisitionId) {
      throw new Error(`RFQ ${argRfq} has no linked purchase requisition (requisition_id is null).`);
    }
    requisitionId = rfq.requisitionId;
    console.log(`Resolved RFQ ${argRfq} → requisitionId ${requisitionId}`);
  }

  if (!requisitionId) {
    throw new Error(
      "Pass purchase requisition id (cuid), or --rfqNumber=..., or set REQUISITION_ID / RFQ_NUMBER in env."
    );
  }

  const pr = await prisma.purchaseRequisition.findUnique({
    where: { id: requisitionId },
    select: {
      id: true,
      requisitionNumber: true,
      status: true,
      portfolioCompanyId: true,
    },
  });

  if (!pr) {
    throw new Error(`Purchase requisition not found: ${requisitionId}`);
  }

  const rfqs = await prisma.procurementRfq.findMany({
    where: { requisitionId },
    select: { id: true, rfqNumber: true, status: true, awardedQuotationId: true },
    orderBy: { createdAt: "desc" },
  });

  if (rfqs.length === 0) {
    console.log(`[skip] No procurement_rfqs linked to PR ${pr.requisitionNumber} (${requisitionId})`);
    if (pr.status === "RFQ_SENT") {
      await prisma.purchaseRequisition.update({
        where: { id: requisitionId },
        data: { status: "APPROVED" },
      });
      console.log(`[ok] PR ${pr.requisitionNumber} was RFQ_SENT with no RFQ rows — set status → APPROVED`);
    } else {
      console.log(`[info] PR status is "${pr.status}" (not RFQ_SENT); no RFQ delete needed.`);
    }
    return;
  }

  const blocked = rfqs.filter((r) => r.status === "AWARDED");
  if (blocked.length > 0) {
    throw new Error(
      `Cannot delete: ${blocked.map((b) => `${b.rfqNumber} (${b.status})`).join(", ")}. ` +
        `Awarded RFQs require manual cleanup of quotations/POs first.`
    );
  }

  await prisma.$transaction(async (tx) => {
    for (const r of rfqs) {
      await tx.procurementRfq.delete({ where: { id: r.id } });
      console.log(`[ok] deleted procurement_rfq ${r.rfqNumber} (${r.id}) status=${r.status}`);
    }

    await tx.purchaseRequisition.update({
      where: { id: requisitionId },
      data: { status: "APPROVED" },
    });
  });

  console.log(
    `[ok] PR ${pr.requisitionNumber} (${requisitionId}) → APPROVED` +
      (pr.portfolioCompanyId ? " (investee-linked PR; you can re-send RFQ when still APPROVED)" : "")
  );
  console.log(`[note] Vendor quotations that pointed at deleted RFQs now have procurement_rfq_id = NULL (Prisma onDelete).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
