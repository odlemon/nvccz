/**
 * FINDING-017 verification — access register, document vault, pay-calendar periods.
 *
 * Expected status codes are NOT hardcoded per persona. Each persona's own
 * GET /payroll/me/access decides what it should be allowed to do, so a grant change
 * cannot make this probe pass for the wrong reason. The roster is then reconciled
 * against the raw role JSON in the database, the way money is reconciled by hand.
 *
 * Synthetic data only: every document is a generated text file labelled as synthetic,
 * and every row, stored file and calendar period the probe creates is removed at the end.
 * Audit events are left in place — the trail is meant to be immutable.
 *
 * Run:  node scripts/_uat/payroll-access-vault-probe.mjs
 * Exit: 0 = every check passed, 1 = at least one failed
 */
import "dotenv/config"
import { createHash } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import pkg from "@prisma/client"

const { PrismaClient } = pkg
const prisma = new PrismaClient()
const API = process.env.UAT_API || "http://127.0.0.1:3009/api"
const PASSWORD = "admin123"
const MOCK_ROOT = path.resolve("storage/local-upload-mock")

const PERSONAS = [
  "perf.sysadmin@nts.local",
  "perf.exec@nts.local",
  "perf.hr@nts.local",
  "perf.deptmgr@nts.local",
  "perf.employee@nts.local",
]
const FIXTURE_NAMES = ["Tariro Moyo", "Rudo Sibanda", "Tawanda Chirenje", "Precious Ncube", "Kudzai Maseko"]

let pass = 0
let fail = 0
const check = (ok, label, detail = "") => {
  if (ok) pass += 1
  else fail += 1
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? " — " + detail : ""}`)
}

const createdDocIds = new Set()
const createdPeriods = []

async function login(email) {
  const r = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, portal: "staff" }),
  })
  const j = await r.json().catch(() => ({}))
  return j.token || j?.data?.token || null
}

const auth = (token) => (token ? { Authorization: `Bearer ${token}` } : {})

async function call(method, url, token, body) {
  const init = { method, headers: { ...auth(token) } }
  if (body instanceof FormData) init.body = body
  else if (body !== undefined) {
    init.headers["Content-Type"] = "application/json"
    init.body = JSON.stringify(body)
  }
  const r = await fetch(`${API}${url}`, init)
  const buf = Buffer.from(await r.arrayBuffer())
  let json = null
  try {
    json = JSON.parse(buf.toString("utf8"))
  } catch {}
  return { status: r.status, json, buf, headers: r.headers }
}

function synthetic(label) {
  const text = `SYNTHETIC UAT DOCUMENT - not real payroll data.\nProbe: ${label}\nAt: ${new Date().toISOString()}\n`
  return Buffer.from(text, "utf8")
}

function uploadForm(buf, filename, fields = {}) {
  const form = new FormData()
  if (buf) form.append("file", new Blob([buf], { type: "text/plain" }), filename)
  for (const [k, v] of Object.entries(fields)) form.append(k, v)
  return form
}

const sha = (b) => createHash("sha256").update(b).digest("hex")

async function main() {
  const payGroup = await prisma.payrollPayGroup.findFirst({ orderBy: { name: "asc" } })

  // -------------------------------------------------------------- unauthenticated
  console.log("\n=== unauthenticated ===")
  for (const [m, u] of [["GET", "/payroll/access/roster"], ["GET", "/payroll/documents"], ["POST", "/payroll/documents"], ["GET", "/payroll/documents/x/download"]]) {
    const r = await call(m, u, null)
    check(r.status === 401, `${m} ${u} refused without a token`, `got ${r.status}`)
  }

  // ------------------------------------------------------------------ per persona
  let adminToken = null
  let adminDoc = null
  let adminBytes = null

  for (const email of PERSONAS) {
    console.log(`\n=== ${email} ===`)
    const token = await login(email)
    if (!token) {
      check(false, "sign in", "login failed — persona missing or password changed")
      continue
    }
    const me = await call("GET", "/payroll/me/access", token)
    const perms = new Set(me.json?.data?.permissions ?? [])
    const has = (...p) => p.some((x) => perms.has(x))
    console.log(`  role: ${me.json?.data?.roleName ?? "?"} · ${perms.size} payroll grants`)

    const expRoster = has("payroll.access.view", "payroll.access.manage") ? 200 : 403
    const expView = has("payroll.vault.view", "payroll.vault.manage") ? 200 : 403
    const expUpload = has("payroll.vault.manage") ? 201 : 403
    const expCalendar = has("payroll.calendar.manage") ? 200 : 403

    const roster = await call("GET", "/payroll/access/roster", token)
    check(roster.status === expRoster, `roster ${expRoster}`, `got ${roster.status}`)

    const list = await call("GET", "/payroll/documents", token)
    check(list.status === expView, `document list ${expView}`, `got ${list.status}`)

    const bytes = synthetic(`upload by ${email}`)
    const up = await call("POST", "/payroll/documents", token, uploadForm(bytes, "uat-synthetic-control-pack.txt", {
      category: "Payroll control packs",
      classification: "RESTRICTED",
      periodLabel: "UAT probe",
    }))
    check(up.status === expUpload, `upload ${expUpload}`, `got ${up.status}${up.json?.message ? " " + up.json.message : ""}`)
    if (up.status === 201 && up.json?.data?.id) {
      createdDocIds.add(up.json.data.id)
      if (!adminDoc && email === "perf.sysadmin@nts.local") {
        adminDoc = up.json.data
        adminBytes = bytes
        adminToken = token
      }
    }

    if (payGroup) {
      const label = `UAT probe period ${email.split("@")[0]}`
      const put = await call("PUT", `/payroll/pay-groups/${payGroup.id}/periods`, token, {
        periodLabel: label,
        periodStart: "2031-01-01",
        periodEnd: "2031-01-31",
        cutoffDate: "2031-01-20",
        payDate: "2031-01-25",
        status: "PLANNED",
      })
      check(put.status === expCalendar, `calendar period upsert ${expCalendar}`, `got ${put.status}`)
      if (put.status === 200) createdPeriods.push({ payGroupId: payGroup.id, periodLabel: label })
    }

    // A document uploaded by the administrator, read by everyone else.
    if (adminDoc && email !== "perf.sysadmin@nts.local") {
      const dl = await call("GET", `/payroll/documents/${adminDoc.id}/download`, token)
      check(dl.status === expView, `download admin's document ${expView}`, `got ${dl.status}`)
      if (dl.status === 200) check(sha(dl.buf) === sha(adminBytes), "downloaded bytes match the upload")
    }
  }

  if (!adminToken || !adminDoc) {
    check(false, "administrator upload available for the detailed checks")
    return
  }

  // ------------------------------------------------------------ detailed: register
  console.log("\n=== document register (administrator) ===")
  const list = await call("GET", "/payroll/documents", adminToken)
  const items = list.json?.data?.items ?? []
  const row = items.find((d) => d.id === adminDoc.id)
  check(Boolean(row), "uploaded document appears in the register")
  const leaked = items.filter((d) => "fileUrl" in d || "storagePath" in d)
  check(leaked.length === 0, "register carries no storage URL or path", `${leaked.length} row(s) leak`)
  check(row?.uploadedBy?.name && row.uploadedBy.name !== "Tariro Moyo", "uploader is the real signed-in user", row?.uploadedBy?.name)
  check(row?.classification === "RESTRICTED" && row?.category === "Payroll control packs", "category and classification stored as submitted")

  const dl = await call("GET", `/payroll/documents/${adminDoc.id}/download`, adminToken)
  check(dl.status === 200 && sha(dl.buf) === sha(adminBytes), "administrator download returns the exact bytes")
  check((dl.headers.get("content-disposition") || "").includes("attachment"), "download is served as an attachment")

  // -------------------------------------------------------- detailed: validation
  console.log("\n=== validation ===")
  const noFile = await call("POST", "/payroll/documents", adminToken, uploadForm(null, "", { category: "Payroll control packs" }))
  check(noFile.status === 400, "upload without a file is refused", `got ${noFile.status}`)
  const badCat = await call("POST", "/payroll/documents", adminToken, uploadForm(synthetic("bad category"), "uat-synthetic.txt", { category: "Holiday photos" }))
  check(badCat.status === 400, "unknown category is refused", `got ${badCat.status}`)
  if (badCat.status === 201) createdDocIds.add(badCat.json?.data?.id)
  const badCls = await call("POST", "/payroll/documents", adminToken, uploadForm(synthetic("bad class"), "uat-synthetic.txt", { category: "Payroll control packs", classification: "TOP_SECRET" }))
  check(badCls.status === 400, "unknown classification is refused", `got ${badCls.status}`)
  if (badCls.status === 201) createdDocIds.add(badCls.json?.data?.id)
  const big = await call("POST", "/payroll/documents", adminToken, uploadForm(Buffer.alloc(21 * 1024 * 1024, 65), "uat-synthetic-large.txt", { category: "Payroll control packs" }))
  check(big.status === 400, "file over 20MB is refused", `got ${big.status}`)
  if (big.status === 201) createdDocIds.add(big.json?.data?.id)
  const missing = await call("GET", "/payroll/documents/does-not-exist/download", adminToken)
  check(missing.status === 404, "unknown document id returns 404", `got ${missing.status}`)

  // --------------------------------------- detailed: missing file is audited too
  console.log("\n=== stored file missing ===")
  const orphanBytes = synthetic("file removed from storage")
  const orphan = await call("POST", "/payroll/documents", adminToken, uploadForm(orphanBytes, "uat-synthetic-orphan.txt", { category: "Access reviews" }))
  if (orphan.status === 201) {
    createdDocIds.add(orphan.json.data.id)
    const stored = await prisma.payrollDocument.findUnique({ where: { id: orphan.json.data.id }, select: { storagePath: true } })
    const onDisk = stored?.storagePath ? path.join(MOCK_ROOT, stored.storagePath) : null
    if (onDisk && fs.existsSync(onDisk)) fs.unlinkSync(onDisk)
    check(Boolean(onDisk), "synthetic file located in local storage", onDisk ?? "no storagePath")
    const gone = await call("GET", `/payroll/documents/${orphan.json.data.id}/download`, adminToken)
    check(gone.status === 404 && gone.json?.code === "DOCUMENT_FILE_MISSING", "missing stored file returns 404 DOCUMENT_FILE_MISSING", `got ${gone.status} ${gone.json?.code ?? ""}`)
  } else {
    check(false, "orphan-file setup upload", `got ${orphan.status}`)
  }

  // ------------------------------------------------------------ detailed: audit
  console.log("\n=== audit trail ===")
  const audit = async (id) => (await call("GET", `/payroll/audit?limit=100&entityId=${encodeURIComponent(id)}`, adminToken)).json?.data ?? []
  const events = (await audit(adminDoc.id)).map((e) => e.action)
  check(events.includes("DOCUMENT_UPLOADED"), "upload recorded", events.join(","))
  check(events.includes("DOCUMENT_DOWNLOADED"), "download recorded")
  if (orphan.status === 201) {
    const orphanEvents = (await audit(orphan.json.data.id)).map((e) => e.action)
    check(orphanEvents.includes("DOCUMENT_DOWNLOAD_FAILED"), "failed download recorded", orphanEvents.join(","))
  }

  // ----------------------------------------------------------- detailed: roster
  console.log("\n=== access register (administrator) ===")
  const roster = (await call("GET", "/payroll/access/roster", adminToken)).json?.data
  const users = roster?.users ?? []
  check(users.length > 0, "register lists users", String(users.length))
  const fixtures = users.filter((u) => FIXTURE_NAMES.includes(u.name))
  check(fixtures.length === 0, "no vendored demo person on the register", fixtures.map((u) => u.name).join(", "))
  check(users.every((u) => u.permissions.length > 0), "every listed user holds at least one payroll grant")
  check(roster.summary.usersWithPayrollAccess === users.length, "summary count equals listed users")
  check(roster.summary.selfApprovalConflicts === users.filter((u) => u.selfApproval).length, "self-approval count equals flagged users")
  const enrolled = users.filter((u) => u.mfaEnrolled).length
  check(roster.summary.mfaEnrolled === enrolled, "MFA enrolled count equals flagged users", `${enrolled}`)
  const admin = users.find((u) => u.email === "perf.sysadmin@nts.local")
  check(Boolean(admin?.selfApproval), "System Administrator is flagged self-approval exempt (FINDING-001)")
  const sysRole = roster.roles.find((r) => r.name === "System Administrator")
  check(sysRole?.permissions.length === roster.permissions.length, "System Administrator role holds every payroll grant in the matrix", `${sysRole?.permissions.length}/${roster.permissions.length}`)
  check(!("password" in (users[0] ?? {})), "register carries no credential fields")

  // Reconcile against raw role JSON, not against the service's own helper.
  const dbUsers = await prisma.user.findMany({ select: { id: true, role: { select: { permissions: true } } } })
  const rawIds = new Set(
    dbUsers
      .filter((u) => Array.isArray(u.role?.permissions) && u.role.permissions.some((p) => String(p?.name).startsWith("payroll.") && p?.value === true))
      .map((u) => u.id),
  )
  const listed = new Set(users.map((u) => u.id))
  const onlyDb = [...rawIds].filter((id) => !listed.has(id))
  const onlyApi = [...listed].filter((id) => !rawIds.has(id))
  check(onlyDb.length === 0 && onlyApi.length === 0, "register reconciles with raw role grants", `db-only ${onlyDb.length}, api-only ${onlyApi.length}`)
}

try {
  await main()
} catch (err) {
  check(false, "probe ran to completion", err?.stack ?? String(err))
} finally {
  // ------------------------------------------------------------------ cleanup
  let files = 0
  for (const id of createdDocIds) {
    if (!id) continue
    const d = await prisma.payrollDocument.findUnique({ where: { id }, select: { storagePath: true } })
    if (d?.storagePath) {
      const p = path.join(MOCK_ROOT, d.storagePath)
      if (fs.existsSync(p)) {
        fs.unlinkSync(p)
        files += 1
      }
    }
    await prisma.payrollDocument.delete({ where: { id } }).catch(() => {})
  }
  for (const p of createdPeriods) {
    await prisma.payrollCalendarPeriod.deleteMany({ where: { payGroupId: p.payGroupId, periodLabel: p.periodLabel } })
  }
  console.log(`\ncleanup: ${createdDocIds.size} document row(s), ${files} stored file(s), ${createdPeriods.length} period(s) removed`)
  await prisma.$disconnect()
  console.log(`\n=== RESULT === ${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}
