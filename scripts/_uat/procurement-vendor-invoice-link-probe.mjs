// Procurement: end-to-end check of the vendor PO invoice link (no mail: local MAIL_REDIRECT_ENFORCE blocks it).
//   GET  /procurement/vendor-portal/purchase-order?token=   (new public endpoint)
//   POST /procurement/invoices with the token, against a DELIVERED / PARTIALLY_DELIVERED PO
// Signs tokens exactly like src/utils/vendorPortalToken.ts, with the local API's secret.
import crypto from "node:crypto"
import fs from "node:fs"

const API = process.env.API || "http://127.0.0.1:3009/api"
// Run from the nvccz repo root; reads the same .env the local API uses.
const ENV = fs.readFileSync(process.env.ENV_FILE || ".env", "utf8")
const envVal = (k) => {
  const m = ENV.match(new RegExp(`^${k}=(.*)$`, "m"))
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : ""
}
const SECRET = envVal("VENDOR_PORTAL_TOKEN_SECRET") || envVal("JWT_SECRET")
if (!SECRET) throw new Error("no signing secret in nvccz/.env")
const sign = (payload) => {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")
  return `${body}.${crypto.createHmac("sha256", SECRET).update(body).digest("base64url")}`
}
const exp = Math.floor(Date.now() / 1000) + 3600
const SUBMIT = process.argv.includes("--submit")

let failures = 0
const check = (ok, label, detail = "") => {
  if (!ok) failures++
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`)
}

const login = await fetch(`${API}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "proc.mgr@nts.local", password: "admin123", portal: "staff" }),
}).then((r) => r.json())
const staffToken = login.token || login?.data?.token
if (!staffToken) throw new Error(`login failed: ${JSON.stringify(login).slice(0, 200)}`)

const poList = await fetch(`${API}/procurement/purchase-orders?limit=200`, { headers: { Authorization: `Bearer ${staffToken}` } }).then((r) => r.json())
const pos = poList?.data?.purchaseOrders || poList?.data?.items || poList?.data || poList?.purchaseOrders || []
console.log(`purchase orders: ${pos.length} — ${[...new Set(pos.map((p) => p.status))].join(", ")}`)
const delivered = pos.find((p) => ["DELIVERED", "PARTIALLY_DELIVERED"].includes(p.status))
const anyOther = pos.find((p) => p !== delivered && p.vendorId)
if (!delivered) throw new Error("no delivered PO locally — run procurement-p2p-flow.mjs first")

const vendorId = delivered.vendorId || delivered.vendor?.id
const good = sign({ k: "PO_VENDOR_INVOICE", v: vendorId, p: delivered.id, exp })

const get = async (token) => {
  const r = await fetch(`${API}/procurement/vendor-portal/purchase-order?token=${encodeURIComponent(token)}`)
  return { status: r.status, body: await r.json().catch(() => ({})) }
}

const ok = await get(good)
check(ok.status === 200 && ok.body?.data?.poNumber === delivered.poNumber, "GET resolves the PO", `${ok.status} ${delivered.poNumber} ${delivered.status}`)
const d = ok.body?.data || {}
check(d.openForInvoice === true, "delivered PO is open for invoices", `openForInvoice=${d.openForInvoice}`)
check(Array.isArray(d.items) && d.items.length > 0 && d.items.every((i) => typeof i.unitPrice === "number"), "lines come back numeric", `${d.items?.length} line(s)`)
check(typeof d.vatPercent === "number", "vatPercent present", String(d.vatPercent))
check(!("vendorId" in d) && !("id" in d), "no internal ids on the header")
console.log(`   currency=${d.currency?.code} total=${d.totalAmount} invoices=${d.invoices?.length} received=${d.items?.map((i) => i.quantityReceived).join("/")}`)

if (anyOther) {
  const wrongVendor = await get(sign({ k: "PO_VENDOR_INVOICE", v: "not-this-vendor", p: delivered.id, exp }))
  check(wrongVendor.status === 404, "token for another vendor is refused", String(wrongVendor.status))
}
const rfqKind = await get(sign({ k: "RFQ_SUBMIT", v: vendorId, r: "x", exp }))
check(rfqKind.status === 400, "RFQ token is refused", String(rfqKind.status))
const expired = await get(sign({ k: "PO_VENDOR_INVOICE", v: vendorId, p: delivered.id, exp: Math.floor(Date.now() / 1000) - 5 }))
check(expired.status === 400 && /expired/i.test(expired.body?.message || ""), "expired token is refused", `${expired.status} ${expired.body?.message}`)

console.log(`\nTOKEN_FOR_UI ${good}`)

if (SUBMIT) {
  const items = d.items.map((i) => ({ itemName: i.itemName, description: i.description, unit: i.unit, quantity: i.quantityReceived > 0 ? i.quantityReceived : i.quantity, unitPrice: i.unitPrice }))
  const due = new Date(Date.now() + 30 * 864e5).toISOString()
  const r = await fetch(`${API}/procurement/invoices`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vendorPortalToken: good, dueDate: due, currencyId: d.currency?.id, items }),
  })
  const j = await r.json().catch(() => ({}))
  check(r.status === 201, "vendor invoice on a delivered PO is accepted", `${r.status} ${j?.data?.invoiceNumber || j?.message}`)
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed")
process.exit(failures ? 1 : 0)
