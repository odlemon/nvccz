/**
 * Clear noticesSentAt (and NOTICES_SENT → INITIATED) so you can treat the call as not-yet-mailed for UI/state.
 * Does not delete emails from inboxes.
 *
 * Usage: npx ts-node scripts/reset-capital-call-notice-sent.ts <capitalCallId>
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const id = process.argv[2]?.trim();
  if (!id) {
    console.error("Usage: npx ts-node scripts/reset-capital-call-notice-sent.ts <capitalCallId>");
    process.exitCode = 1;
    return;
  }

  const row = await prisma.capitalCall.findUnique({
    where: { id },
    select: { id: true, status: true, fundId: true, noticesSentAt: true },
  });
  if (!row) {
    console.error("Capital call not found:", id);
    process.exitCode = 1;
    return;
  }

  const data: { noticesSentAt: null; status?: string } = { noticesSentAt: null };
  if (row.status === "NOTICES_SENT") {
    data.status = "INITIATED";
  }

  await prisma.capitalCall.update({ where: { id }, data });
  console.log("Updated", id, data);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
