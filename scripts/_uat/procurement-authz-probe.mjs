/**
 * Who can do what on the procurement API — measured, not read from the code.
 *
 * Every procurement router is mounted with `authenticate` only; any role logic lives inside
 * controller methods. So this calls each endpoint as each persona and records the status.
 *
 * Writes are sent with an empty body, and :id routes with an id that does not exist, so
 * nothing valid should be created. The status says how far a request got:
 *
 *   401            no token accepted
 *   403            refused on role or portal       <- the only answer that proves a gate
 *   400/404/409/422  reached the handler's own validation or lookup, i.e. NOT gated first
 *   2xx            allowed
 *
 * Anything a write creates regardless is deleted at the end.
 *
 * Personas: seeded by scripts/seed-procurement-test-users.ts and the performance/payroll seeds.
 *
 * Run:  node scripts/_uat/procurement-authz-probe.mjs [--json=<file>]
 */
import fs from "node:fs"
import { PrismaClient } from "@prisma/client"

const API = process.env.API || "http://127.0.0.1:3009/api"
const PASSWORD = "admin123"
const FAKE = "probe-does-not-exist"
const jsonArg = process.argv.find((a) => a.startsWith("--json="))?.slice(7)

const PERSONAS = [
  ["sysadmin", "perf.sysadmin@nts.local", "staff"],
  ["proc-mgr", "proc.mgr@nts.local", "staff"],
  ["proc-off", "proc.officer@nts.local", "staff"],
  ["buyer", "proc.buyer@nts.local", "staff"],
  ["requester", "proc.requester@nts.local", "staff"],
  ["dept-head", "perf.deptmgr@nts.local", "staff"],
  ["ap", "proc.ap@nts.local", "staff"],
  ["fin-mgr", "payroll.finmgr@nts.local", "staff"],
  ["auditor", "payroll.intaudit@nts.local", "staff"],
  ["lp-extern", "lp.test@arcus.co.zw", "lp"],
  ["no-token", null, null],
]

// [label, method, path, body]  — body undefined for GET
const ENDPOINTS = [
  ["list requisitions", "GET", "/procurement/requisitions"],
  ["my requisitions", "GET", "/procurement/requisitions/my"],
  ["dept approval queue", "GET", "/procurement/requisitions/pending-approval"],
  ["list POs", "GET", "/procurement/purchase-orders"],
  ["list RFQs", "GET", "/procurement/rfq"],
  ["list GRNs", "GET", "/procurement/goods-received-notes"],
  ["list proc invoices", "GET", "/procurement/invoices"],
  ["list payments", "GET", "/procurement/payments"],
  ["dashboard", "GET", "/procurement/dashboard"],
  ["list vendors", "GET", "/accounting/vendors"],
  ["list quotations", "GET", "/vendor-quotations"],
  ["approval configs", "GET", "/procurement-approval-configs"],
  ["suite06 intakes", "GET", "/procurement/suite06/intakes"],
  ["suite06 CFO dashboard", "GET", "/procurement/suite06/cfo-dashboard"],
  ["create requisition", "POST", "/procurement/requisitions", {}],
  ["approve requisition", "PUT", `/procurement/requisitions/${FAKE}/approve`, {}],
  ["reject requisition", "PUT", `/procurement/requisitions/${FAKE}/reject`, {}],
  ["create RFQ", "POST", "/procurement/rfq", {}],
  ["award RFQ", "POST", `/procurement/rfqs/${FAKE}/award`, {}],
  ["create PO", "POST", "/procurement/purchase-orders", {}],
  ["send PO", "POST", `/procurement/purchase-orders/${FAKE}/send`, {}],
  ["PO to bill", "POST", `/procurement/purchase-orders/${FAKE}/convert-to-bill`, {}],
  ["create GRN", "POST", "/procurement/goods-received-notes", {}],
  ["approve GRN", "PUT", `/procurement/goods-received-notes/${FAKE}/approve`, {}],
  ["approve proc invoice", "PUT", `/procurement/invoices/${FAKE}/approve`, {}],
  ["pay proc invoice", "POST", `/procurement/invoices/${FAKE}/payment`, {}],
  ["create vendor", "POST", "/accounting/vendors", {}],
  ["create approval config", "POST", "/procurement-approval-configs", {}],
]

async function login(email, portal) {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, portal }),
  })
  const body = await res.json().catch(() => ({}))
  return body.token || body?.data?.token || null
}

const tokens = {}
for (const [key, email, portal] of PERSONAS) {
  tokens[key] = email ? await login(email, portal) : null
  if (email && !tokens[key]) console.log(`  (login failed for ${key} ${email} — column will read 401)`)
}

const created = [] // [path, id]
const matrix = []
for (const [label, method, path, body] of ENDPOINTS) {
  const row = { label, method, path, cells: {} }
  for (const [key] of PERSONAS) {
    const headers = { "Content-Type": "application/json" }
    if (tokens[key]) headers.Authorization = `Bearer ${tokens[key]}`
    let status = 0
    try {
      const res = await fetch(`${API}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
      status = res.status
      if (method !== "GET" && status >= 200 && status < 300) {
        const j = await res.json().catch(() => ({}))
        const id = j?.data?.id || j?.id
        if (id) created.push([path, id])
      }
    } catch {
      status = -1
    }
    row.cells[key] = status
  }
  matrix.push(row)
}

const keys = PERSONAS.map(([k]) => k)
const pad = (s, n) => String(s).padEnd(n)
console.log(`\n${pad("endpoint", 26)}${keys.map((k) => pad(k, 10)).join("")}`)
for (const r of matrix) console.log(`${pad(r.label, 26)}${keys.map((k) => pad(r.cells[k], 10)).join("")}`)

// What a gate should have refused, and did not.
const notDenied = (code) => code !== 401 && code !== 403 && code !== -1
const extern = matrix.filter((r) => notDenied(r.cells["lp-extern"]))
const auditorWrites = matrix.filter((r) => r.method !== "GET" && notDenied(r.cells.auditor))
const requesterWrites = matrix.filter((r) => r.method !== "GET" && !/create requisition/.test(r.label) && notDenied(r.cells.requester))
console.log(`\nexternal LP account not refused: ${extern.length}/${matrix.length}`)
for (const r of extern) console.log(`  ${r.cells["lp-extern"]}  ${r.method} ${r.path}`)
console.log(`internal auditor write not refused: ${auditorWrites.length}`)
for (const r of auditorWrites) console.log(`  ${r.cells.auditor}  ${r.method} ${r.path}`)
console.log(`requester (Operations member) non-PR write not refused: ${requesterWrites.length}`)
for (const r of requesterWrites) console.log(`  ${r.cells.requester}  ${r.method} ${r.path}`)

if (created.length) {
  const prisma = new PrismaClient()
  const model = (p) =>
    p.startsWith("/procurement/requisitions") ? prisma.purchaseRequisition
    : p.startsWith("/procurement/rfq") ? prisma.procurementRfq
    : p.startsWith("/procurement/purchase-orders") ? prisma.purchaseOrder
    : p.startsWith("/procurement/goods-received-notes") ? prisma.goodsReceivedNote
    : p.startsWith("/accounting/vendors") ? prisma.vendor
    : p.startsWith("/procurement-approval-configs") ? prisma.procurementApprovalConfig
    : null
  for (const [p, id] of created) {
    try {
      await model(p)?.delete({ where: { id } })
      console.log(`cleanup: deleted ${id} created by ${p}`)
    } catch (e) {
      console.log(`cleanup: FAILED to delete ${id} from ${p} — ${e.message.split("\n")[0]}`)
    }
  }
  await prisma.$disconnect()
} else {
  console.log("cleanup: nothing was created")
}

if (jsonArg) fs.writeFileSync(jsonArg, JSON.stringify({ at: new Date().toISOString(), personas: PERSONAS.map(([k, e]) => [k, e]), matrix }, null, 2))
