import { createHash } from "crypto";
import { prisma } from "../../utils/database";
import AuditService from "../AuditService";
import { SourcingAccessService, phaseOf } from "./SourcingAccessService";
import { MultiCurrencyService } from "../MultiCurrencyService";

const fail = (message: string, status = 400, code?: string) => Object.assign(new Error(message), { status, code });

/**
 * SRD §16 controlled opening. An authorised user opens the bids after the closing deadline; the opening is time-stamped, the
 * attendees are recorded, and the record is immutable: there is no update or delete path for it, and its hash is stored so that
 * a change made outside the application is detectable (GET /procurement/rfqs/:id/opening/verify).
 * The exchange rates in force at opening are frozen with it, so every later comparison uses the same stated rates.
 */
function recordHash(opening: any, attendees: any[]) {
  const payload = {
    rfqId: opening.rfqId,
    openedAt: new Date(opening.openedAt).toISOString(),
    openedById: opening.openedById,
    notes: opening.notes ?? null,
    submissionsCount: opening.submissionsCount,
    reportingCurrencyCode: opening.reportingCurrencyCode ?? null,
    fxSnapshot: opening.fxSnapshot ?? null,
    attendees: attendees
      .map((a) => ({ userId: a.userId ?? null, name: a.name, role: a.role ?? null, external: !!a.external }))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
  };
  return createHash("sha256").update(JSON.stringify(payload), "utf8").digest("hex");
}

export class BidOpeningService {
  static async open(
    user: any,
    rfqId: string,
    input: { attendees?: Array<{ userId?: string; name?: string; role?: string; external?: boolean }>; notes?: string }
  ) {
    const ctx = await SourcingAccessService.resolve(user, rfqId);
    const rfq = ctx.rfq;
    if (!ctx.canOpen) throw fail("You are not authorised to open bids. Bid opening is reserved to users holding the bid-opening authority.", 403, "NOT_AUTHORISED_TO_OPEN");
    if (rfq.bidOpenedAt || (await prisma.rfqBidOpening.findUnique({ where: { rfqId: rfq.id } }))) {
      throw fail("The bids of this event have already been opened; the opening record cannot be changed.", 409, "ALREADY_OPENED");
    }
    if (["CANCELLED", "AWARDED", "COMPLETED"].includes(String(rfq.status).toUpperCase())) {
      throw fail(`This event is ${String(rfq.status).toLowerCase()}, so its bids cannot be opened.`, 409);
    }
    if (rfq.closingAt && Date.now() < new Date(rfq.closingAt).getTime()) {
      await SourcingAccessService.recordDenied(user, rfq.id, "open bids before the closing deadline", ctx);
      throw fail("Bids cannot be opened before the closing deadline.", 409, "BEFORE_DEADLINE");
    }

    const settings = await prisma.procurementSettings.findUnique({ where: { id: "default" } }).catch(() => null);
    const minAttendees = Number((settings as any)?.minOpeningAttendees ?? 2);

    // Attendees: the opener is always one; each other internal attendee is a real, active user.
    const wanted = input.attendees ?? [];
    const attendees: Array<{ userId: string | null; name: string; role: string | null; external: boolean }> = [];
    const seen = new Set<string>([user.id]);
    attendees.push({ userId: user.id, name: [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email, role: "Opened the bids", external: false });
    for (const a of wanted) {
      if (a.userId) {
        if (seen.has(a.userId)) continue;
        const u = await prisma.user.findUnique({ where: { id: a.userId }, select: { id: true, firstName: true, lastName: true, email: true, status: true } });
        if (!u) throw fail("An attendee is not a user of this system.");
        if (String(u.status || "ACTIVE").toUpperCase() !== "ACTIVE") throw fail(`${u.firstName} ${u.lastName} is not an active user and cannot be recorded as an attendee.`);
        seen.add(u.id);
        attendees.push({ userId: u.id, name: [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email, role: a.role?.trim() || "Witness", external: false });
      } else {
        const name = String(a.name ?? "").trim();
        if (!name) continue;
        attendees.push({ userId: null, name: name.slice(0, 191), role: a.role?.trim() || "Observer", external: true });
      }
    }
    if (attendees.length < minAttendees) {
      throw fail(`Bid opening needs at least ${minAttendees} attendees on record (you and ${minAttendees - 1} more); ${attendees.length} given.`, 400, "ATTENDEES_REQUIRED");
    }

    const live = await prisma.vendorQuotation.findMany({
      where: { procurementRfqId: rfq.id, status: { in: ["SUBMITTED", "UNDER_REVIEW"] } },
      select: { id: true, currencyCode: true },
    });

    // The rates in force now, frozen with the opening.
    const reportingCurrency =
      (rfq.reportingCurrencyId ? await prisma.currency.findUnique({ where: { id: rfq.reportingCurrencyId } }) : null) ||
      (await prisma.currency.findFirst({ where: { isDefault: true } }));
    const fx: Record<string, { rate: number | null; asOf: string }> = {};
    if (reportingCurrency) {
      for (const code of [...new Set(live.map((q) => q.currencyCode))]) {
        const cur = await prisma.currency.findFirst({ where: { code } });
        let rate: number | null = null;
        if (cur) {
          try {
            rate = (await MultiCurrencyService.convertCurrency({ amount: 1, fromCurrencyId: cur.id, toCurrencyId: reportingCurrency.id, date: new Date() })).exchangeRate;
          } catch {
            rate = null;
          }
        }
        fx[code] = { rate, asOf: new Date().toISOString() };
      }
    }

    const openedAt = new Date();
    const created = await prisma.$transaction(async (tx) => {
      const opening = await tx.rfqBidOpening.create({
        data: {
          rfqId: rfq.id,
          openedAt,
          openedById: user.id,
          notes: input.notes?.trim() || null,
          submissionsCount: live.length,
          reportingCurrencyCode: reportingCurrency?.code ?? null,
          fxSnapshot: fx as any,
        },
      });
      const rows = [];
      for (const a of attendees) rows.push(await tx.rfqBidOpeningAttendee.create({ data: { openingId: opening.id, userId: a.userId, name: a.name, role: a.role, external: a.external } }));
      const hash = recordHash(opening, rows);
      await tx.$executeRawUnsafe("UPDATE rfq_bid_openings SET record_sha256 = ? WHERE id = ?", hash, opening.id);
      await tx.procurementRfq.update({
        where: { id: rfq.id },
        data: {
          bidOpenedAt: openedAt,
          bidOpenedById: user.id,
          sealedBidding: true,
          criteriaLockedAt: openedAt,
          bidOpeningAttendeesJson: { attendees: attendees.map((a) => ({ name: a.name, role: a.role })), notes: input.notes ?? null, openedAt: openedAt.toISOString() } as any,
        },
      });
      return { opening: { ...opening, recordSha256: hash }, attendees: rows };
    });
    { const { ProcurementLifecycleService } = await import("../status/ProcurementLifecycleService"); await ProcurementLifecycleService.advanceRfq(rfq.id, "UNDER_EVALUATION"); }

    await AuditService.log({
      userId: user.id,
      action: "OPEN_BIDS",
      entityType: "ProcurementRfq",
      entityId: rfq.id,
      newValues: { openedAt: openedAt.toISOString(), submissions: live.length, attendees: attendees.map((a) => a.name), sha256: created.opening.recordSha256 },
    });
    return this.describe(rfq.id);
  }

  /** The opening record: public knowledge to procurement staff (who opened, when, in whose presence), never the submissions. */
  static async describe(rfqId: string) {
    const opening = await prisma.rfqBidOpening.findUnique({ where: { rfqId } });
    if (!opening) return null;
    const attendees = await prisma.rfqBidOpeningAttendee.findMany({ where: { openingId: opening.id }, orderBy: { createdAt: "asc" } });
    const opener = await prisma.user.findUnique({ where: { id: opening.openedById }, select: { firstName: true, lastName: true, email: true } });
    return {
      id: opening.id,
      rfqId,
      openedAt: opening.openedAt,
      openedBy: { id: opening.openedById, name: [opener?.firstName, opener?.lastName].filter(Boolean).join(" ") || opener?.email || null },
      notes: opening.notes,
      submissionsCount: opening.submissionsCount,
      reportingCurrencyCode: opening.reportingCurrencyCode,
      fxSnapshot: opening.fxSnapshot,
      attendees: attendees.map((a) => ({ id: a.id, userId: a.userId, name: a.name, role: a.role, external: a.external })),
      recordSha256: (opening as any).recordSha256 ?? null,
    };
  }

  /**
   * A quotation in a currency that had no exchange rate at opening cannot be compared. An authorised user may state the rate to
   * compare at, with a reason; it is recorded and audited, shown in the comparison, and never changes the opening record itself.
   */
  static async setFxRate(user: any, rfqId: string, input: { currency: string; rate: number; reason: string }) {
    const ctx = await SourcingAccessService.resolve(user, rfqId);
    if (!ctx.canOpen) throw fail("Only a user holding the bid-opening authority states an exchange rate.", 403);
    if (ctx.sealed) throw fail("The bids have not been opened.", 409);
    const code = String(input.currency ?? "").toUpperCase();
    const rate = Number(input.rate);
    if (!code || !Number.isFinite(rate) || rate <= 0) throw fail("Give the currency and a rate above zero.");
    if (String(input.reason ?? "").trim().length < 5) throw fail("Say where the rate comes from.");
    const opening = await prisma.rfqBidOpening.findUnique({ where: { rfqId } });
    if (opening?.reportingCurrencyCode && code === opening.reportingCurrencyCode) throw fail("That is the reporting currency.");
    const next = { ...((ctx.rfq.fxOverrides as any) || {}), [code]: { rate, reason: String(input.reason).trim(), setById: user.id, setAt: new Date().toISOString() } };
    await prisma.procurementRfq.update({ where: { id: rfqId }, data: { fxOverrides: next as any } });
    await AuditService.log({ userId: user.id, action: "SET_FX_RATE", entityType: "ProcurementRfq", entityId: rfqId, newValues: { currency: code, rate, reason: input.reason } });
    return next;
  }

  /** Recomputes the record's hash: false means it was changed after it was written. */
  static async verify(rfqId: string) {
    const opening = await prisma.rfqBidOpening.findUnique({ where: { rfqId } });
    if (!opening) return { opened: false, intact: null as boolean | null };
    const attendees = await prisma.rfqBidOpeningAttendee.findMany({ where: { openingId: opening.id } });
    const now = recordHash(opening, attendees);
    return { opened: true, intact: now === (opening as any).recordSha256, recordSha256: (opening as any).recordSha256, recomputed: now };
  }

  static phase(rfq: any) {
    return phaseOf(rfq);
  }
}
