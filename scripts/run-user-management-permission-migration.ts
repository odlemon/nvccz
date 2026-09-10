/**
 * Grant `manage_users` to the roles that administer user accounts.
 *
 * POST /api/users had no permission guard at all — `authenticate` was the only
 * middleware on userRoutes — so any authenticated account could create a user
 * and receive its temporary password. An INVESTEE account did exactly that.
 * The route is now guarded with requirePermission("manage_users").
 *
 * Guards and grants are code+data coupled: shipping the guard alone would 403
 * System Administrator, which legitimately creates users and did so before the
 * guard existed. Only the `admin` role held `manage_users`.
 *
 * Idempotent: only adds missing {name,value:true} entries, never removes or
 * reorders. Run with --check to verify without writing.
 *
 * Run:    npx ts-node --transpile-only scripts/run-user-management-permission-migration.ts
 * Verify: ... --check
 */
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
const CHECK_ONLY = process.argv.includes("--check")

const PERMISSION = "manage_users"

/**
 * Roles that administered users before the guard existed and must keep doing so.
 * Deliberately short: this permission creates accounts and assigns roles, so it
 * is granted to the platform administrator roles only. HR Manager is a plausible
 * future holder and is NOT added here — that is a product decision, not a
 * regression fix.
 */
const ROLES_NEEDING_IT = ["System Administrator", "admin"]

type PermEntry = { name: string; value: boolean }

function normalise(value: unknown): PermEntry[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((e): e is PermEntry => !!e && typeof (e as any).name === "string")
    .map((e) => ({ name: String(e.name), value: (e as any).value === true }))
}

async function main() {
  console.log(`manage_users grant migration${CHECK_ONLY ? " (check only, no writes)" : ""}\n`)

  const roles = await prisma.role.findMany({ select: { id: true, name: true, permissions: true } })
  const byLowerName = new Map(roles.map((r) => [String(r.name).toLowerCase(), r]))

  let missing = 0
  let changed = 0

  for (const roleName of ROLES_NEEDING_IT) {
    const role = byLowerName.get(roleName.toLowerCase())
    if (!role) {
      console.log(`  ABSENT  role does not exist: "${roleName}"`)
      missing += 1
      continue
    }

    const existing = normalise(role.permissions)
    const found = existing.find((e) => e.name === PERMISSION)
    if (found?.value === true) {
      console.log(`  OK      ${role.name} — already holds ${PERMISSION}`)
      continue
    }

    missing += 1
    console.log(`  ${CHECK_ONLY ? "MISS  " : "GRANT "}  ${role.name} — ${found ? "re-enable" : "add"} ${PERMISSION}`)
    if (CHECK_ONLY) continue

    const next = found
      ? existing.map((e) => (e.name === PERMISSION ? { ...e, value: true } : e))
      : [...existing, { name: PERMISSION, value: true }]

    await prisma.role.update({ where: { id: role.id }, data: { permissions: next as any } })
    changed += 1
  }

  console.log("")
  if (CHECK_ONLY) {
    console.log(missing === 0 ? "All grants in place." : `${missing} grant(s) missing. Re-run without --check.`)
    process.exitCode = missing === 0 ? 0 : 1
  } else {
    console.log(`Done. ${changed} role(s) updated.`)
  }
}

main()
  .catch((e) => {
    console.error("Migration failed:", e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
