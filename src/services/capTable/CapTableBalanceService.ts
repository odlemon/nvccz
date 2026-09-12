// @ts-nocheck
import Decimal from "decimal.js";
import { prisma } from "../../utils/database";

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export class CapTableBalanceService {
  static async holderBalances(registryId: string) {
    const lines = await prisma.capTableTransactionLine.findMany({
      where: {
        transaction: { registryId, status: "EXECUTED" },
      },
      include: {
        stakeholder: { select: { id: true, displayName: true } },
        shareClass: { select: { id: true, classCode: true, className: true, classType: true } },
      },
    });

    const map = new Map<string, { stakeholderId: string; displayName: string; shareClassId: string; classCode: string; className: string; shares: Decimal }>();

    for (const line of lines) {
      const key = `${line.stakeholderId}:${line.shareClassId}`;
      const prev = map.get(key);
      const delta = new Decimal(line.quantityDelta.toString());
      if (prev) {
        prev.shares = prev.shares.plus(delta);
      } else {
        map.set(key, {
          stakeholderId: line.stakeholderId,
          displayName: line.stakeholder.displayName,
          shareClassId: line.shareClassId,
          classCode: line.shareClass.classCode,
          className: line.shareClass.className,
          shares: delta,
        });
      }
    }

    return [...map.values()].map((r) => ({
      ...r,
      shares: r.shares.toDecimalPlaces(4).toNumber(),
    }));
  }

  static async holderBalance(registryId: string, stakeholderId: string, shareClassId: string): Promise<number> {
    const rows = await prisma.capTableTransactionLine.aggregate({
      where: {
        stakeholderId,
        shareClassId,
        transaction: { registryId, status: "EXECUTED" },
      },
      _sum: { quantityDelta: true },
    });
    return Number(rows._sum.quantityDelta ?? 0);
  }

  static async issuedByClass(registryId: string) {
    const classes = await prisma.capTableShareClass.findMany({
      where: { registryId, status: "ACTIVE" },
    });
    const balances = await CapTableBalanceService.holderBalances(registryId);
    const optionGrants = await prisma.capTableOptionGrant.findMany({
      where: { registryId, status: "ACTIVE" },
    });

    let totalIssued = new Decimal(0);
    let totalOptionPool = new Decimal(0);
    let totalGrantedOptions = new Decimal(0);

    const classRows = classes.map((c) => {
      const issued = balances
        .filter((b) => b.shareClassId === c.id)
        .reduce((s, b) => s.plus(b.shares), new Decimal(0));
      totalIssued = totalIssued.plus(issued);

      const isPool = c.classType === "OPTION_POOL";
      if (isPool) {
        totalOptionPool = totalOptionPool.plus(c.authorizedShares.toString());
      }

      const grants = optionGrants.filter((g) => g.shareClassId === c.id);
      const granted = grants.reduce(
        (s, g) => s.plus(g.grantedShares.toString()).minus(g.cancelledShares.toString()),
        new Decimal(0)
      );
      totalGrantedOptions = totalGrantedOptions.plus(granted);

      return {
        shareClassId: c.id,
        classCode: c.classCode,
        className: c.className,
        classType: c.classType,
        authorizedShares: Number(c.authorizedShares),
        issuedShares: issued.toDecimalPlaces(4).toNumber(),
        unissuedShares: new Decimal(c.authorizedShares.toString()).minus(issued).toDecimalPlaces(4).toNumber(),
        optionGranted: isPool ? granted.toDecimalPlaces(4).toNumber() : 0,
      };
    });

    const sFd = totalIssued.plus(totalOptionPool);
    const stakeholderRows = balances.map((b) => {
      const grants = optionGrants
        .filter((g) => g.stakeholderId === b.stakeholderId)
        .reduce(
          (s, g) => s.plus(g.grantedShares.toString()).minus(g.exercisedShares.toString()).minus(g.cancelledShares.toString()),
          new Decimal(0)
        );
      const numerator = new Decimal(b.shares).plus(grants);
      const pct = sFd.gt(0) ? numerator.div(sFd).mul(100) : new Decimal(0);
      return {
        stakeholderId: b.stakeholderId,
        displayName: b.displayName,
        shareClassId: b.shareClassId,
        classCode: b.classCode,
        sharesHeld: b.shares,
        optionsGranted: grants.toDecimalPlaces(4).toNumber(),
        fullyDilutedPct: pct.toDecimalPlaces(4).toNumber(),
      };
    });

    return {
      fullyDilutedShareCount: sFd.toDecimalPlaces(4).toNumber(),
      classes: classRows,
      stakeholders: stakeholderRows,
    };
  }
}
