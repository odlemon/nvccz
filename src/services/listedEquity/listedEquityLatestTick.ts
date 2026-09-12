// @ts-nocheck
import { prisma } from "../../utils/database";

const DISPLAY_STATUSES = ["APPROVED", "API_CONFIRMED", "PENDING_REVIEW", "PENDING", "VALIDATED", "STALE", "ESTIMATED"];

/** Latest non-rejected tick for UI display (includes pending review queue). */
export async function findLatestDisplayPriceTick(securityId: string) {
  const tick = await prisma.listedEquityPriceTick.findFirst({
    where: {
      securityId,
      validationStatus: { in: DISPLAY_STATUSES },
    },
    orderBy: { pricedAt: "desc" },
  });
  if (!tick) return null;

  let previousClose = tick.previousClose;
  const needPrior =
    previousClose == null || Number(previousClose) === Number(tick.price);
  if (needPrior) {
    const priors = await prisma.listedEquityPriceTick.findMany({
      where: {
        securityId,
        id: { not: tick.id },
        validationStatus: { in: DISPLAY_STATUSES },
      },
      orderBy: { pricedAt: "desc" },
      take: 8,
      select: { price: true, pricedAt: true },
    });
    const prior = priors.find((p) => Number(p.price) !== Number(tick.price));
    if (prior?.price != null) previousClose = prior.price;
  }

  return { tick, previousClose };
}

export function serializeDisplayPriceTick(
  tick: {
    id: string;
    price: unknown;
    pricedAt: Date;
    validationStatus: string;
    sourceStatus: string;
    sourceCode: string | null;
    version: number;
    deviationPct: unknown;
  },
  previousClose: unknown
) {
  return {
    id: tick.id,
    price: tick.price != null ? String(tick.price) : null,
    previousClose: previousClose != null ? String(previousClose) : null,
    pricedAt: tick.pricedAt,
    validationStatus: tick.validationStatus,
    sourceStatus: tick.sourceStatus,
    sourceCode: tick.sourceCode,
    version: String(tick.version),
    deviationPct: tick.deviationPct != null ? String(tick.deviationPct) : null,
  };
}
