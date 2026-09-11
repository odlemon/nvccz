/**
 * Procure-to-pay, end to end, through the real API as the people who would do each step.
 *
 * Builds the local working dataset for Procurement V23 and proves the backend flow at the
 * same time. Every record is created by the endpoint the UI will call, as the persona the
 * permission policy allows — nothing is inserted behind the API.
 *
 *   vendors        Procurement Officer registers three vendors
 *   PR-A           Operations member raises -> submits -> Operations head approves
 *   RFQ-A          Procurement Officer invites the three vendors
 *   quotations     each vendor submits through its signed portal token (the public route)
 *   award          Procurement Manager accepts the best quotation -> purchase order
 *   PO             Procurement Officer sends it (if accept left it in draft)
 *   GRN            Procurement Officer receives it -> Procurement Manager approves
 *   invoice        Accountant captures it -> Finance Manager approves
 *   payment        Accountant records payment             (only with --pay)
 *   PR-B           raised and submitted, left pending approval    (Approval Centre)
 *   PR-C           raised, submitted and approved, not yet sourced (ready for RFQ)
 *   RFQ-B          sent with two quotations in, not yet awarded   (Approval Centre award)
 *   RFQ-C          from PR-D, three quotations, unscored          (Bid Evaluation scoring and award)
 *   PR-E           raised and approved, not sourced               (tender builder)
 *
 * Records are labelled "UAT P2P" so nobody mistakes them for business data. Emails are not
 * sent locally: MAIL_REDIRECT_ENFORCE=true with no MAIL_REDIRECT_TO blocks every message.
 *
 * Run:  node -r dotenv/config scripts/_uat/procurement-p2p-flow.mjs [--pay] [--json=<file>]
 * Exit: 0 = every step returned what the flow needs, 1 = a step failed (the output says which)
 */
import crypto from "node:crypto"
import fs from "node:fs"

const API = process.env.API || "http://127.0.0.1:3009/api"
const PASSWORD = "admin123"
const PAY = process.argv.includes("--pay")
const RESET = process.argv.includes("--reset")
const jsonArg = process.argv.find((a) => a.startsWith("--json="))?.slice(7)
const RUN = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")

const PEOPLE = {
  requester: "proc.requester@nts.local", // Operations member
  deptHead: "perf.deptmgr@nts.local", // Operations HEAD
  officer: "proc.officer@nts.local",
  manager: "proc.mgr@nts.local",
  ap: "proc.ap@nts.local",
  finMgr: "payroll.finmgr@nts.local",
}

const out = { run: RUN, steps: [], ids: {} }
const tokens = {}

function log(ok, step, detail) {
  out.steps.push({ ok, step, detail })
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${step.padEnd(34)} ${detail}`)
}

function fail(step, res, body) {
  log(false, step, `${res.status} ${body?.message ?? JSON.stringify(body).slice(0, 300)}`)
  if (jsonArg) fs.writeFileSync(jsonArg, JSON.stringify(out, null, 2))
  process.exit(1)
}

async function call(who, method, path, body, { form } = {}) {
  const headers = { Authorization: `Bearer ${tokens[who]}` }
  if (!form) headers["Content-Type"] = "application/json"
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: form ?? (body === undefined ? undefined : JSON.stringify(body)),
  })
  const json = await res.json().catch(() => ({}))
  return { res, json, data: json?.data }
}

async function publicCall(method, path, body) {
  const res = await fetch(`${API}${path}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  return { res, json: await res.json().catch(() => ({})) }
}

/** Same construction as src/utils/vendorPortalToken.ts — base64url(JSON).base64url(HMAC-SHA256). */
function vendorRfqToken(vendorId, rfqId) {
  const secret = process.env.VENDOR_PORTAL_TOKEN_SECRET?.trim() || process.env.JWT_SECRET?.trim()
  if (!secret) throw new Error("JWT_SECRET is not loaded — run with -r dotenv/config from the nvccz root")
  const body = Buffer.from(JSON.stringify({ k: "RFQ_SUBMIT", v: vendorId, r: rfqId, exp: Math.floor(Date.now() / 1000) + 30 * 86400 }), "utf8").toString("base64url")
  return `${body}.${crypto.createHmac("sha256", secret).update(body).digest("base64url")}`
}

const daysFromNow = (n) => new Date(Date.now() + n * 86400000).toISOString()

// ------------------------------------------------------------------ sign in
for (const [who, email] of Object.entries(PEOPLE)) {
  const res = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD, portal: "staff" }) })
  const j = await res.json().catch(() => ({}))
  tokens[who] = j.token || j?.data?.token
  if (!tokens[who]) fail(`sign in ${who}`, res, j)
}
log(true, "sign in", Object.keys(PEOPLE).join(", "))

// ------------------------------------------------------------------ reset (--reset)
// Removes an earlier run's "UAT P2P" chain so a re-run does not stack duplicates. Children go
// first: GRN lines and invoices block their PO, the PO blocks its quotation. Vendors are kept
// and reused. A paid invoice carries ledger postings that are not ours to delete, so the
// reset refuses rather than orphan them.
if (RESET) {
  const { PrismaClient } = await import("@prisma/client")
  const prisma = new PrismaClient()
  try {
    const reqIds = (await prisma.purchaseRequisition.findMany({ where: { title: { startsWith: "UAT P2P" } }, select: { id: true } })).map((r) => r.id)
    const rfqIds = (await prisma.procurementRfq.findMany({ where: { OR: [{ title: { startsWith: "UAT P2P" } }, { requisitionId: { in: reqIds } }] }, select: { id: true } })).map((r) => r.id)
    const quoteIds = (await prisma.vendorQuotation.findMany({ where: { procurementRfqId: { in: rfqIds } }, select: { id: true } })).map((q) => q.id)
    const poIds = (await prisma.purchaseOrder.findMany({ where: { OR: [{ requisitionId: { in: reqIds } }, { quotationId: { in: quoteIds } }] }, select: { id: true } })).map((p) => p.id)
    const invoices = await prisma.procurementInvoice.findMany({ where: { purchaseOrderId: { in: poIds } }, select: { id: true, invoiceNumber: true, journalEntryId: true, cashbookEntryId: true } })
    const posted = invoices.filter((i) => i.journalEntryId || i.cashbookEntryId)
    if (posted.length) {
      log(false, "reset", `refused: ${posted.map((i) => i.invoiceNumber).join(", ")} already posted to the ledger`)
      process.exit(1)
    }
    const n = {
      invoices: (await prisma.procurementInvoice.deleteMany({ where: { id: { in: invoices.map((i) => i.id) } } })).count,
      grns: (await prisma.goodsReceivedNote.deleteMany({ where: { purchaseOrderId: { in: poIds } } })).count,
      pos: (await prisma.purchaseOrder.deleteMany({ where: { id: { in: poIds } } })).count,
      quotations: (await prisma.vendorQuotation.deleteMany({ where: { id: { in: quoteIds } } })).count,
      rfqs: (await prisma.procurementRfq.deleteMany({ where: { id: { in: rfqIds } } })).count,
      requisitions: (await prisma.purchaseRequisition.deleteMany({ where: { id: { in: reqIds } } })).count,
    }
    log(true, "reset", Object.entries(n).map(([k, v]) => `${k} ${v}`).join(", "))
  } finally {
    await prisma.$disconnect()
  }
}

// ------------------------------------------------------------------ vendors
const VENDORS = [
  { name: `UAT P2P Office Supplies Ltd`, category: "Office supplies", email: "uat.office@vendors.example.test", contactPerson: "Rudo Office", phone: "+263771000001", bpNumber: "UAT-BP-1001", vatNumber: "UAT-VAT-1001", paymentTerms: "Net 30" },
  { name: `UAT P2P Stationery World`, category: "Office supplies", email: "uat.stationery@vendors.example.test", contactPerson: "Tendai Paper", phone: "+263771000002", bpNumber: "UAT-BP-1002", vatNumber: "UAT-VAT-1002", paymentTerms: "Net 30" },
  { name: `UAT P2P Harare Furniture Co`, category: "Furniture", email: "uat.furniture@vendors.example.test", contactPerson: "Farai Wood", phone: "+263771000003", bpNumber: "UAT-BP-1003", vatNumber: "UAT-VAT-1003", paymentTerms: "Net 45" },
]
const list = await call("officer", "GET", "/accounting/vendors")
const existing = new Map((list.data ?? []).map((v) => [v.name, v]))
const vendorIds = []
for (const v of VENDORS) {
  if (existing.has(v.name)) {
    vendorIds.push(existing.get(v.name).id)
    continue
  }
  const r = await call("officer", "POST", "/accounting/vendors", v)
  if (r.res.status !== 201 && r.res.status !== 200) fail(`register vendor ${v.name}`, r.res, r.json)
  vendorIds.push(r.data.id)
}
out.ids.vendors = vendorIds
log(true, "vendors", `${vendorIds.length} (${existing.size ? "reused where present" : "registered"})`)

// ------------------------------------------------------------------ requisitions
async function raiseRequisition(label, items) {
  const r = await call("requester", "POST", "/procurement/requisitions", {
    title: `UAT P2P ${label}`,
    description: `Synthetic requisition for Procurement V23 testing (run ${RUN}).`,
    department: "Operations",
    priority: "MEDIUM",
    justification: "Replacement of worn office equipment for the Operations team.",
    items,
  })
  if (r.res.status !== 201) fail(`raise ${label}`, r.res, r.json)
  const s = await call("requester", "PUT", `/procurement/requisitions/${r.data.id}/submit`)
  if (s.res.status !== 200) fail(`submit ${label}`, s.res, s.json)
  return { id: r.data.id, number: r.data.requisitionNumber, status: s.data?.status }
}

const prA = await raiseRequisition("office chairs and desks", [
  { itemName: "Ergonomic office chair", quantity: 6, unit: "each" },
  { itemName: "Two-seat office desk", quantity: 3, unit: "each" },
])
log(true, "PR-A raised and submitted", `${prA.number} -> ${prA.status}`)
const apA = await call("deptHead", "PUT", `/procurement/requisitions/${prA.id}/approve`)
if (apA.res.status !== 200) fail("PR-A approve (Operations head)", apA.res, apA.json)
log(true, "PR-A approved", `${apA.data?.status}`)

const prB = await raiseRequisition("printer toner", [{ itemName: "Laser printer toner cartridge", quantity: 12, unit: "each" }])
log(true, "PR-B raised, left pending", `${prB.number} -> ${prB.status}`)

const prC = await raiseRequisition("meeting room screen", [{ itemName: "65-inch meeting room display", quantity: 1, unit: "each" }])
const apC = await call("deptHead", "PUT", `/procurement/requisitions/${prC.id}/approve`)
if (apC.res.status !== 200) fail("PR-C approve", apC.res, apC.json)
log(true, "PR-C approved, not sourced", `${prC.number} -> ${apC.data?.status}`)
out.ids.requisitions = { A: prA.id, B: prB.id, C: prC.id }

// ------------------------------------------------------------------ RFQ and quotations
async function sendRfq(label, prId, invite) {
  const r = await call("officer", "POST", "/procurement/rfq", {
    purchaseRequisitionId: prId,
    title: `UAT P2P RFQ ${label}`,
    description: "Quotations requested for the approved requisition.",
    vendorIds: invite,
    rfqDeadline: daysFromNow(10),
    expectedDeliveryDate: daysFromNow(21),
    deliveryAddress: "Operations, 1 Uat Road, Harare",
  })
  if (r.res.status !== 201 && r.res.status !== 200) fail(`send RFQ ${label}`, r.res, r.json)
  // The create response carries the persisted row's id as procurementRfqId, not id.
  if (!r.data?.procurementRfqId) fail(`send RFQ ${label}: no procurementRfqId in response`, r.res, r.json)
  return { id: r.data.procurementRfqId, number: r.data.rfqNumber }
}

async function quote(vendorIdx, rfq, prices) {
  const v = VENDORS[vendorIdx]
  const r = await publicCall("POST", "/vendor-quotations/submit", {
    vendorPortalToken: vendorRfqToken(vendorIds[vendorIdx], rfq.id),
    rfqNumber: rfq.number,
    vendorName: v.contactPerson,
    vendorEmail: v.email,
    companyName: v.name,
    currencyCode: "USD",
    paymentTerms: v.paymentTerms,
    deliveryTime: "10 business days",
    validUntil: daysFromNow(30),
    items: prices,
  })
  if (r.res.status !== 201 && r.res.status !== 200) fail(`quotation from ${v.name}`, r.res, r.json)
  return r.json.data
}

const rfqA = await sendRfq("office chairs and desks", prA.id, vendorIds)
log(true, "RFQ-A sent", `${rfqA.number} to ${vendorIds.length} vendors`)
const quotesA = [
  await quote(0, rfqA, [{ itemName: "Ergonomic office chair", quantity: 6, unitPrice: 180 }, { itemName: "Two-seat office desk", quantity: 3, unitPrice: 420 }]),
  await quote(1, rfqA, [{ itemName: "Ergonomic office chair", quantity: 6, unitPrice: 205 }, { itemName: "Two-seat office desk", quantity: 3, unitPrice: 395 }]),
  await quote(2, rfqA, [{ itemName: "Ergonomic office chair", quantity: 6, unitPrice: 240 }, { itemName: "Two-seat office desk", quantity: 3, unitPrice: 460 }]),
]
log(true, "RFQ-A quotations", quotesA.map((q) => `${q.quotationNumber ?? q.id} ${q.totalAmount}`).join(" · "))

const award = await call("manager", "POST", `/vendor-quotations/${quotesA[0].id}/accept`)
if (award.res.status !== 200) fail("award RFQ-A (accept quotation)", award.res, award.json)
const po = award.data?.purchaseOrder
if (!po?.id) fail("award created no purchase order", award.res, award.json)
log(true, "award -> purchase order", `${po.poNumber} ${po.status} total ${po.totalAmount}`)

if (po.status === "DRAFT") {
  const sent = await call("officer", "POST", `/procurement/purchase-orders/${po.id}/send`)
  if (sent.res.status !== 200) fail("send PO", sent.res, sent.json)
  log(true, "PO sent", `${sent.data?.status}`)
}

// ------------------------------------------------------------------ receiving
const poFull = await call("officer", "GET", `/procurement/purchase-orders/${po.id}`)
if (poFull.res.status !== 200) fail("read PO", poFull.res, poFull.json)
const poItems = poFull.data?.items ?? []
const grn = await call("officer", "POST", "/procurement/goods-received-notes", {
  purchaseOrderId: po.id,
  receivedDate: new Date().toISOString(),
  items: poItems.map((i) => ({ purchaseOrderItemId: i.id, quantityReceived: Number(i.quantity), quantityAccepted: Number(i.quantity), quantityRejected: 0 })),
})
if (grn.res.status !== 201 && grn.res.status !== 200) fail("record GRN", grn.res, grn.json)
log(true, "GRN recorded", `${grn.data?.grnNumber} ${grn.data?.status}`)
const grnOk = await call("manager", "PUT", `/procurement/goods-received-notes/${grn.data.id}/approve`, { qualityNotes: "All items inspected and accepted." })
if (grnOk.res.status !== 200) fail("approve GRN", grnOk.res, grnOk.json)
log(true, "GRN approved", `${grnOk.data?.status} quality ${grnOk.data?.qualityStatus}`)

// ------------------------------------------------------------------ invoice
// Staff capture of the supplier's invoice, as accounts payable (procurement.intake.manage).
const inv = await call("ap", "POST", "/procurement/invoices", {
  purchaseOrderId: po.id,
  vendorId: vendorIds[0],
  invoiceDate: new Date().toISOString(),
  dueDate: daysFromNow(30),
  currencyId: poFull.data?.currencyId ?? undefined,
  items: poItems.map((i) => ({ itemName: i.itemName, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice) })),
})
if (inv.res.status !== 201 && inv.res.status !== 200) fail("capture invoice", inv.res, inv.json)
log(true, "invoice captured", `${inv.data?.invoiceNumber} ${inv.data?.status} total ${inv.data?.totalAmount}`)
const invOk = await call("finMgr", "PUT", `/procurement/invoices/${inv.data.id}/approve`, { isTaxable: true })
if (invOk.res.status !== 200) fail("approve invoice", invOk.res, invOk.json)
log(true, "invoice approved", `${invOk.data?.status ?? invOk.data?.invoice?.status}`)
out.ids.chain = { rfq: rfqA.id, quotation: quotesA[0].id, po: po.id, grn: grn.data.id, invoice: inv.data.id }

if (PAY) {
  const form = new FormData()
  form.append("proofOfPayment", new Blob([Buffer.from("%PDF-1.4\n% UAT P2P synthetic proof of payment\n%%EOF\n")], { type: "application/pdf" }), "uat-proof-of-payment.pdf")
  form.append("paymentAmount", String(inv.data.totalAmount))
  form.append("paymentDate", new Date().toISOString())
  form.append("paymentMethod", "BANK")
  form.append("paymentReference", `UAT-P2P-${RUN}`)
  const paid = await call("ap", "POST", `/procurement/invoices/${inv.data.id}/payment`, undefined, { form })
  if (paid.res.status !== 200 && paid.res.status !== 201) fail("record payment", paid.res, paid.json)
  log(true, "payment recorded", `${JSON.stringify(paid.data).slice(0, 160)}`)
} else {
  log(true, "payment", "skipped (run with --pay)")
}

// ------------------------------------------------------------------ an RFQ still in evaluation
const rfqB = await sendRfq("meeting room screen", prC.id, vendorIds.slice(0, 2))
await quote(0, rfqB, [{ itemName: "65-inch meeting room display", quantity: 1, unitPrice: 1450 }])
await quote(1, rfqB, [{ itemName: "65-inch meeting room display", quantity: 1, unitPrice: 1390 }])
log(true, "RFQ-B left in evaluation", `${rfqB.number}, 2 quotations, not awarded`)
out.ids.rfqB = rfqB.id

// ------------------------------------------------------------------ an RFQ left for scoring and award in the UI
const prD = await raiseRequisition("filing cabinets", [{ itemName: "Four-drawer steel filing cabinet", quantity: 4, unit: "each" }])
const apD = await call("deptHead", "PUT", `/procurement/requisitions/${prD.id}/approve`)
if (apD.res.status !== 200) fail("PR-D approve", apD.res, apD.json)
const rfqC = await sendRfq("filing cabinets", prD.id, vendorIds)
await quote(0, rfqC, [{ itemName: "Four-drawer steel filing cabinet", quantity: 4, unitPrice: 310 }])
await quote(1, rfqC, [{ itemName: "Four-drawer steel filing cabinet", quantity: 4, unitPrice: 295 }])
await quote(2, rfqC, [{ itemName: "Four-drawer steel filing cabinet", quantity: 4, unitPrice: 340 }])
log(true, "RFQ-C left for UI scoring and award", `${rfqC.number}, 3 quotations, unscored`)
out.ids.rfqC = rfqC.id

// ------------------------------------------------------------------ an approved requisition for the UI tender builder
const prE = await raiseRequisition("projector lamps", [{ itemName: "Projector replacement lamp", quantity: 5, unit: "each" }])
const apE = await call("deptHead", "PUT", `/procurement/requisitions/${prE.id}/approve`)
if (apE.res.status !== 200) fail("PR-E approve", apE.res, apE.json)
log(true, "PR-E approved, left for the tender builder", `${prE.number} -> ${apE.data?.status}`)
out.ids.requisitions.D = prD.id
out.ids.requisitions.E = prE.id

console.log("\n=== RESULT === procure-to-pay completed through the API")
if (jsonArg) fs.writeFileSync(jsonArg, JSON.stringify(out, null, 2))
