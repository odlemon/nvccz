// @ts-nocheck
/**
 * Stands in for the client's real Infor FMS SmartStream install while we
 * don't have access to it. SmartStream has no API (confirmed against Infor's
 * own implementation guides — see design-refs/procurement-v23/
 * SMARTSTREAM_INTEGRATION_DISCOVERY.md in nvccz-new) — every real-world
 * integration with it goes through a folder-based interface: files dropped
 * in, files picked up. This script plays the "SmartStream side" of that
 * exchange so the bridge-agent logic (bridge-agent.js) can be built and
 * proven end-to-end today, then pointed at the client's real drop folders
 * the moment we have access to them — nothing in bridge-agent.js should need
 * to change, only the folder paths / transport.
 *
 * The exact CSV columns below are a reasonable placeholder modelled on
 * standard AP-invoice-import layouts, NOT a confirmed SmartStream file
 * spec — that has to come from the client's SmartStream instance or Infor
 * support once we have access. Treat every column name here as provisional.
 *
 * Folders (under --dir, default ./mock-data):
 *   inbound/           bridge-agent drops invoice-export CSVs here
 *   outbound/          this script drops per-file "posting" acknowledgements
 *   outbound/payments/ this script drops simulated payment-run exports
 *
 * Run with: node mock-smartstream.js [--dir ./mock-data]
 */
const fs = require("fs");
const path = require("path");
const { parseCsv, toCsv } = require("./lib/csv");

const args = process.argv.slice(2);
const dirFlagIdx = args.indexOf("--dir");
const BASE_DIR = path.resolve(
  dirFlagIdx !== -1 && args[dirFlagIdx + 1] ? args[dirFlagIdx + 1] : path.join(__dirname, "mock-data")
);
const INBOUND = path.join(BASE_DIR, "inbound");
const OUTBOUND = path.join(BASE_DIR, "outbound");
const OUTBOUND_PAYMENTS = path.join(OUTBOUND, "payments");
const PROCESSED_LOG = path.join(BASE_DIR, ".processed.json");
const POLL_MS = 2000;
const PAYMENT_DELAY_MS = 15000; // simulate SmartStream running a payment batch ~15s after posting, for a fast demo loop

for (const dir of [BASE_DIR, INBOUND, OUTBOUND, OUTBOUND_PAYMENTS]) {
  fs.mkdirSync(dir, { recursive: true });
}

function loadProcessed() {
  try {
    return JSON.parse(fs.readFileSync(PROCESSED_LOG, "utf8"));
  } catch (e) {
    return {};
  }
}
function saveProcessed(processed) {
  fs.writeFileSync(PROCESSED_LOG, JSON.stringify(processed, null, 2));
}

let voucherSeq = 1;
function nextVoucherNumber() {
  const n = String(voucherSeq++).padStart(5, "0");
  return `SS-VCH-${n}`;
}

function postInvoiceFile(filePath, processed) {
  const raw = fs.readFileSync(filePath, "utf8");
  const rows = parseCsv(raw);
  console.log(`[mock-smartstream] picked up ${path.basename(filePath)} — ${rows.length} invoice row(s)`);

  const acks = [];
  const postedForPayment = [];

  for (const row of rows) {
    // A crude stand-in for SmartStream's own validation — reject anything
    // missing a vendor tax number, the way a real AP system would refuse an
    // invoice that can't be posted to a compliant vendor.
    if (!row.VendorTaxNumber || !row.VendorTaxNumber.trim()) {
      acks.push({
        OurInvoiceNumber: row.OurInvoiceNumber,
        SmartStreamVoucherNumber: "",
        Status: "REJECTED",
        Reason: "Vendor tax number missing",
      });
      continue;
    }
    const voucher = nextVoucherNumber();
    acks.push({
      OurInvoiceNumber: row.OurInvoiceNumber,
      SmartStreamVoucherNumber: voucher,
      Status: "POSTED",
      Reason: "",
    });
    postedForPayment.push({
      SmartStreamVoucherNumber: voucher,
      OurInvoiceNumber: row.OurInvoiceNumber,
      AmountPaid: row.TotalAmount,
      PaymentReference: `SS-PAY-${voucher}`,
    });
  }

  const ackPath = path.join(OUTBOUND, `ack_${path.basename(filePath, ".csv")}.csv`);
  fs.writeFileSync(
    ackPath,
    toCsv(["OurInvoiceNumber", "SmartStreamVoucherNumber", "Status", "Reason"], acks)
  );
  console.log(
    `[mock-smartstream] wrote ${path.basename(ackPath)} — ${acks.filter((a) => a.Status === "POSTED").length} posted, ${acks.filter((a) => a.Status === "REJECTED").length} rejected`
  );

  if (postedForPayment.length > 0) {
    setTimeout(() => {
      const paymentPath = path.join(
        OUTBOUND_PAYMENTS,
        `payments_${path.basename(filePath, ".csv")}.csv`
      );
      const today = new Date().toISOString().slice(0, 10);
      fs.writeFileSync(
        paymentPath,
        toCsv(
          ["SmartStreamVoucherNumber", "OurInvoiceNumber", "AmountPaid", "PaymentDate", "PaymentReference", "PaymentMethod"],
          postedForPayment.map((p) => ({ ...p, PaymentDate: today, PaymentMethod: "BANK" }))
        )
      );
      console.log(
        `[mock-smartstream] simulated payment run → wrote ${path.basename(paymentPath)} (${postedForPayment.length} invoice(s) paid)`
      );
    }, PAYMENT_DELAY_MS);
  }

  processed[path.basename(filePath)] = true;
  saveProcessed(processed);
}

function poll() {
  const processed = loadProcessed();
  const files = fs.readdirSync(INBOUND).filter((f) => f.endsWith(".csv") && !processed[f]);
  for (const f of files) {
    try {
      postInvoiceFile(path.join(INBOUND, f), processed);
    } catch (e) {
      console.error(`[mock-smartstream] failed to process ${f}:`, e.message);
    }
  }
}

console.log(`[mock-smartstream] watching ${INBOUND}`);
console.log(`[mock-smartstream] this is a STAND-IN for the client's real SmartStream — not the real system`);
setInterval(poll, POLL_MS);
poll();
