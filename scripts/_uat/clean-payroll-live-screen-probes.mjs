/**
 * Remove the synthetic records the FINDING-017 browser check creates.
 *
 * Deliberately narrow: only documents whose name starts "uat-synthetic" and only calendar
 * periods whose label starts "UAT ". Nothing else is matched, so it cannot touch a real
 * document or pay period. Audit events are left alone; the trail is meant to be immutable.
 *
 * Run: node scripts/_uat/clean-payroll-live-screen-probes.mjs
 */
import "dotenv/config"
import fs from "node:fs"
import path from "node:path"
import pkg from "@prisma/client"

const { PrismaClient } = pkg
const prisma = new PrismaClient()
const MOCK_ROOT = path.resolve("storage/local-upload-mock")

const docs = await prisma.payrollDocument.findMany({
  where: { name: { startsWith: "uat-synthetic" } },
  select: { id: true, name: true, storagePath: true },
})
let files = 0
for (const d of docs) {
  if (d.storagePath) {
    const p = path.join(MOCK_ROOT, d.storagePath)
    if (fs.existsSync(p)) {
      fs.unlinkSync(p)
      files += 1
    }
  }
}
const removedDocs = docs.length
  ? (await prisma.payrollDocument.deleteMany({ where: { id: { in: docs.map((d) => d.id) } } })).count
  : 0
const removedPeriods = (
  await prisma.payrollCalendarPeriod.deleteMany({ where: { periodLabel: { startsWith: "UAT " } } })
).count

console.log(`removed ${removedDocs} synthetic document row(s), ${files} stored file(s), ${removedPeriods} synthetic period(s)`)
await prisma.$disconnect()
