/**
 * Who can do what on the procurement API — measured against the intended policy.
 *
 * Every endpoint is called as every persona. Writes carry an empty body and :id routes an
 * id that does not exist, so nothing should be created; the status shows how far the
 * request got:
 *
 *   401   no token accepted
 *   403   refused on role or portal       <- the only answer that proves a gate
 *   other reached the handler (200, or its own 400/404/410)
 *
 * Each row names the personas the policy ALLOWS (src/config/procurementPermissions.ts and
 * the controller's own rules). A cell passes when an allowed persona gets past the gate
 * and a disallowed one gets 403. The external LP account must get 403 and no token 401
 * everywhere. Rows marked `null` are recorded but not asserted.
 *
 * A second section proves the gate with a VALID body: a purchase order raised by a role
 * that may not (expect 403) and by one that may (expect 201, then deleted).
 *
 * Personas: scripts/seed-procurement-test-users.ts plus the performance/payroll seeds, and
 * the procurement grants from `npm run db:migrate:procurement-permissions`.
 *
 * Run:  node scripts/_uat/procurement-authz-probe.mjs [--json=<file>]
 * Exit: 0 = every asserted cell matched the policy, 1 = at least one did not
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
const STAFF = PERSONAS.filter(([, e, p]) => p === "staff").map(([k]) => k)

// Allowed personas per grant, from the default grants.
const G = {
  dashboardView: ["sysadmin", "proc-mgr", "proc-off", "buyer", "ap", "fin-mgr", "auditor"],
  reqViewAll: ["sysadmin", "proc-mgr", "proc-off", "buyer", "fin-mgr", "auditor"],
  rfqView: ["sysadmin", "proc-mgr", "proc-off", "buyer", "fin-mgr", "auditor"],
  rfqManage: ["sysadmin", "proc-mgr", "proc-off", "buyer"],
  rfqAward: ["sysadmin", "proc-mgr"],
  quotationsView: ["sysadmin", "proc-mgr", "proc-off", "buyer", "fin-mgr", "auditor"],
  quotationsManage: ["sysadmin", "proc-mgr", "proc-off", "buyer"],
  ordersView: ["sysadmin", "proc-mgr", "proc-off", "buyer", "ap", "fin-mgr", "auditor"],
  ordersManage: ["sysadmin", "proc-mgr", "proc-off"],
  ordersSend: ["sysadmin", "proc-mgr", "proc-off"],
  receivingView: ["sysadmin", "proc-mgr", "proc-off", "buyer", "ap", "fin-mgr", "auditor"],
  receivingManage: ["sysadmin", "proc-mgr", "proc-off", "buyer"],
  receivingApprove: ["sysadmin", "proc-mgr"],
  invoicesView: ["sysadmin", "proc-mgr", "proc-off", "buyer", "ap", "fin-mgr", "auditor"],
  invoicesApprove: ["sysadmin", "fin-mgr"],
  invoicesPay: ["sysadmin", "ap"],
  vendorsView: ["sysadmin", "proc-mgr", "proc-off", "buyer", "ap", "fin-mgr", "auditor"],
  vendorsManage: ["sysadmin", "proc-mgr", "proc-off"],
  vendorsApprove: ["sysadmin", "proc-mgr", "fin-mgr"],
  vendorBanksView: ["sysadmin", "proc-mgr", "ap", "fin-mgr", "auditor"],
  vendorBanksManage: ["sysadmin", "fin-mgr"],
  intakeView: ["sysadmin", "proc-mgr", "proc-off", "ap", "fin-mgr", "auditor"],
  intakeManage: ["sysadmin", "ap"],
}
const any = (...lists) => [...new Set(lists.flat())]

// [label, method, path, body, allowed]   allowed: persona keys | "staff" | null (not asserted)
const ENDPOINTS = [
  ["list requisitions", "GET", "/procurement/requisitions", undefined, any(G.reqViewAll, ["dept-head"])],
  ["my requisitions", "GET", "/procurement/requisitions/my", undefined, "staff"],
  ["dept approval queue", "GET", "/procurement/requisitions/pending-approval", undefined, null],
  ["list POs", "GET", "/procurement/purchase-orders", undefined, G.ordersView],
  ["list RFQs", "GET", "/procurement/rfq", undefined, G.rfqView],
  ["list GRNs", "GET", "/procurement/goods-received-notes", undefined, G.receivingView],
  ["list proc invoices", "GET", "/procurement/invoices", undefined, G.invoicesView],
  ["list payments", "GET", "/procurement/payments", undefined, G.invoicesView],
  ["dashboard", "GET", "/procurement/dashboard", undefined, G.dashboardView],
  ["list vendors", "GET", "/accounting/vendors", undefined, "staff"],
  ["vendor banks", "GET", `/accounting/vendors/${FAKE}/banks`, undefined, G.vendorBanksView],
  ["vendor KYC docs", "GET", `/accounting/vendors/${FAKE}/kyc-documents`, undefined, G.vendorsView],
  ["list quotations", "GET", "/vendor-quotations", undefined, G.quotationsView],
  ["approval configs", "GET", "/procurement-approval-configs", undefined, "staff"],
  ["suite06 intakes", "GET", "/procurement/suite06/intakes", undefined, G.intakeView],
  ["suite06 CFO dashboard", "GET", "/procurement/suite06/cfo-dashboard", undefined, any(G.intakeView, G.invoicesApprove)],
  ["my procurement access", "GET", "/procurement/me/access", undefined, "staff"],
  ["create requisition", "POST", "/procurement/requisitions", {}, "staff"],
  ["approve requisition", "PUT", `/procurement/requisitions/${FAKE}/approve`, {}, "staff"],
  ["reject requisition", "PUT", `/procurement/requisitions/${FAKE}/reject`, {}, "staff"],
  ["create RFQ", "POST", "/procurement/rfq", {}, G.rfqManage],
  ["award RFQ (retired)", "POST", `/procurement/rfqs/${FAKE}/award`, {}, "staff"],
  ["accept quotation", "POST", `/vendor-quotations/${FAKE}/accept`, {}, G.rfqAward],
  ["reject quotation", "POST", `/vendor-quotations/${FAKE}/reject`, {}, G.quotationsManage],
  ["create PO", "POST", "/procurement/purchase-orders", {}, G.ordersManage],
  ["send PO", "POST", `/procurement/purchase-orders/${FAKE}/send`, {}, G.ordersSend],
  ["PO to bill", "POST", `/procurement/purchase-orders/${FAKE}/convert-to-bill`, {}, any(G.ordersManage, G.invoicesPay)],
  ["create GRN", "POST", "/procurement/goods-received-notes", {}, G.receivingManage],
  ["approve GRN", "PUT", `/procurement/goods-received-notes/${FAKE}/approve`, {}, G.receivingApprove],
  ["approve proc invoice", "PUT", `/procurement/invoices/${FAKE}/approve`, {}, G.invoicesApprove],
  ["pay proc invoice", "POST", `/procurement/invoices/${FAKE}/payment`, {}, G.invoicesPay],
  // Shared with the vendor portal: no token is a vendor submission, which needs its signed
  // vendorPortalToken (400), not a login (401).
  ["capture invoice (staff)", "POST", "/procurement/invoices", {}, G.intakeManage, { noToken: 400 }],
  ["create vendor", "POST", "/accounting/vendors", {}, "staff"],
  ["blacklist vendor", "POST", `/accounting/vendors/${FAKE}/blacklist`, {}, G.vendorsApprove],
  ["add vendor bank", "POST", `/accounting/vendors/${FAKE}/banks`, {}, G.vendorBanksManage],
  ["create approval config", "POST", "/procurement-approval-configs", {}, ["sysadmin"]],
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
  if (email && !tokens[key]) console.log(`  (login failed for ${key} ${email} — its column will read 401)`)
}

const expected = (allowed, key, status, opts = {}) => {
  if (key === "lp-extern") return status === 403
  if (key === "no-token") return status === (opts.noToken ?? 401)
  if (allowed === null) return true
  const ok = allowed === "staff" ? STAFF.includes(key) : allowed.includes(key)
  return ok ? status !== 401 && status !== 403 && status > 0 : status === 403
}

const created = []
const matrix = []
const failures = []
for (const [label, method, path, body, allowed, opts] of ENDPOINTS) {
  const row = { label, method, path, allowed, cells: {} }
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
    const pass = expected(allowed, key, status, opts)
    row.cells[key] = { status, pass }
    if (!pass) failures.push(`${label.padEnd(24)} ${key.padEnd(10)} got ${status}`)
  }
  matrix.push(row)
}

const keys = PERSONAS.map(([k]) => k)
const pad = (s, n) => String(s).padEnd(n)
console.log(`\n${pad("endpoint", 24)}${keys.map((k) => pad(k, 10)).join("")}`)
for (const r of matrix) {
  console.log(`${pad(r.label, 24)}${keys.map((k) => pad(r.cells[k].status + (r.cells[k].pass ? "" : "!"), 10)).join("")}`)
}

// Valid-body proof: a real PO, by a role the policy refuses and by one it allows.
const prisma = new PrismaClient()
const vendor = await prisma.vendor.findFirst({ where: { isBlacklisted: false }, select: { id: true } })
if (!vendor) console.log("  (no usable vendor in this database — the allowed persona will read 400, not 201)")
const validPo = { vendorId: vendor?.id, items: [{ itemName: "UAT SYNTHETIC authz probe line", quantity: 1, unitPrice: 1 }] }
console.log("\nvalid-body purchase order:")
for (const [key, want] of [["requester", 403], ["ap", 403], ["proc-off", 201]]) {
  const res = await fetch(`${API}/procurement/purchase-orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokens[key]}` },
    body: JSON.stringify(validPo),
  })
  const j = await res.json().catch(() => ({}))
  if (j?.data?.id) created.push(["/procurement/purchase-orders", j.data.id])
  const pass = res.status === want
  if (!pass) failures.push(`valid PO create         ${key.padEnd(10)} got ${res.status}, wanted ${want}`)
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${key.padEnd(10)} -> ${res.status} (wanted ${want}) ${j?.data?.poNumber ?? j?.message ?? ""}`)
}

for (const [p, id] of created) {
  try {
    if (p.startsWith("/procurement/purchase-orders")) {
      await prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } })
      await prisma.purchaseOrder.delete({ where: { id } })
    } else if (p.startsWith("/procurement/requisitions")) {
      await prisma.purchaseRequisitionItem.deleteMany({ where: { requisitionId: id } })
      await prisma.purchaseRequisition.delete({ where: { id } })
    } else if (p.startsWith("/procurement/rfq")) {
      await prisma.procurementRfq.delete({ where: { id } })
    } else if (p.startsWith("/procurement/goods-received-notes")) {
      await prisma.goodsReceivedNote.delete({ where: { id } })
    } else if (p.startsWith("/accounting/vendors")) {
      await prisma.vendor.delete({ where: { id } })
    } else if (p.startsWith("/procurement-approval-configs")) {
      await prisma.procurementApprovalConfig.delete({ where: { id } })
    }
    console.log(`cleanup: deleted ${id} (${p})`)
  } catch (e) {
    console.log(`cleanup: FAILED ${id} (${p}) — ${String(e.message).split("\n")[0]}`)
  }
}
await prisma.$disconnect()

console.log(`\n${failures.length === 0 ? "=== RESULT === every asserted cell matched the policy" : `=== RESULT === ${failures.length} cell(s) did not match the policy`}`)
for (const f of failures) console.log(`  FAIL  ${f}`)

if (jsonArg) fs.writeFileSync(jsonArg, JSON.stringify({ at: new Date().toISOString(), matrix, failures }, null, 2))
process.exit(failures.length ? 1 : 0)
