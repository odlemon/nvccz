// @ts-nocheck
import { prisma } from "../../utils/database";

const db = () => prisma as any;

/**
 * The staff side of investor notices.
 *
 * `LpNotice` already carries everything SRD §23 asks for — targeting at ALL / FUND / ORG / USER
 * plus a share class, and an `LpNoticeReceipt` per recipient recording opened and acknowledged —
 * but nothing could create one. The model was read by LP-portal services only, all of which are
 * investor-scoped, so notices could be displayed and acknowledged and never issued.
 *
 * Not investor-scoped: mount behind the GP admin guard only.
 */

const TARGET_TYPES = new Set(["ALL", "FUND", "ORG", "USER"]);

export class LpPortalNoticeAdminService {
  /**
   * Issue a notice and materialise a receipt per entitled investor, so that "delivered" is a
   * recorded fact rather than something inferred later. Acknowledgement is the investor's own act
   * and is left null here.
   */
  static async create(params: {
    title: string;
    body: string;
    category?: string | null;
    targetType?: string;
    fundId?: string | null;
    clientId?: string | null;
    userId?: string | null;
    shareClass?: string | null;
  }) {
    const title = String(params.title ?? "").trim();
    const body = String(params.body ?? "").trim();
    if (!title) throw Object.assign(new Error("title is required"), { status: 400 });
    if (!body) throw Object.assign(new Error("body is required"), { status: 400 });

    const targetType = String(params.targetType || "ALL").toUpperCase();
    if (!TARGET_TYPES.has(targetType)) {
      throw Object.assign(
        new Error(`targetType must be one of: ${[...TARGET_TYPES].join(", ")}`),
        { status: 400 }
      );
    }
    if (targetType === "FUND" && !params.fundId) {
      throw Object.assign(new Error("fundId is required when targetType is FUND"), { status: 400 });
    }
    if ((targetType === "ORG" || targetType === "USER") && !params.clientId) {
      throw Object.assign(
        new Error("clientId is required when targetType is ORG or USER"),
        { status: 400 }
      );
    }

    const notice = await db().lpNotice.create({
      data: {
        title,
        body,
        category: params.category ?? null,
        status: "PUBLISHED",
        targetType,
        fundId: params.fundId ?? null,
        clientId: params.clientId ?? null,
        userId: params.userId ?? null,
        shareClass: params.shareClass ?? null,
        publishedAt: new Date(),
      },
    });

    const recipients = await this.resolveRecipients({
      targetType,
      fundId: params.fundId ?? null,
      clientId: params.clientId ?? null,
    });

    if (recipients.length) {
      await db().lpNoticeReceipt.createMany({
        data: recipients.map((clientId: string) => ({
          noticeId: notice.id,
          clientId,
          userId: params.userId ?? null,
        })),
        skipDuplicates: true,
      });
    }

    return this.getById(notice.id);
  }

  /** Which investor organisations a notice reaches, given its targeting. */
  private static async resolveRecipients(t: {
    targetType: string;
    fundId: string | null;
    clientId: string | null;
  }): Promise<string[]> {
    if (t.targetType === "ORG" || t.targetType === "USER") {
      return t.clientId ? [t.clientId] : [];
    }
    if (t.targetType === "FUND" && t.fundId) {
      const commitments = await db().investmentCommitment.findMany({
        where: { fundId: t.fundId, status: { in: ["ACTIVE", "PENDING"] } },
        select: { clientId: true },
        distinct: ["clientId"],
      });
      return commitments.map((c: any) => c.clientId);
    }
    // ALL — every investor organisation with a live commitment somewhere.
    const all = await db().investmentCommitment.findMany({
      where: { status: { in: ["ACTIVE", "PENDING"] } },
      select: { clientId: true },
      distinct: ["clientId"],
    });
    return all.map((c: any) => c.clientId);
  }

  static async getById(id: string) {
    const n = await db().lpNotice.findUnique({
      where: { id: String(id) },
      include: {
        fund: { select: { id: true, name: true } },
        receipts: { select: { clientId: true, openedAt: true, acknowledgedAt: true } },
      },
    });
    if (!n) throw Object.assign(new Error("Notice not found"), { status: 404 });
    const receipts = n.receipts ?? [];
    // Two paths write receipts and they do not share a key: delivery is recorded per investor
    // organisation (userId null) while an open or acknowledgement is recorded per person. Counting
    // rows therefore inflated "delivered" the moment somebody acknowledged — 3 recipients became 4.
    // Counting distinct clients is the number that means something either way.
    const distinct = (pred: (r: any) => boolean) =>
      new Set(receipts.filter(pred).map((r: any) => r.clientId)).size;
    return {
      id: n.id,
      title: n.title,
      body: n.body,
      category: n.category,
      status: n.status,
      targetType: n.targetType,
      fundId: n.fundId,
      fundName: n.fund?.name ?? null,
      clientId: n.clientId,
      shareClass: n.shareClass,
      publishedAt: n.publishedAt,
      // SRD §23: track published, delivered, opened and acknowledged.
      delivered: distinct(() => true),
      opened: distinct((r) => r.openedAt != null),
      acknowledged: distinct((r) => r.acknowledgedAt != null),
    };
  }

  static async list(query: Record<string, unknown> = {}) {
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(query.pageSize ?? 50) || 50));
    const [rows, total] = await Promise.all([
      db().lpNotice.findMany({
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          fund: { select: { name: true } },
          receipts: { select: { clientId: true, openedAt: true, acknowledgedAt: true } },
        },
      }),
      db().lpNotice.count(),
    ]);
    return {
      items: rows.map((n: any) => {
        const r = n.receipts ?? [];
        const distinct = (pred: (x: any) => boolean) =>
          new Set(r.filter(pred).map((x: any) => x.clientId)).size;
        return {
          id: n.id,
          title: n.title,
          category: n.category,
          status: n.status,
          targetType: n.targetType,
          fundName: n.fund?.name ?? null,
          publishedAt: n.publishedAt,
          delivered: distinct(() => true),
          opened: distinct((x) => x.openedAt != null),
          acknowledged: distinct((x) => x.acknowledgedAt != null),
        };
      }),
      page,
      pageSize,
      total,
    };
  }
}
