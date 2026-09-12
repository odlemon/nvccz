// @ts-nocheck
import { Decimal } from "@prisma/client/runtime/library";
import { InvestmentOpsError } from "../../middleware/investmentOpsFoundation";
import { SpCashPositionService } from "./SpCashPositionService";
import {
  assertMakerNotChecker,
  assertVersion,
  d,
  db,
  emitCash,
  moneyStr,
  paginated,
  parseDateOnly,
  parsePagination,
  requireStr,
  withIdempotency,
} from "./spCashSupport";

function present(row: any) {
  return {
    id: row.id,
    idempotencyKey: row.idempotencyKey,
    sourceEventId: row.sourceEventId,
    portfolioId: row.portfolioId,
    cashAccountId: row.cashAccountId,
    currency: row.currency,
    originalAmount: moneyStr(row.originalAmount),
    consumedAmount: moneyStr(row.consumedAmount),
    releasedAmount: moneyStr(row.releasedAmount),
    remainingAmount: moneyStr(row.remainingAmount),
    requiredDate: row.requiredDate,
    expiryDate: row.expiryDate,
    purpose: row.purpose,
    status: row.status,
    makerId: row.makerId,
    checkerId: row.checkerId,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class SpCashReservationService {
  static async list(query: any = {}) {
    const { page, pageSize, skip, take } = parsePagination(query);
    const where: any = {};
    if (query.portfolioId) where.portfolioId = String(query.portfolioId);
    if (query.cashAccountId) where.cashAccountId = String(query.cashAccountId);
    if (query.status) where.status = String(query.status);
    if (query.currency) where.currency = String(query.currency).toUpperCase();

    const [items, total] = await Promise.all([
      db.spCashReservation.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      db.spCashReservation.count({ where }),
    ]);
    return paginated(items.map(present), total, page, pageSize);
  }

  /**
   * AT-01: transactional create with account row lock via version increment.
   * Throws INSUFFICIENT_AVAILABLE_CASH when amount > orderEligible.
   */
  static async create(body: any, actorId: string, idempotencyKey?: string) {
    const key = idempotencyKey || requireStr(body.idempotencyKey, "idempotencyKey");
    const payload = {
      portfolioId: requireStr(body.portfolioId, "portfolioId"),
      cashAccountId: requireStr(body.cashAccountId, "cashAccountId"),
      currency: requireStr(body.currency, "currency").toUpperCase(),
      amount: requireStr(body.amount, "amount"),
      expectedCashVersion: body.expectedCashVersion,
      sourceEventId: body.sourceEventId || null,
      purpose: body.purpose || null,
    };

    return withIdempotency("sp-cash:reservation:create", key, payload, async () => {
      const account = await db.spCashClientAccount.findUnique({
        where: { id: payload.cashAccountId },
      });
      if (!account) {
        throw new InvestmentOpsError("NOT_FOUND", "Cash account not found", 404);
      }
      if (account.status !== "ACTIVE") {
        throw new InvestmentOpsError(
          "INVALID_STATUS",
          "Reservations require an ACTIVE cash account",
          409
        );
      }
      if (payload.expectedCashVersion != null) {
        assertVersion(account, payload.expectedCashVersion);
      }

      const amount = d(payload.amount);
      if (amount.lte(0)) {
        throw new InvestmentOpsError("INVALID_DECIMAL", "amount must be greater than zero", 400);
      }

      // Pre-check outside the lock (cheap fail-fast). Re-check under lock below.
      const prePos = await SpCashPositionService.compute({
        portfolioId: payload.portfolioId,
        cashAccountId: payload.cashAccountId,
        currency: payload.currency,
        asOf: body.asOf,
      });
      if (amount.gt(d(prePos.orderEligibleAvailableCash))) {
        throw new InvestmentOpsError(
          "INSUFFICIENT_AVAILABLE_CASH",
          "Reservation exceeds order-eligible available cash",
          409,
          {
            requested: moneyStr(amount),
            available: prePos.orderEligibleAvailableCash,
            calculationVersion: prePos.calculationVersion,
          }
        );
      }

      const needsApproval = body.requireApproval !== false && body.autoActivate !== true;

      const created = await db.$transaction(
        async (tx: any) => {
          // AT-01: row lock so concurrent last-dollar reserves serialize
          await tx.$executeRawUnsafe(
            `SELECT \`id\` FROM \`sp_cash_client_accounts\` WHERE \`id\` = ? FOR UPDATE`,
            payload.cashAccountId
          );
          const lockedAccount = await tx.spCashClientAccount.findUnique({
            where: { id: payload.cashAccountId },
          });
          if (!lockedAccount || lockedAccount.status !== "ACTIVE") {
            throw new InvestmentOpsError("NOT_FOUND", "Cash account not found", 404);
          }
          if (payload.expectedCashVersion != null) {
            assertVersion(lockedAccount, payload.expectedCashVersion);
          }

          // Fast under-lock recheck: active reservation sum + posted cash lines only
          const activeRes = await tx.spCashReservation.aggregate({
            where: {
              cashAccountId: payload.cashAccountId,
              currency: payload.currency,
              status: { in: ["ACTIVE", "PARTIALLY_CONSUMED"] },
            },
            _sum: { remainingAmount: true },
          });
          const postedLines = await tx.spCashJournalLine.findMany({
            where: {
              cashAccountId: payload.cashAccountId,
              journal: { status: "POSTED", currency: payload.currency },
            },
            select: { signedCashAmount: true },
          });
          let posted = new Decimal(0);
          for (const l of postedLines) posted = posted.plus(d(l.signedCashAmount));
          const reserved = d(activeRes._sum.remainingAmount || 0);
          const available = Decimal.max(new Decimal(0), posted.minus(reserved));
          if (amount.gt(available)) {
            throw new InvestmentOpsError(
              "INSUFFICIENT_AVAILABLE_CASH",
              "Reservation exceeds order-eligible available cash",
              409,
              {
                requested: moneyStr(amount),
                available: moneyStr(available),
              }
            );
          }

          await tx.spCashClientAccount.update({
            where: { id: payload.cashAccountId },
            data: { version: { increment: 1 } },
          });

          return tx.spCashReservation.create({
            data: {
              idempotencyKey: key,
              sourceEventId: payload.sourceEventId,
              portfolioId: payload.portfolioId,
              cashAccountId: payload.cashAccountId,
              currency: payload.currency,
              originalAmount: amount,
              consumedAmount: new Decimal(0),
              releasedAmount: new Decimal(0),
              remainingAmount: amount,
              requiredDate: parseDateOnly(body.requiredDate),
              expiryDate: parseDateOnly(body.expiryDate),
              purpose: payload.purpose,
              status: needsApproval ? "PENDING_APPROVAL" : "ACTIVE",
              makerId: actorId,
              version: 1,
            },
          });
        },
        { maxWait: 10000, timeout: 20000 }
      );

      await emitCash({
        eventType: needsApproval ? "cash.reservation.created" : "cash.reservation.active",
        aggregateType: "SpCashReservation",
        aggregateId: created.id,
        aggregateVersion: 1,
        actorId,
        payload: {
          amount: moneyStr(amount),
          cashAccountId: payload.cashAccountId,
          sourceEventId: payload.sourceEventId,
        },
      });
      return present(created);
    }, 201);
  }

  static async approve(id: string, body: any, actorId: string) {
    const row = await db.spCashReservation.findUnique({ where: { id } });
    if (!row) throw new InvestmentOpsError("NOT_FOUND", "Reservation not found", 404);
    if (row.status !== "PENDING_APPROVAL") {
      throw new InvestmentOpsError("INVALID_STATUS", `Cannot approve in ${row.status}`, 409);
    }
    assertMakerNotChecker(row.makerId, actorId);
    if (body?.expectedVersion != null) assertVersion(row, body.expectedVersion);

    const updated = await db.spCashReservation.update({
      where: { id },
      data: { status: "ACTIVE", checkerId: actorId, version: { increment: 1 } },
    });
    await emitCash({
      eventType: "cash.reservation.active",
      aggregateType: "SpCashReservation",
      aggregateId: updated.id,
      aggregateVersion: updated.version,
      actorId,
      payload: { remainingAmount: moneyStr(updated.remainingAmount) },
    });
    return present(updated);
  }

  static async consume(id: string, body: any, actorId: string) {
    const amount = d(requireStr(body.amount, "amount"));
    const updated = await db.$transaction(
      async (tx: any) => {
        const row = await tx.spCashReservation.findUnique({ where: { id } });
        if (!row) throw new InvestmentOpsError("NOT_FOUND", "Reservation not found", 404);
        if (!["ACTIVE", "PARTIALLY_CONSUMED", "OPEN"].includes(row.status)) {
          throw new InvestmentOpsError("INVALID_STATUS", `Cannot consume in ${row.status}`, 409);
        }
        if (body?.expectedVersion != null) assertVersion(row, body.expectedVersion);
        if (amount.lte(0) || amount.gt(d(row.remainingAmount))) {
          throw new InvestmentOpsError(
            "INVALID_AMOUNT",
            "Consume amount must be > 0 and <= remaining",
            400
          );
        }
        const consumed = d(row.consumedAmount).plus(amount);
        const remaining = d(row.remainingAmount).minus(amount);
        const status = remaining.lte(0) ? "CONSUMED" : "PARTIALLY_CONSUMED";
        return tx.spCashReservation.update({
          where: { id },
          data: {
            consumedAmount: consumed,
            remainingAmount: Decimal.max(new Decimal(0), remaining),
            status,
            version: { increment: 1 },
          },
        });
      },
      { maxWait: 15000, timeout: 30000 }
    );
    await emitCash({
      eventType: "cash.reservation.changed",
      aggregateType: "SpCashReservation",
      aggregateId: updated.id,
      aggregateVersion: updated.version,
      actorId,
      payload: { action: "CONSUME", amount: moneyStr(amount), status: updated.status },
    });
    return present(updated);
  }

  static async release(id: string, body: any, actorId: string) {
    const amount = body?.amount != null ? d(body.amount) : null;
    const updated = await db.$transaction(
      async (tx: any) => {
        const row = await tx.spCashReservation.findUnique({ where: { id } });
        if (!row) throw new InvestmentOpsError("NOT_FOUND", "Reservation not found", 404);
        if (!["ACTIVE", "PARTIALLY_CONSUMED", "OPEN", "PENDING_APPROVAL"].includes(row.status)) {
          throw new InvestmentOpsError("INVALID_STATUS", `Cannot release in ${row.status}`, 409);
        }
        if (body?.expectedVersion != null) assertVersion(row, body.expectedVersion);
        const releaseAmt = amount ?? d(row.remainingAmount);
        if (releaseAmt.lte(0) || releaseAmt.gt(d(row.remainingAmount))) {
          throw new InvestmentOpsError(
            "INVALID_AMOUNT",
            "Release amount must be > 0 and <= remaining",
            400
          );
        }
        const released = d(row.releasedAmount).plus(releaseAmt);
        const remaining = d(row.remainingAmount).minus(releaseAmt);
        const status = remaining.lte(0) ? "RELEASED" : "PARTIALLY_CONSUMED";
        return tx.spCashReservation.update({
          where: { id },
          data: {
            releasedAmount: released,
            remainingAmount: Decimal.max(new Decimal(0), remaining),
            status,
            version: { increment: 1 },
          },
        });
      },
      { maxWait: 15000, timeout: 30000 }
    );
    await emitCash({
      eventType: "cash.reservation.changed",
      aggregateType: "SpCashReservation",
      aggregateId: updated.id,
      aggregateVersion: updated.version,
      actorId,
      payload: { action: "RELEASE", amount: moneyStr(amount ?? updated.releasedAmount), status: updated.status },
    });
    return present(updated);
  }
}
