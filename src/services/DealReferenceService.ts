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
   * Next sequential deal reference for the current calendar year (row-locked).
   * Requires `deal_reference_counters` table (see db:migrate:deal-workflow-deal-reference).
   */
  static async allocateNext(tx: Prisma.TransactionClient): Promise<string> {
    const y = new Date().getFullYear();
    const rows = await tx.$queryRawUnsafe<Array<{ last_value: bigint }>>(
      `SELECT \`last_value\` FROM \`${TABLE}\` WHERE \`year\` = ? FOR UPDATE`,
      y
    );
    let nextSeq: number;
    if (rows.length === 0) {
      await tx.$executeRawUnsafe(
        `INSERT INTO \`${TABLE}\` (\`year\`, \`last_value\`) VALUES (?, 1)`,
        y
      );
      nextSeq = 1;
    } else {
      nextSeq = Number(rows[0].last_value) + 1;
      await tx.$executeRawUnsafe(
        `UPDATE \`${TABLE}\` SET \`last_value\` = ? WHERE \`year\` = ?`,
        nextSeq,
        y
      );
    }
    return this.formatRef(y, nextSeq);
  }
}
