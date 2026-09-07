// @ts-nocheck
import type { Prisma } from "@prisma/client";

const TABLE = "deal_reference_counters";

/** Alphanumeric prefix only; set `DEAL_REFERENCE_PREFIX` in env (e.g. `VST`, `INV`). */
function dealReferencePrefix(): string {
  const raw = (process.env.DEAL_REFERENCE_PREFIX || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const p = raw.slice(0, 12);
  return p || "VST";
}

export class DealReferenceService {
  static formatRef(year: number, seq: number): string {
    return `${dealReferencePrefix()}-${year}-${String(seq).padStart(6, "0")}`;
  }

  /**
   * Highest sequence number already used for this year+prefix in `applications`,
   * so a counter row that's missing/behind (e.g. rows created outside this
   * allocator, or the counter table cleared/re-migrated) can't hand out a
   * dealReference that collides with one already on a real row.
   */
  static async highestUsedSeq(tx: Prisma.TransactionClient, year: number): Promise<number> {
    const prefix = dealReferencePrefix();
    const like = `${prefix}-${year}-%`;
    const rows = await tx.$queryRawUnsafe<Array<{ dealReference: string }>>(
      `SELECT \`dealReference\` FROM \`applications\` WHERE \`dealReference\` LIKE ?`,
      like
    );
    let max = 0;
    for (const row of rows) {
      const m = /-(\d+)$/.exec(row.dealReference || "");
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return max;
  }

  static async allocateNext(tx: Prisma.TransactionClient): Promise<string> {
    const y = new Date().getFullYear();
    const rows = await tx.$queryRawUnsafe<Array<{ last_value: bigint }>>(
      `SELECT \`last_value\` FROM \`${TABLE}\` WHERE \`year\` = ? FOR UPDATE`,
      y
    );
    let nextSeq: number;
    if (rows.length === 0) {
      const floor = await this.highestUsedSeq(tx, y);
      nextSeq = floor + 1;
      await tx.$executeRawUnsafe(
        `INSERT INTO \`${TABLE}\` (\`year\`, \`last_value\`) VALUES (?, ?)`,
        y,
        nextSeq
      );
    } else {
      const floor = Math.max(Number(rows[0].last_value), await this.highestUsedSeq(tx, y));
      nextSeq = floor + 1;
      await tx.$executeRawUnsafe(
        `UPDATE \`${TABLE}\` SET \`last_value\` = ? WHERE \`year\` = ?`,
        nextSeq,
        y
      );
    }
    return this.formatRef(y, nextSeq);
  }
}
