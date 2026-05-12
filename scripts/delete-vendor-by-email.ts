/**
 * One-off: hard-delete vendor row(s) matching email and common blocking relations.
 * Intended for UAT / mistaken portal registrations (minimal accounting linkage).
 *
 * Usage: npx ts-node -r dotenv/config scripts/delete-vendor-by-email.ts <email>
 */
import { prisma } from "../src/utils/database";
import { runVendorHardDeleteInTx } from "./vendorHardDeleteTransaction";

async function main() {
  const raw = String(process.argv[2] || "").trim();
  if (!raw || !raw.includes("@")) {
    console.error("Usage: npx ts-node -r dotenv/config scripts/delete-vendor-by-email.ts <email>");
    process.exitCode = 1;
    return;
  }
  const variants = Array.from(new Set([raw, raw.toLowerCase(), raw.toUpperCase()]));

  const vendors = await prisma.vendor.findMany({
    where: { email: { in: variants } },
    select: { id: true, name: true, email: true, registrationStatus: true },
  });

  if (!vendors.length) {
    console.log(JSON.stringify({ ok: true, message: "No vendors found", email: raw, deleted: 0 }, null, 2));
    return;
  }

  console.log(JSON.stringify({ found: vendors }, null, 2));

  for (const v of vendors) {
    const id = v.id;
    await prisma.$transaction(
      async (tx) => {
        await runVendorHardDeleteInTx(tx, id);
      },
      { timeout: 120_000, maxWait: 30_000 }
    );

    console.log(JSON.stringify({ deletedVendorId: id, name: v.name, email: v.email }, null, 2));
  }

  console.log(JSON.stringify({ ok: true, deletedCount: vendors.length }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
