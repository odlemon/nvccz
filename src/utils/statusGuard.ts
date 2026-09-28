// @ts-nocheck
import crypto from "node:crypto";
import { assertTransition, isTerminal, statusLabel, StatusTransitionError, type StatusKind } from "../services/status/StatusTransitions";
import { currentRequestContext } from "./requestContext";

/**
 * SRD §40: every status write on a requisition, a sourcing event (RFQ) or a purchase order goes through here. A move that is not
 * in the transition map (src/services/status/StatusTransitions.ts) is refused with a 409, whichever route, service or script
 * asked; and a record that is Cancelled or Closed can no longer be changed at all. Each accepted move is recorded, with who
 * made it and when, in procurement_status_history.
 */
const KINDS: Record<string, { kind: StatusKind; delegate: string; number: string; entity: string }> = {
  PurchaseRequisition: { kind: "REQUISITION", delegate: "purchaseRequisition", number: "requisitionNumber", entity: "PurchaseRequisition" },
  ProcurementRfq: { kind: "RFQ", delegate: "procurementRfq", number: "rfqNumber", entity: "ProcurementRfq" },
  PurchaseOrder: { kind: "PURCHASE_ORDER", delegate: "purchaseOrder", number: "poNumber", entity: "PurchaseOrder" },
};

/** Fields a change may touch on a terminal record without counting as an edit. */
const METADATA = new Set(["updatedAt", "version"]);

const statusOf = (data: any): string | undefined => {
  if (!data || data.status === undefined) return undefined;
  if (typeof data.status === "string") return data.status;
  if (data.status && typeof data.status.set === "string") return data.status.set;
  return undefined;
};

async function record(client: any, entity: string, id: string, ref: string | null, from: string | null, to: string) {
  try {
    const ctx = currentRequestContext();
    await client.$executeRawUnsafe(
      "INSERT INTO procurement_status_history (id, entity_type, entity_id, entity_ref, from_status, to_status, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(3))",
      crypto.randomUUID().replace(/-/g, "").slice(0, 25), entity, id, ref, from, to, ctx?.userId ?? null,
    );
  } catch (_e) {
    /* the history must never fail the change it records */
  }
}

export function attachStatusGuardMiddleware(client: any) {
  client.$use(async (params: any, next: any) => {
    const k = KINDS[params.model];
    if (!k) return next(params);

    if (params.action === "create") {
      const to = statusOf(params.args?.data);
      const ref = params.args?.data?.[k.number] ?? "The record";
      if (to) assertTransition(k.kind, null, to, ref);
      const out = await next(params);
      if (out?.id && to) await record(client, k.entity, out.id, out[k.number] ?? null, null, to);
      return out;
    }

    if (params.action !== "update" && params.action !== "updateMany") return next(params);
    const data = params.args?.data ?? {};
    const to = statusOf(data);
    const touched = Object.keys(data).filter((f) => !METADATA.has(f));
    if (!touched.length) return next(params);

    // the rows about to change, as they are now (a row created in this same transaction is not visible here and is not checked)
    const rows: any[] = await client[k.delegate]
      .findMany({ where: params.args.where, select: { id: true, status: true, [k.number]: true }, take: params.action === "update" ? 1 : 1000 })
      .catch(() => []);
    for (const r of rows) {
      const ref = r[k.number] ?? "The record";
      if (isTerminal(k.kind, r.status)) {
        const changing = touched.filter((f) => !(f === "status" && to !== undefined && String(to).toUpperCase() === String(r.status).toUpperCase()));
        if (changing.length) {
          throw new StatusTransitionError(`${ref} is ${statusLabel(k.kind, r.status)} and can no longer be changed.`, "STATUS_TERMINAL", r.status, to ?? null, []);
        }
      }
      if (to !== undefined) assertTransition(k.kind, r.status, to, ref);
    }
    const out = await next(params);
    if (to !== undefined) {
      for (const r of rows) if (String(r.status).toUpperCase() !== String(to).toUpperCase()) await record(client, k.entity, r.id, r[k.number] ?? null, r.status, to);
    }
    return out;
  });
}
