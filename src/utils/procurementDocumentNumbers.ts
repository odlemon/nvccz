import type { PrismaClient } from "@prisma/client";
import { formatYyyymmddUtc } from "./accountingDocumentNumbers";

function parseUnderscoreSuffix(input: string | null | undefined, prefix: string): number | null {
  if (!input) return null;
  const re = new RegExp(`^${prefix}_(\\d{8})_(\\d+)$`);
  const m = String(input).match(re);
  return m ? parseInt(m[2], 10) : null;
}

async function nextForTable(params: {
  prisma: PrismaClient;
  prefix: string; // e.g. RFQ
  ymd: string; // YYYYMMDD
  findMany: () => Promise<Array<{ n: string | null }>>;
}): Promise<string> {
  const fullPrefix = `${params.prefix}_${params.ymd}_`;
  const rows = await params.findMany();
  let max = 0;
  for (const r of rows) {
    const s = parseUnderscoreSuffix(r.n, params.prefix);
    if (s != null) max = Math.max(max, s);
  }
  const next = max + 1;
  if (next > 9999) {
    throw new Error(`Daily ${params.prefix} sequence exhausted for ${params.ymd} (limit 9999)`);
  }
  return `${fullPrefix}${String(next).padStart(4, "0")}`;
}

/** Next purchase requisition number: `REQ_YYYYMMDD_0001` */
export async function nextProcurementRequisitionNumber(prisma: PrismaClient, dateForSequence: Date) {
  const ymd = formatYyyymmddUtc(dateForSequence);
  return nextForTable({
    prisma,
    prefix: "REQ",
    ymd,
    findMany: async () =>
      prisma.purchaseRequisition.findMany({
        where: { requisitionNumber: { startsWith: `REQ_${ymd}_` } },
        select: { requisitionNumber: true },
      }).then((rows) => rows.map((r) => ({ n: r.requisitionNumber }))),
  });
}

/** Next RFQ number: `RFQ_YYYYMMDD_0001` */
export async function nextProcurementRfqNumber(prisma: PrismaClient, dateForSequence: Date) {
  const ymd = formatYyyymmddUtc(dateForSequence);
  return nextForTable({
    prisma,
    prefix: "RFQ",
    ymd,
    findMany: async () =>
      prisma.procurementRfq.findMany({
        where: { rfqNumber: { startsWith: `RFQ_${ymd}_` } },
        select: { rfqNumber: true },
      }).then((rows) => rows.map((r) => ({ n: r.rfqNumber }))),
  });
}

/** Next purchase order number: `PO_YYYYMMDD_0001` */
export async function nextProcurementPoNumber(prisma: PrismaClient, dateForSequence: Date) {
  const ymd = formatYyyymmddUtc(dateForSequence);
  return nextForTable({
    prisma,
    prefix: "PO",
    ymd,
    findMany: async () =>
      prisma.purchaseOrder.findMany({
        where: { poNumber: { startsWith: `PO_${ymd}_` } },
        select: { poNumber: true },
      }).then((rows) => rows.map((r) => ({ n: r.poNumber }))),
  });
}

/** Next GRN number: `GRN_YYYYMMDD_0001` */
export async function nextProcurementGrnNumber(prisma: PrismaClient, dateForSequence: Date) {
  const ymd = formatYyyymmddUtc(dateForSequence);
  return nextForTable({
    prisma,
    prefix: "GRN",
    ymd,
    findMany: async () =>
      prisma.goodsReceivedNote.findMany({
        where: { grnNumber: { startsWith: `GRN_${ymd}_` } },
        select: { grnNumber: true },
      }).then((rows) => rows.map((r) => ({ n: r.grnNumber }))),
  });
}

