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
  let createdRoles = 0
  const absent: string[] = []

  for (const [roleName, wanted] of Object.entries(PAYROLL_ROLE_GRANTS)) {
    let role = byLowerName.get(roleName.toLowerCase())
    if (!role) {
      // A role named here but absent from the database is the failure this script
      // exists to prevent, not something to skip past. PAYROLL_ROLE_GRANTS is the
      // module's statement of which roles it needs; "Payroll Manager" is the maker
      // in its segregation of duties and "Internal Auditor" its read-only reviewer,
      // and neither was ever seeded — so the maker side of maker-checker could not
      // be held by anyone, while this script reported success and exited 0.
      absent.push(roleName)
      if (CHECK_ONLY) {
        console.log(`  ABSENT  role does not exist: "${roleName}" (${wanted.length} grants unassignable)`)
        continue
      }
      const created = await prisma.role.create({
        data: {
          name: roleName,
          description: `${roleName} — created by the payroll permissions migration to match PAYROLL_ROLE_GRANTS.`,
          permissions: wanted.map((name) => ({ name, value: true })) as any,
        },
        select: { id: true, name: true, permissions: true },
      })
      console.log(`  CREATE  ${roleName} — role did not exist; created with ${wanted.length} grants`)
      byLowerName.set(roleName.toLowerCase(), created)
      role = created
      createdRoles += 1
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
    // An absent role is a failure, not a clean run. Reporting "all grants are in
    // place" while the maker role does not exist is how this went unnoticed.
    if (absent.length) {
      console.log(
        `${absent.length} role(s) named in PAYROLL_ROLE_GRANTS do not exist: ${absent.join(", ")}.`,
      )
      console.log("Re-run without --check to create them.")
    }
    if (missing) console.log(`${missing} grant(s) missing. Re-run without --check to apply.`)
    if (!absent.length && !missing) console.log("All payroll grants are in place.")
    process.exitCode = missing === 0 && absent.length === 0 ? 0 : 1
  } else {
    console.log(
      `Done. ${changed} role(s) updated${createdRoles ? `, ${createdRoles} role(s) created` : ""}.`,
    )
  }
}

main()
  .catch((e) => {
    console.error("Migration failed:", e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
