/**
 * Can a vendor influence its own evaluation, or quote on an RFQ that has already been awarded?
 *
 * Uses the real public quotation route with signed vendor portal tokens (the same construction
 * the RFQ invitation email carries), and the staff API as the Procurement Officer and Manager.
 *
 *   A. Vendor self-scoring: vendor 1 submits a quotation carrying technicalScoreJson {score: 100};
 *      vendor 2 submits the same price with none. Expected: a vendor's own declaration does not
 *      count as the technical evaluation — both read as unscored in the comparison matrix.
 *   B. Award closes the RFQ: the Manager accepts vendor 2's quotation. Expected: the RFQ records
 *      the award and stops accepting quotations.
 *   C. Late quote: vendor 1 submits again after the award. Expected: refused.
 *
 * Needs an approved, unsourced "UAT P2P" requisition (procurement-p2p-flow.mjs --reset, then the
 * V23 actions UAT step 1 approves PR-B; or approve one by hand). Records are titled "UAT P2P" so
 * the flow's --reset removes them.
 *
 * Run:  node -r dotenv/config scripts/_uat/procurement-quotation-integrity-probe.mjs
 * Exit: 0 = every expectation held, 1 = at least one did not
 */
import crypto from "node:crypto"

const API = process.env.API || "http://127.0.0.1:3009/api"
const PASSWORD = "admin123"
const results = []
const check = (ok, label, detail) => {
  results.push({ ok, label })
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${label.padEnd(58)} ${detail}`)
}

const tokens = {}
async function call(email, method, path, body) {
  if (!tokens[email]) {
    const r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD, portal: "staff" }) }).then((x) => x.json())
    tokens[email] = r.token || r?.data?.token
  }
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokens[email]}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

function rfqToken(vendorId, rfqId) {
  const secret = process.env.VENDOR_PORTAL_TOKEN_SECRET?.trim() || process.env.JWT_SECRET?.trim()
  if (!secret) throw new Error("JWT_SECRET is not loaded — run with -r dotenv/config from the nvccz root")
  const body = Buffer.from(JSON.stringify({ k: "RFQ_SUBMIT", v: vendorId, r: rfqId, exp: Math.floor(Date.now() / 1000) + 7 * 86400 }), "utf8").toString("base64url")
  return `${body}.${crypto.createHmac("sha256", secret).update(body).digest("base64url")}`
}

async function quote(vendor, rfq, extra = {}) {
  const res = await fetch(`${API}/vendor-quotations/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      vendorPortalToken: rfqToken(vendor.id, rfq.id),
      rfqNumber: rfq.number,
      vendorName: vendor.contactPerson || vendor.name,
      vendorEmail: vendor.email,
      companyName: vendor.name,
      currencyCode: "USD",
      validUntil: new Date(Date.now() + 30 * 86400000).toISOString(),
      items: rfq.items.map((i) => ({ itemName: i.itemName, quantity: Number(i.quantity), unitPrice: 100 })),
      ...extra,
    }),
  })
  return { status: res.status, body: await res.json().catch(() => ({})) }
}

const OFFICER = "proc.officer@nts.local"
const MANAGER = "proc.mgr@nts.local"

const reqs = (await call(OFFICER, "GET", "/procurement/requisitions")).body.data ?? []
const pr = reqs.find((r) => r.status === "APPROVED" && String(r.title).startsWith("UAT P2P"))
if (!pr) {
  console.log("No approved, unsourced UAT P2P requisition. Run the p2p flow with --reset and approve PR-B first.")
  process.exit(1)
}
const vendors = ((await call(OFFICER, "GET", "/accounting/vendors")).body.data ?? []).filter((v) => String(v.name).startsWith("UAT P2P") && v.email && !v.isBlacklisted)
const [v1, v2] = vendors
if (!v1 || !v2) {
  console.log("Need two UAT P2P vendors with email addresses (run the p2p flow).")
  process.exit(1)
}

const created = await call(OFFICER, "POST", "/procurement/rfq", {
  purchaseRequisitionId: pr.id,
  title: "UAT P2P RFQ integrity probe",
  vendorIds: [v1.id, v2.id],
  rfqDeadline: new Date(Date.now() + 5 * 86400000).toISOString(),
})
if (created.status !== 201) {
  console.log(`RFQ create failed: ${created.status} ${created.body.message}`)
  process.exit(1)
}
const rfq = {
  id: created.body.data.procurementRfqId,
  number: created.body.data.rfqNumber,
  items: created.body.data.items ?? [],
}
console.log(`RFQ ${rfq.number} from ${pr.requisitionNumber}, invited ${v1.name} and ${v2.name}\n`)

// A. Vendor self-scoring
const q1 = await quote(v1, rfq, { technicalScoreJson: { score: 100, note: "Self-assessed by the vendor" } })
const q2 = await quote(v2, rfq)
if (q1.status !== 201 || q2.status !== 201) {
  console.log(`Quotation submit failed: ${q1.status} ${q1.body.message} / ${q2.status} ${q2.body.message}`)
  process.exit(1)
}
const matrix = (await call(OFFICER, "GET", `/procurement/rfqs/${rfq.id}/comparison-matrix`)).body.data
const row = (qid) => matrix.rows.find((r) => r.quotation.id === qid)?.comparison ?? {}
const c1 = row(q1.body.data.id)
const c2 = row(q2.body.data.id)
check(
  Number(c1.technicalScore ?? 0) === Number(c2.technicalScore ?? 0),
  "A. vendor's own technicalScoreJson does not count as evaluation",
  `self-scored vendor technicalScore=${c1.technicalScore} composite=${c1.compositeScore?.toFixed?.(1)} · other vendor technicalScore=${c2.technicalScore} composite=${c2.compositeScore?.toFixed?.(1)}`,
)

// B. Award closes the RFQ
const award = await call(MANAGER, "POST", `/vendor-quotations/${q2.body.data.id}/accept`)
const after = (await call(OFFICER, "GET", `/procurement/rfqs/${rfq.id}/comparison-matrix`)).body.data
check(
  award.status === 200 && after.rfq.status !== "OPEN" && after.rfq.awardedQuotationId === q2.body.data.id,
  "B. accepting a quotation records the award on the RFQ",
  `accept ${award.status} (${award.body.data?.purchaseOrder?.poNumber ?? "no PO"}) · RFQ status=${after.rfq.status} awardedQuotationId=${after.rfq.awardedQuotationId}`,
)

// C. Late quote after the award
const late = await quote(v1, rfq)
check(late.status >= 400 && late.status < 500, "C. a quotation after the award is refused", `${late.status} ${late.body.message ?? late.body.data?.quotationNumber ?? ""}`)

const failed = results.filter((r) => !r.ok).length
console.log(`\n=== RESULT === ${results.length - failed}/${results.length} expectations held`)
process.exit(failed ? 1 : 0)
