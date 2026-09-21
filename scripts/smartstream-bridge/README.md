# SmartStream bridge — proof of concept

**Read this before assuming any of this has been tested against the real client system.**

The client's accounting system is Infor FMS SmartStream — a legacy Windows desktop/client-server
ERP with no API of any kind (confirmed directly against Infor's own implementation guides; see
`design-refs/procurement-v23/SMARTSTREAM_INTEGRATION_DISCOVERY.md` in `nvccz-new` for the research).
There is no public trial or self-service download for it — it's sold under enterprise license through
Infor/resellers — so **none of this has run against a real SmartStream install.** What's here proves the
*Procurement-side* half of the integration works, against a small script (`mock-smartstream.js`) that
plays the role SmartStream would play in a file-based interface, which is the most likely real
integration method given SmartStream is a LAN-only desktop app (see the discovery doc's ranked options).

## What's actually real here vs. what's a placeholder

| Real | Placeholder, pending client access |
|---|---|
| `bridge-agent.js`'s calls to `GET /api/accounting/purchase-invoices` and `POST /api/accounting/purchase-invoices/:id/pay` — exact routes/fields taken from `src/routes/purchaseInvoiceRoutes.ts` and `prisma/schema.prisma` | The CSV column layout (`OurInvoiceNumber`, `VendorBPNumber`, etc.) — a reasonable generic AP-invoice-import shape, **not** SmartStream's confirmed file spec |
| The overall shape: export invoices → drop file → poll for posting acknowledgement → poll for payment confirmation → write payment back to Procurement | Whether SmartStream's real interface is file-based at all — could turn out to be DB-level or something else once we have access (see `mock-smartstream.js`'s header for how little needs to change if so) |

## Running it

```bash
# Terminal 1 — stands in for SmartStream
node mock-smartstream.js

# Terminal 2 — the actual bridge logic, using bundled sample data (no backend needed)
node bridge-agent.js --source=fixture
```

Within ~20 seconds you'll see: 3 sample invoices exported as one CSV, the mock "SmartStream" post 2 and
reject 1 (missing vendor tax number — a deliberate example to prove rejection handling works), and then
a simulated payment run 15 seconds later that the bridge agent picks up and maps back to the original
invoice.

To run against the **real** dev backend instead of the bundled fixtures (still against the mock
SmartStream side, since we don't have the real one):

```bash
SERVER_URL=http://localhost:3000 \
BRIDGE_USER_EMAIL=proc.ap@nts.local \
BRIDGE_USER_PASSWORD=<the shared dev password> \
node bridge-agent.js --source=api
```

## Switching from the mock to the real SmartStream, once we have access

1. If it turns out to be file-based (most likely, per the discovery doc): point `--dir` at the real
   drop folder/share, and update the CSV column layout in `bridge-agent.js`'s
   `mapInvoiceToInterfaceRow()` and `mock-smartstream.js`'s parsing to match SmartStream's actual
   documented import format — everything else (the polling loop, the Procurement-side API calls)
   stays the same.
2. If it turns out to be DB-level: only the two functions marked "SMARTSTREAM SIDE" in
   `bridge-agent.js` need replacing with direct database reads/writes — the Procurement-side half is
   untouched.
3. `bridge-agent.js` is written to run as a standalone Node process on a schedule/service — this is
   the piece that would eventually be installed on a machine inside the client's own network (per the
   "local bridge agent" pattern in the discovery doc), not something that runs on our servers reaching
   into their LAN.

## Known gap to flag before this goes further

There's currently no field on `PurchaseInvoice` to store the SmartStream voucher number it gets back
after posting (see `prisma/schema.prisma`) — `ackStep()` only logs it today. A real implementation needs
a small migration adding something like `externalAccountingReference` so that reconciliation between
our invoice and SmartStream's voucher survives a restart, rather than living only in this script's local
`.bridge-invoice-map.json` file.
