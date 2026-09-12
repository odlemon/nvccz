// @ts-nocheck
import { prisma } from "../../utils/database";

const db = () => prisma as any;

/**
 * The staff side of the investor service desk.
 *
 * `LpPortalServiceDeskService` is entirely investor-scoped: every method takes an
 * `LpPortalContext` and filters to that investor's own client. Nothing internal could read an
 * investor request, so SRD §21's flow stopped at the first step — an investor submitted, a
 * reference was created, and no one could see it, assign it, answer it or close it. SRD §5 makes
 * this Investor Relations / Fund Operations work, so it needs a surface of its own.
 *
 * Everything here is deliberately NOT investor-scoped, and must therefore only ever be mounted
 * behind the GP admin guard.
 */

/** SRD §21 lifecycle. */
export const REQUEST_STATUSES = [
  "SUBMITTED",
  "OPEN",
  "ASSIGNED",
  "UNDER_REVIEW",
  "AWAITING_INVESTOR",
  "AWAITING_INTERNAL",
  "RESOLVED",
  "CLOSED",
] as const;

export class LpPortalRequestAdminService {
  /** Every investor request, newest first, with optional filters. */
  static async list(query: Record<string, unknown> = {}) {
    const status = query.status ? String(query.status).toUpperCase() : undefined;
    const clientId = query.clientId ? String(query.clientId) : undefined;
    const fundId = query.fundId ? String(query.fundId) : undefined;
    const assignedToId = query.assignedToId ? String(query.assignedToId) : undefined;
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(query.pageSize ?? 50) || 50));

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (clientId) where.clientId = clientId;
    if (fundId) where.fundId = fundId;
    if (assignedToId) where.assignedToId = assignedToId;

    const [rows, total] = await Promise.all([
      db().lpServiceRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          client: { select: { id: true, legalName: true } },
          fund: { select: { id: true, name: true } },
          messages: { select: { id: true, authorType: true, createdAt: true } },
        },
      }),
      db().lpServiceRequest.count({ where }),
    ]);

    return {
      items: rows.map((r: any) => ({
        id: r.id,
        reference: r.reference,
        clientId: r.clientId,
        clientName: r.client?.legalName ?? null,
        fundId: r.fundId,
        fundName: r.fund?.name ?? null,
        requestType: r.requestType,
        status: r.status,
        priority: r.priority,
        subject: r.subject,
        assignedToId: r.assignedToId ?? null,
        messageCount: r.messages?.length ?? 0,
        // The investor is waiting whenever the last word was theirs.
        awaitingInternal:
          (r.messages ?? []).slice(-1)[0]?.authorType === "INVESTOR" ||
          (r.messages ?? []).length === 0,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      page,
      pageSize,
      total,
    };
  }

  static async getByReference(reference: string) {
    const r = await db().lpServiceRequest.findUnique({
      where: { reference: String(reference) },
      include: {
        client: { select: { id: true, legalName: true, email: true } },
        fund: { select: { id: true, name: true } },
        messages: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!r) throw Object.assign(new Error("Service request not found"), { status: 404 });
    return {
      id: r.id,
      reference: r.reference,
      clientId: r.clientId,
      clientName: r.client?.legalName ?? null,
      clientEmail: r.client?.email ?? null,
      fundId: r.fundId,
      fundName: r.fund?.name ?? null,
      requestType: r.requestType,
      status: r.status,
      priority: r.priority,
      subject: r.subject,
      body: r.body,
      assignedToId: r.assignedToId ?? null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      messages: (r.messages ?? []).map((m: any) => ({
        id: m.id,
        authorType: m.authorType,
        authorId: m.authorId,
        body: m.body,
        createdAt: m.createdAt,
      })),
    };
  }

  /** Assign an owner and/or move the request along its lifecycle. */
  static async update(
    reference: string,
    params: { status?: string; assignedToId?: string | null; priority?: string }
  ) {
    const existing = await db().lpServiceRequest.findUnique({
      where: { reference: String(reference) },
      select: { id: true },
    });
    if (!existing) throw Object.assign(new Error("Service request not found"), { status: 404 });

    const data: Record<string, unknown> = {};
    if (params.status != null) {
      const st = String(params.status).toUpperCase();
      if (!REQUEST_STATUSES.includes(st as any)) {
        throw Object.assign(
          new Error(`status must be one of: ${REQUEST_STATUSES.join(", ")}`),
          { status: 400 }
        );
      }
      data.status = st;
    }
    if (params.priority != null) data.priority = String(params.priority).toUpperCase();
    if (params.assignedToId !== undefined) {
      data.assignedToId = params.assignedToId ? String(params.assignedToId) : null;
      // Assigning is itself a state change unless the caller named one.
      if (data.assignedToId && data.status == null) data.status = "ASSIGNED";
    }
    if (Object.keys(data).length === 0) {
      throw Object.assign(new Error("Nothing to update"), { status: 400 });
    }

    await db().lpServiceRequest.update({ where: { id: existing.id }, data });
    return this.getByReference(reference);
  }

  /**
   * Post a staff reply. Written with `authorType: "OPS"`, which the model already anticipated and
   * which the investor's own thread view renders — this is the return leg the flow was missing.
   */
  static async reply(reference: string, params: { body: string; authorId?: string | null }) {
    const body = String(params.body ?? "").trim();
    if (!body) throw Object.assign(new Error("body is required"), { status: 400 });

    const r = await db().lpServiceRequest.findUnique({
      where: { reference: String(reference) },
      select: { id: true, status: true },
    });
    if (!r) throw Object.assign(new Error("Service request not found"), { status: 404 });

    await db().lpServiceRequestMessage.create({
      data: {
        requestId: r.id,
        authorType: "OPS",
        authorId: params.authorId ?? null,
        body,
      },
    });

    // A staff reply hands the ball back to the investor, unless the request is already finished.
    if (!["RESOLVED", "CLOSED"].includes(String(r.status).toUpperCase())) {
      await db().lpServiceRequest.update({
        where: { id: r.id },
        data: { status: "AWAITING_INVESTOR" },
      });
    }

    return this.getByReference(reference);
  }
}
