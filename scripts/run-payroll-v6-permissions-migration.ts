/**
 * Payroll V6 — grant the payroll permission set to the roles that need it.
 *
 * Idempotent: re-running only adds missing {name,value:true} entries to each
 * role's `permissions` JSON and never removes or reorders existing grants.
 *
 * Run:  npm run db:migrate:payroll-v6-permissions
 * Verify: npm run db:migrate:payroll-v6-permissions -- --check
 *
 * This exists because guards and grants are code+data coupled: shipping
 * `requireAnyPermission([...])` without the matching grant 403s every request.
 */
import { PrismaClient } from "@prisma/client"
import {
  ALL_PAYROLL_PERMISSIONS,
  PAYROLL_ROLE_GRANTS,
} from "../src/config/payrollPermissions"

const prisma = new PrismaClient()
const CHECK_ONLY = process.argv.includes("--check")

type PermEntry = { name: string; value: boolean }

function normalise(value: unknown): PermEntry[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((e): e is PermEntry => !!e && typeof (e as any).name === "string")
    .map((e) => ({ name: String(e.name), value: (e as any).value === true }))
}

async function main() {
  console.log(
    `Payroll V6 permissions migration${CHECK_ONLY ? " (check only, no writes)" : ""}`,
  )
  console.log(`Catalogue: ${ALL_PAYROLL_PERMISSIONS.length} permissions\n`)

  const roles = await prisma.role.findMany({
    select: { id: true, name: true, permissions: true },
  })

  // Match role names case-insensitively so "admin" / "Admin" both resolve.
  const byLowerName = new Map(roles.map((r) => [String(r.name).toLowerCase(), r]))

  let changed = 0
  let missing = 0

  for (const [roleName, wanted] of Object.entries(PAYROLL_ROLE_GRANTS)) {
    const role = byLowerName.get(roleName.toLowerCase())
    if (!role) {
      console.log(`  SKIP  role not present in this database: "${roleName}"`)
      continue
    }

    const existing = normalise(role.permissions)
    const index = new Map(existing.map((e) => [e.name, e]))

    const toAdd: string[] = []
    const toEnable: string[] = []
    for (const name of wanted) {
      const found = index.get(name)
      if (!found) toAdd.push(name)
      else if (found.value !== true) toEnable.push(name)
    }

    if (toAdd.length === 0 && toEnable.length === 0) {
      console.log(`  OK    ${role.name} — all ${wanted.length} grants present`)
      continue
    }

    missing += toAdd.length + toEnable.length
    console.log(
      `  ${CHECK_ONLY ? "MISS " : "GRANT"} ${role.name} — +${toAdd.length} new, ${toEnable.length} re-enabled`,
    )
    if (toAdd.length) console.log(`          add: ${toAdd.join(", ")}`)
    if (toEnable.length) console.log(`          enable: ${toEnable.join(", ")}`)

    if (CHECK_ONLY) continue

    const next = existing.map((e) =>
      toEnable.includes(e.name) ? { ...e, value: true } : e,
    )
    for (const name of toAdd) next.push({ name, value: true })

    await prisma.role.update({
      where: { id: role.id },
      data: { permissions: next as any },
    })
    changed += 1
  }

  console.log("")
  if (CHECK_ONLY) {
    console.log(
      missing === 0
        ? "All payroll grants are in place."
        : `${missing} grant(s) missing. Re-run without --check to apply.`,
    )
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
