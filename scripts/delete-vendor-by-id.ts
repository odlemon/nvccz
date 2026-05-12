/**
 * Hard-delete one vendor by primary key and common blocking relations (UAT / mistaken registrations).
 *
 * Usage: npx ts-node -r dotenv/config scripts/delete-vendor-by-id.ts <vendorId>
 * Or:    npm run db:delete-vendor-by-id -- <vendorId>
 */
import { prisma } from "../src/utils/database";
import { runVendorHardDeleteInTx } from "./vendorHardDeleteTransaction";

async function main() {
  const id = String(process.argv[2] || "").trim();
  if (!id) {
    console.error("Usage: npx ts-node -r dotenv/config scripts/delete-vendor-by-id.ts <vendorId>");
    process.exitCode = 1;
    return;
  }

  const v = await prisma.vendor.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, registrationStatus: true, selfRegistered: true },
  });

  if (!v) {
    console.log(JSON.stringify({ ok: false, message: "Vendor not found", vendorId: id }, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log(JSON.stringify({ aboutToDelete: v }, null, 2));

  await prisma.$transaction(
    async (tx) => {
      await runVendorHardDeleteInTx(tx, id);
    },
    { timeout: 120_000, maxWait: 30_000 }
  );

  console.log(JSON.stringify({ ok: true, deletedVendorId: id }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
