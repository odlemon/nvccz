/**
 * Procurement — grant the procurement permission set to the roles that need it.
 *
 * Idempotent: only adds missing {name, value:true} entries to each role's `permissions` JSON.
 * It never removes, disables or reorders an existing entry, so a hand-tuned role keeps its
 * own choices — including an explicit `value: false`, which counts as present and is left
 * alone.
 *
 * Unlike the payroll migration this does not create roles. Every role named in
 * PROCUREMENT_ROLE_GRANTS exists wherever procurement is used; an absent one is reported so
 * it can be seeded deliberately rather than invented here with an empty description.
 *
 * Run:     npm run db:migrate:procurement-permissions
 * Verify:  npm run db:migrate:procurement-permissions -- --check   (exit 1 if grants are missing)
 *
 * Guards and grants are code + data coupled: a route behind requireAnyPermission([...]) with
 * no matching grant 403s every request. This must run before, or with, the guarded API.
 */
import { PrismaClient } from "@prisma/client"
import {
  ALL_PROCUREMENT_PERMISSIONS,
  PROCUREMENT_ROLE_GRANTS,
} from "../src/config/procurementPermissions"

const prisma = new PrismaClient()
const CHECK_ONLY = process.argv.includes("--check")

type PermEntry = { name: string; value: boolean }

function entries(value: unknown): PermEntry[] {
  if (!Array.isArray(value)) return []
  return value.filter((e): e is PermEntry => !!e && typeof (e as any).name === "string")
}

async function main() {
  console.log(`Procurement permissions migration${CHECK_ONLY ? " (check only, no writes)" : ""}`)
  console.log(`Catalogue: ${ALL_PROCUREMENT_PERMISSIONS.length} permissions\n`)

  const roles = await prisma.role.findMany({ select: { id: true, name: true, permissions: true } })
  const byLowerName = new Map(roles.map((r) => [String(r.name).toLowerCase(), r]))

  let rolesChanged = 0
  let grantsAdded = 0
  const absent: string[] = []

  for (const [roleName, wantedRaw] of Object.entries(PROCUREMENT_ROLE_GRANTS)) {
    const wanted = [...new Set(wantedRaw)]
    const role = byLowerName.get(roleName.toLowerCase())
    if (!role) {
      absent.push(roleName)
      console.log(`  ABSENT   "${roleName}" — ${wanted.length} grant(s) not assigned`)
      continue
    }

    const current = entries(role.permissions)
    const present = new Set(current.map((e) => e.name))
    const missing = wanted.filter((name) => !present.has(name))
    if (!missing.length) {
      console.log(`  ok       ${roleName} (${wanted.length} of ${wanted.length})`)
      continue
    }

    grantsAdded += missing.length
    console.log(`  ${CHECK_ONLY ? "MISSING " : "granted "} ${roleName}: +${missing.length}  ${missing.join(", ")}`)
    if (CHECK_ONLY) continue

    await prisma.role.update({
      where: { id: role.id },
      data: { permissions: [...current, ...missing.map((name) => ({ name, value: true }))] as any },
    })
    rolesChanged += 1
  }

  console.log(
    `\n${CHECK_ONLY ? "Would add" : "Added"} ${grantsAdded} grant(s)` +
      (CHECK_ONLY ? "" : ` across ${rolesChanged} role(s)`) +
      ".",
  )
  if (absent.length) console.log(`Absent roles, not created: ${absent.join(", ")}`)
  if (CHECK_ONLY && grantsAdded > 0) process.exitCode = 1
}

main()
  .catch((err) => {
    console.error("[failed]", err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
