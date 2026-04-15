/**
 * Adds accounting.period_lock.* permissions to roles that already have manage_accounting.
 * Idempotent. Run: npm run db:seed:period-lock-permissions
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TO_ADD = [
  { name: "accounting.period_lock.view", value: true },
  { name: "accounting.period_lock.manage", value: true },
  { name: "accounting.period_lock.override", value: true },
  { name: "accounting.period_lock.audit_view", value: true },
];

async function main() {
  const roles = await prisma.role.findMany();
  let updated = 0;
  for (const role of roles) {
    const perms = role.permissions as unknown;
    if (!Array.isArray(perms)) continue;
    const hasManage = perms.some(
      (p: any) => p && p.name === "manage_accounting" && p.value === true
    );
    if (!hasManage) continue;
    const names = new Set(perms.map((p: any) => p?.name).filter(Boolean));
    const merged = [...perms];
    for (const p of TO_ADD) {
      if (!names.has(p.name)) {
        merged.push({ ...p });
        names.add(p.name);
      }
    }
    if (merged.length === perms.length) continue;
    await prisma.role.update({
      where: { id: role.id },
      data: { permissions: merged as object[] },
    });
    updated++;
    console.log(`[ok] period-lock permissions merged into role: ${role.name}`);
  }
  console.log(`Done. Updated ${updated} role(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
