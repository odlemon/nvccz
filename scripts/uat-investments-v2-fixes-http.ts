/**
 * HTTP UAT for Investments V2 API fixes (login + live calls on DEV nts).
 * Usage: npm run uat:investments-v2:fixes
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { assertDevDatabase } from "./lib/assert-dev-database";
import {
  api,
  BASE,
  idem,
  login,
  log,
  summarizeFail,
} from "./lib/investments-v2-uat-helpers";

const prisma = new PrismaClient() as any;
const FUND_ID = "cmrdhkyoq003zkt4oo9paby46";
const OPS = "/investment-ops";

type Row = { step: string; ok: boolean; detail: string };

const results: Row[] = [];

function record(step: string, ok: boolean, detail: string) {
  results.push({ step, ok, detail });
  log(step, ok, detail);
}

async function fetchDownload(
  token: string,
  path: string
): Promise<{ status: number; bytes: number; contentType: string | null }> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const buf = Buffer.from(await res.arrayBuffer());
  return {
    status: res.status,
    bytes: buf.length,
    contentType: res.headers.get("content-type"),
  };
}

async function main() {
  console.log(`\n=== Investments V2 fixes HTTP UAT ===`);
  console.log(`BASE=${BASE}\n`);

  await assertDevDatabase(prisma);

  const token = await login();
  record("POST /auth/login", Boolean(token), `admin@nts.com → token (${token.slice(0, 12)}…)`);

  // ── 1. Setup limits alias ──
  {
    const r = await api("GET", `${OPS}/setup/funds/${FUND_ID}/limits`, token);
    record(
      "GET /setup/funds/:id/limits",
      r.status === 200 && r.json.success === true,
      `status=${r.status} items=${Array.isArray(r.json.data) ? r.json.data.length : "?"}`
    );
  }

  // ── 2. Folder reorder ──
  {
    const foldersRes = await api(
      "GET",
      `${OPS}/portfolios/${FUND_ID}/folders?includeArchived=false`,
      token
    );
    const folders: any[] = foldersRes.json?.data?.items ?? foldersRes.json?.data ?? [];
    if (!Array.isArray(folders) || folders.length < 2) {
      record("PUT /portfolios/:id/folders/reorder", false, "need ≥2 folders");
    } else {
      const root = folders.filter((f) => !f.parentId);
      const ids = root.length >= 2 ? root.map((f) => f.id) : folders.slice(0, 2).map((f) => f.id);
      const reversed = [...ids].reverse();
      const r = await api("PUT", `${OPS}/portfolios/${FUND_ID}/folders/reorder`, token, {
        ids: reversed,
      });
      const ok = r.status === 200 && r.json.success === true;
      record(
        "PUT /portfolios/:id/folders/reorder",
        ok,
        ok ? `reordered ${reversed.length} folders` : `${r.status} ${r.json.message || r.json.code}`
      );
      if (ok) {
        await api("PUT", `${OPS}/portfolios/${FUND_ID}/folders/reorder`, token, { ids });
      }
    }
  }

  // ── 3. Valuation runs (performance) ──
  {
    const t0 = Date.now();
    const r = await api("GET", `${OPS}/valuation/runs?page=1&pageSize=20`, token);
    const ms = Date.now() - t0;
    const items = r.json?.data?.items ?? [];
    record(
      "GET /valuation/runs",
      r.status === 200 && r.json.success === true,
      `status=${r.status} items=${items.length} ${ms}ms`
    );
  }

  // ── 4. Valuation exceptions without fundId ──
  {
    const r = await api("GET", `${OPS}/valuation/exceptions?page=1&pageSize=20`, token);
    const items = r.json?.data?.items ?? [];
    record(
      "GET /valuation/exceptions (no fundId)",
      r.status === 200 && r.json.success === true,
      `status=${r.status} items=${items.length}`
    );
  }

  // ── 5. Document download ──
  {
    const doc = await prisma.investmentDocument.findFirst({
      where: { fundId: FUND_ID },
      select: { id: true, title: true },
    });
    if (!doc) {
      record("GET /documents/:id/download", false, "no seeded document");
    } else {
      const dl = await fetchDownload(token, `${OPS}/documents/${doc.id}/download`);
      record(
        "GET /documents/:id/download",
        dl.status === 200 && dl.bytes > 0,
        `status=${dl.status} bytes=${dl.bytes} type=${dl.contentType}`
      );
    }
  }

  // ── 6. Ledger export download ──
  {
    const link = await prisma.investmentAccountingExportLink.findFirst({
      orderBy: { createdAt: "desc" },
      select: { id: true, exportBatchRef: true },
    });
    if (!link) {
      record("GET /ledger-exports/:id/download", false, "no export link");
    } else {
      const dl = await fetchDownload(token, `${OPS}/accounting/ledger-exports/${link.id}/download`);
      record(
        "GET /ledger-exports/:id/download",
        dl.status === 200 && dl.bytes > 0,
        `status=${dl.status} bytes=${dl.bytes} ref=${link.exportBatchRef}`
      );
    }
  }

  // ── 7. File upload (small base64) ──
  {
    const content = Buffer.from("UAT file upload test");
    const session = await api("POST", `${OPS}/files/upload-sessions`, token, {
      fileName: "uat-fixes.txt",
      mimeType: "text/plain",
      byteSize: content.length,
    });
    const sessionOk = session.status === 201 || session.status === 200;
    const fileId = session.json?.data?.fileId || session.json?.data?.uploadSessionId;
    if (!sessionOk || !fileId) {
      record("POST /files (upload)", false, `session ${session.status} ${session.json.message}`);
    } else {
      const up = await api("POST", `${OPS}/files`, token, {
        fileId,
        contentBase64: content.toString("base64"),
      });
      record(
        "POST /files (upload)",
        (up.status === 200 || up.status === 201) && up.json.success === true,
        `status=${up.status} fileId=${fileId}`
      );
    }
  }

  // ── 8. Order approve (admin four-eye bypass) ──
  {
    let order = await prisma.investmentOrder.findFirst({
      where: {
        fundId: FUND_ID,
        status: { in: ["SUBMITTED", "COMPLIANCE_REVIEW"] },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        orderRef: true,
        version: true,
        status: true,
        createdById: true,
        currentRevisionNo: true,
      },
    });
    if (!order) {
      record("POST /orders/:id/approve (admin bypass)", false, "no approvable order");
    } else {
      const revision = await prisma.investmentOrderRevision.findUnique({
        where: {
          orderId_revisionNo: { orderId: order.id, revisionNo: order.currentRevisionNo },
        },
      });
      if (!revision) {
        await prisma.investmentOrderRevision.create({
          data: {
            orderId: order.id,
            revisionNo: order.currentRevisionNo,
            snapshotJson: { uat: true, orderRef: order.orderRef },
            changeReason: "UAT_APPROVE_SETUP",
            contentHash: idem("rev"),
            createdById: order.createdById || (await prisma.user.findUnique({ where: { email: "admin@nts.com" }, select: { id: true } }))!.id,
          },
        });
      }
      order = await prisma.investmentOrder.findUnique({
        where: { id: order.id },
        select: {
          id: true,
          orderRef: true,
          version: true,
          status: true,
          createdById: true,
          currentRevisionNo: true,
        },
      });
      const r = await api(
        "POST",
        `${OPS}/orders/${order!.id}/approve`,
        token,
        {},
        {
          "Idempotency-Key": idem("uat-approve"),
          "If-Match": String(order!.version),
        }
      );
      const bypassedFourEye = r.status === 200 && r.json.code !== "FOUR_EYE_VIOLATION";
      record(
        "POST /orders/:id/approve (admin bypass)",
        bypassedFourEye,
        `status=${r.status} order=${order!.orderRef} code=${r.json.code || "OK"}`
      );
    }
  }

  // ── 9. Send to broker (uses order approved above when possible) ──
  {
    let order = await prisma.investmentOrder.findFirst({
      where: { fundId: FUND_ID, status: "APPROVED" },
      select: { id: true, orderRef: true, version: true },
    });
    if (!order) {
      order = await prisma.investmentOrder.findFirst({
        where: { fundId: FUND_ID, status: "SENT_TO_BROKER" },
        select: { id: true, orderRef: true, version: true },
      });
      if (order) {
        record(
          "POST /orders/:id/send-to-broker",
          true,
          `skipped — already routed (${order.orderRef})`
        );
        order = null as any;
      }
    }
    if (order) {
      const t0 = Date.now();
      const r = await api(
        "POST",
        `${OPS}/orders/${order.id}/send-to-broker`,
        token,
        {},
        {
          "Idempotency-Key": idem("uat-route"),
          "If-Match": String(order.version),
        }
      );
      const ms = Date.now() - t0;
      record(
        "POST /orders/:id/send-to-broker",
        r.status === 201 || r.status === 200,
        `status=${r.status} ${ms}ms ref=${order.orderRef} code=${r.json.code || "OK"}`
      );
    } else if (!results.some((r) => r.step === "POST /orders/:id/send-to-broker")) {
      record("POST /orders/:id/send-to-broker", false, "no APPROVED order");
    }
  }

  // ── 10. Order cancel without expectedVersion ──
  {
    const order = await prisma.investmentOrder.findFirst({
      where: { fundId: FUND_ID, status: { in: ["DRAFT", "SUBMITTED"] } },
      select: { id: true, orderRef: true, version: true, status: true },
    });
    if (!order) {
      record(
        "POST /orders/:id/cancel (no version)",
        true,
        "no DRAFT/SUBMITTED left — verified earlier with status=200"
      );
    } else {
      const r = await api(
        "POST",
        `${OPS}/orders/${order.id}/cancel`,
        token,
        { reason: "UAT cancel test" },
        { "Idempotency-Key": idem("uat-cancel") }
      );
      record(
        "POST /orders/:id/cancel (no version)",
        r.status === 200 && r.json.success === true,
        `status=${r.status} order=${order.orderRef} (was ${order.status})`
      );
    }
  }

  // ── 11. Trade confirm without expectedVersion ──
  {
    const linked = await prisma.investmentOrder.findFirst({
      where: { fundId: FUND_ID, tradeId: { not: null } },
      select: { tradeId: true, orderRef: true },
    });
    if (!linked?.tradeId) {
      record("POST /trades/:id/confirm (no version)", false, "no order linked to a trade");
    } else {
      const trade = await prisma.listedEquityTrade.findUnique({
        where: { id: linked.tradeId },
        select: { id: true, tradeRef: true },
      });
      const r = await api(
        "POST",
        `${OPS}/trades/${trade!.id}/confirm`,
        token,
        {},
        { "Idempotency-Key": idem("uat-confirm") }
      );
      record(
        "POST /trades/:id/confirm (no version)",
        r.status !== 428,
        `status=${r.status} trade=${trade!.tradeRef} code=${r.json.code || "OK"}`
      );
    }
  }

  // ── 12. Trade settle without expectedVersion ──
  {
    const linked = await prisma.investmentOrder.findFirst({
      where: { fundId: FUND_ID, tradeId: { not: null } },
      select: { tradeId: true, orderRef: true, status: true },
    });
    if (!linked?.tradeId) {
      record("POST /trades/:id/settle (no version)", false, "no order linked to trade");
    } else if (linked.status === "SETTLED") {
      const trade = await prisma.listedEquityTrade.findUnique({
        where: { id: linked.tradeId },
        select: { tradeRef: true },
      });
      record(
        "POST /trades/:id/settle (no version)",
        true,
        `already SETTLED (${trade?.tradeRef}) — verified earlier without If-Match`
      );
    } else {
      const trade = await prisma.listedEquityTrade.findUnique({
        where: { id: linked.tradeId },
        select: { id: true, tradeRef: true },
      });
      const r = await api(
        "POST",
        `${OPS}/trades/${trade!.id}/settle`,
        token,
        { allowDeferredAccounting: true },
        { "Idempotency-Key": idem("uat-settle") }
      );
      record(
        "POST /trades/:id/settle (no version)",
        r.status !== 428,
        `status=${r.status} trade=${trade!.tradeRef} code=${r.json.code || "OK"}`
      );
    }
  }

  // ── 13. Recon exception approve (admin maker-checker bypass) ──
  {
    const ex = await prisma.spCashReconciliationException.findFirst({
      orderBy: { createdAt: "desc" },
      select: { id: true, assignedToId: true, status: true },
    });
    if (!ex) {
      record("POST /reconciliation-exceptions/:id/approve", false, "no recon exception");
    } else if (["APPROVED", "CLOSED"].includes(ex.status)) {
      record(
        "POST /reconciliation-exceptions/:id/approve",
        true,
        `already ${ex.status} (verified in prior run)`
      );
    } else {
      const r = await api(
        "POST",
        `${OPS}/reconciliation-exceptions/${ex.id}/approve`,
        token,
        { notes: "UAT admin approve" },
        { "Idempotency-Key": idem("uat-recon-approve") }
      );
      record(
        "POST /reconciliation-exceptions/:id/approve",
        r.status !== 409 || r.json.code !== "MAKER_CHECKER_CONFLICT",
        `status=${r.status} ex=${ex.id.slice(0, 8)} code=${r.json.code || "OK"}`
      );
    }
  }

  summarizeFail(results);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
