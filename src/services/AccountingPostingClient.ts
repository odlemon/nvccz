// @ts-nocheck
import axios from "axios";
import { logger } from "../utils/logger";

type PostJournalEntryLine = {
  accountCode: string;
  debitAmount: number;
  creditAmount: number;
  description?: string;
};

export class AccountingPostingClient {
  private static baseUrl(): string | null {
    const fromEnv = process.env.ACCOUNTING_API_BASE_URL;
    if (fromEnv) return fromEnv;
    const port = process.env.PORT || "3000";
    return `http://localhost:${port}`;
  }

  static async postJournalEntry(args: {
    jwt: string;
    date: string; // YYYY-MM-DD
    description: string;
    currencyId?: string;
    lines: PostJournalEntryLine[];
  }): Promise<{ accountingJEId: string }> {
    const base = this.baseUrl();
    if (!base) {
      throw new Error("ACCOUNTING_API_BASE_URL is not configured");
    }

    const url = `${base.replace(/\/+$/, "")}/accounting/api/post_journal_entry`;
    const payload = {
      date: args.date,
      description: args.description,
      currencyId: args.currencyId,
      lines: args.lines,
    };

    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const resp = await axios.post(url, payload, {
          headers: {
            Authorization: `Bearer ${args.jwt}`,
            "Content-Type": "application/json",
          },
          timeout: 4500,
        });
        const accountingJEId = resp?.data?.data?.accountingJEId;
        if (!accountingJEId) {
          throw new Error("Accounting API response missing data.accountingJEId");
        }
        return { accountingJEId };
      } catch (err: any) {
        const retryable =
          err?.code === "ECONNRESET" ||
          err?.code === "ETIMEDOUT" ||
          err?.response?.status >= 500;

        logger.error("Accounting API post_journal_entry failed", {
          attempt,
          maxAttempts,
          url,
          code: err?.code,
          status: err?.response?.status,
          message: err?.message,
        });

        if (!retryable || attempt === maxAttempts) throw err;
        const delayMs = 250 * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    throw new Error("Accounting API post_journal_entry failed");
  }
}

