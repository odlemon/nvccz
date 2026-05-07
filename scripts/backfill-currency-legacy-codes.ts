/**
 * Backfill FK columns that wrongly store ISO codes (e.g. "USD") instead of `currencies.id`.
 * Fixes `journal_entries`, `journal_entry_lines.recorded_currency_id`, `expenses`, `revenues`,
 * `invoices`, `procurement_invoices`, `purchase_invoices` where applicable.
 *
 * Idempotent.
 *
 * Run: npm run db:backfill:currency-legacy-codes
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import type { Currency } from "@prisma/client";

type Ccy = Pick<Currency, "id" | "code">;

async function patchColumn(
  label: string,
  currencies: Ccy[],
  apply: (canonicalId: string, variants: string[]) => Promise<number>
): Promise<number> {
  let total = 0;
  for (const c of currencies) {
    const variants = [...new Set([c.code, c.code.toUpperCase(), c.code.toLowerCase()])];
    const n = await apply(c.id, variants);
    if (n) {
      console.log(`  ${label}: ${n} row(s) → ${c.code}`);
      total += n;
    }
  }
  return total;
}

async function main() {
  console.log("backfill-currency-legacy-codes: starting…\n");

  const currencies = await prisma.currency.findMany({ select: { id: true, code: true } });

  const je = await patchColumn("journal_entries.currencyId", currencies, async (canonicalId, variants) => {
    const res = await prisma.journalEntry.updateMany({
      where: { currencyId: { in: variants }, NOT: { currencyId: canonicalId } },
      data: { currencyId: canonicalId },
    });
    return res.count;
  });

  const jel = await patchColumn(
    "journal_entry_lines.recorded_currency_id",
    currencies,
    async (canonicalId, variants) => {
      const res = await prisma.journalEntryLine.updateMany({
        where: {
          recordedCurrencyId: { in: variants },
          NOT: { recordedCurrencyId: canonicalId },
        },
        data: { recordedCurrencyId: canonicalId },
      });
      return res.count;
    }
  );

  const exp = await patchColumn("expenses.currencyId", currencies, async (canonicalId, variants) => {
    const res = await prisma.expense.updateMany({
      where: { currencyId: { in: variants }, NOT: { currencyId: canonicalId } },
      data: { currencyId: canonicalId },
    });
    return res.count;
  });

  const rev = await patchColumn("revenues.currencyId", currencies, async (canonicalId, variants) => {
    const res = await prisma.revenue.updateMany({
      where: { currencyId: { in: variants }, NOT: { currencyId: canonicalId } },
      data: { currencyId: canonicalId },
    });
    return res.count;
  });

  const inv = await patchColumn("invoices.currencyId", currencies, async (canonicalId, variants) => {
    const res = await prisma.invoice.updateMany({
      where: { currencyId: { in: variants }, NOT: { currencyId: canonicalId } },
      data: { currencyId: canonicalId },
    });
    return res.count;
  });

  const invPay = await patchColumn("invoices.paymentCurrencyId", currencies, async (canonicalId, variants) => {
    const res = await prisma.invoice.updateMany({
      where: { paymentCurrencyId: { in: variants }, NOT: { paymentCurrencyId: canonicalId } },
      data: { paymentCurrencyId: canonicalId },
    });
    return res.count;
  });

  const pi = await patchColumn("procurement_invoices.currencyId", currencies, async (canonicalId, variants) => {
    const res = await prisma.procurementInvoice.updateMany({
      where: { currencyId: { in: variants }, NOT: { currencyId: canonicalId } },
      data: { currencyId: canonicalId },
    });
    return res.count;
  });

  const pur = await patchColumn("purchase_invoices.currencyId", currencies, async (canonicalId, variants) => {
    const res = await prisma.purchaseInvoice.updateMany({
      where: { currencyId: { in: variants }, NOT: { currencyId: canonicalId } },
      data: { currencyId: canonicalId },
    });
    return res.count;
  });

  console.log(
    `\ndone. journal_entries=${je}, journal_lines.recorded=${jel}, expenses=${exp}, revenues=${rev}, invoices=${inv}, invoice_payment_ccy=${invPay}, procurement_invoices=${pi}, purchase_invoices=${pur}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
