/**
 * Procurement — record the award on RFQs whose quotation was accepted before the fix.
 *
 * Until nvccz 177ddd2, accepting a quotation raised the purchase order but left its RFQ OPEN with
 * no awardedQuotationId, so vendors could keep quoting on a decided tender (PROC-FINDING-007).
 * For every RFQ that has an ACCEPTED quotation and no recorded award, this sets status AWARDED,
 * awardedQuotationId and awardRationale (the quotation's review notes).
 *
 * Idempotent: an RFQ already AWARDED with its quotation is left alone, and a conflicting award
 * (a different quotation recorded, or the quotation already recorded elsewhere) is reported and
 * never overwritten.
 *
 * Run:     npm run db:migrate:procurement-rfq-award-backfill
 * Verify:  npm run db:migrate:procurement-rfq-award-backfill -- --check   (exit 1 if anything would change)
 */
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const CHECK_ONLY = process.argv.includes("--check")

async function main() {
  console.log(`Procurement RFQ award backfill${CHECK_ONLY ? " (check only, no writes)" : ""}\n`)

  const accepted = await prisma.vendorQuotation.findMany({
    where: { status: "ACCEPTED", procurementRfqId: { not: null } },
    select: { id: true, quotationNumber: true, procurementRfqId: true, reviewNotes: true, reviewedAt: true },
    orderBy: { reviewedAt: "asc" },
  })

  let changed = 0
  let conflicts = 0
  for (const q of accepted) {
    const rfq = await prisma.procurementRfq.findUnique({
      where: { id: q.procurementRfqId as string },
      select: { id: true, rfqNumber: true, status: true, awardedQuotationId: true },
    })
    if (!rfq) continue
    if (rfq.awardedQuotationId === q.id && rfq.status === "AWARDED") continue
    if (rfq.awardedQuotationId && rfq.awardedQuotationId !== q.id) {
      conflicts += 1
      console.log(`  CONFLICT  ${rfq.rfqNumber} already records ${rfq.awardedQuotationId}; ${q.quotationNumber} left alone`)
      continue
    }
    const elsewhere = await prisma.procurementRfq.findFirst({
      where: { awardedQuotationId: q.id, NOT: { id: rfq.id } },
      select: { rfqNumber: true },
    })
    if (elsewhere) {
      conflicts += 1
      console.log(`  CONFLICT  ${q.quotationNumber} is already recorded on ${elsewhere.rfqNumber}; ${rfq.rfqNumber} left alone`)
      continue
    }

    changed += 1
    console.log(`  ${CHECK_ONLY ? "would award" : "awarded  "}  ${rfq.rfqNumber} -> ${q.quotationNumber} (was ${rfq.status})`)
    if (!CHECK_ONLY) {
      await prisma.procurementRfq.update({
        where: { id: rfq.id },
        data: { status: "AWARDED", awardedQuotationId: q.id, awardRationale: q.reviewNotes ?? null },
      })
    }
  }

  console.log(`\n${CHECK_ONLY ? "Would change" : "Changed"} ${changed} RFQ(s) of ${accepted.length} accepted quotation(s); ${conflicts} conflict(s) left alone.`)
  if (CHECK_ONLY && changed > 0) process.exitCode = 1
}

main()
  .catch((err) => {
    console.error("[failed]", err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
