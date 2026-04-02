import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../utils/database";

export class VATService {
  /**
   * Active VAT rate is stored in DB (`vat_rates.is_active = true`).
   * We keep a small in-memory cache to avoid querying on every line-item calculation.
   */
  private static cachedDecimalRate: number = 0.155;
  private static lastLoadedAtMs: number = 0;
  private static refreshInFlight: Promise<number> | null = null;
  private static readonly CACHE_TTL_MS = 30_000;

  static async refreshActiveVatRate(force = false): Promise<number> {
    const now = Date.now();
    if (!force && now - this.lastLoadedAtMs < this.CACHE_TTL_MS) {
      return this.cachedDecimalRate;
    }
    if (this.refreshInFlight) return this.refreshInFlight;

    this.refreshInFlight = (async () => {
      const row = await prisma.vatRate.findFirst({
        where: { isActive: true },
        orderBy: [{ createdAt: "desc" }]
      });
      if (row) {
        const n = Number(row.rateDecimal);
        if (Number.isFinite(n) && n >= 0) {
          this.cachedDecimalRate = n;
        }
      }
      this.lastLoadedAtMs = Date.now();
      return this.cachedDecimalRate;
    })().finally(() => {
      this.refreshInFlight = null;
    });

    return this.refreshInFlight;
  }

  /** Synchronous accessor used by existing callers (value stays fresh via `refreshActiveVatRate`). */
  private static getCachedDecimalRate(): number {
    // Best-effort background refresh if stale.
    if (Date.now() - this.lastLoadedAtMs > this.CACHE_TTL_MS && !this.refreshInFlight) {
      void this.refreshActiveVatRate(false);
    }
    return this.cachedDecimalRate;
  }

  /** Decimal multiplier for standard rate (use for line-item `vatRate` fields, etc.). */
  static getDecimalRate(): number {
    return this.getCachedDecimalRate();
  }

  /**
   * Cashbook / CSV codes that map to the standard rate. Label `15%` means "standard rate" (15.5%).
   */
  static standardRateFromVatCode(vatCode: string | undefined | null): number {
    if (vatCode == null || String(vatCode).trim() === '') return 0;
    const c = String(vatCode).trim();
    if (c === '15%' || c === '15.5%') return this.getCachedDecimalRate();
    return 0;
  }

  /**
   * Calculate VAT amount from a given amount
   * @param amount - The base amount (excluding VAT)
   * @returns The VAT amount
   */
  static calculateVAT(amount: number | Decimal): number {
    const numericAmount = typeof amount === 'number' ? amount : parseFloat(amount.toString());
    const rate = this.getCachedDecimalRate();
    return Math.round(numericAmount * rate * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Calculate total amount including VAT
   * @param baseAmount - The base amount (excluding VAT)
   * @returns The total amount including VAT
   */
  static calculateTotalWithVAT(baseAmount: number | Decimal): number {
    const numericAmount = typeof baseAmount === 'number' ? baseAmount : parseFloat(baseAmount.toString());
    const rate = this.getCachedDecimalRate();
    return Math.round(numericAmount * (1 + rate) * 100) / 100;
  }

  /**
   * Extract VAT amount from a total amount that includes VAT
   * @param totalAmount - The total amount including VAT
   * @returns The VAT amount
   */
  static extractVATFromTotal(totalAmount: number | Decimal): number {
    const numericAmount = typeof totalAmount === 'number' ? totalAmount : parseFloat(totalAmount.toString());
    const rate = this.getCachedDecimalRate();
    const baseAmount = numericAmount / (1 + rate);
    return Math.round((numericAmount - baseAmount) * 100) / 100;
  }

  /**
   * Get the VAT rate as a percentage
   * @returns The VAT rate as a percentage
   */
  static getVATRate(): number {
    return this.getCachedDecimalRate() * 100;
  }

  /**
   * Check if an amount is VAT eligible
   * @param amount - The amount to check
   * @param isTaxable - Whether the transaction is taxable
   * @returns True if VAT should be applied
   */
  static isVATEligible(amount: number | Decimal, isTaxable: boolean): boolean {
    if (!isTaxable) return false;
    const numericAmount = typeof amount === 'number' ? amount : parseFloat(amount.toString());
    return numericAmount > 0;
  }
}

export default VATService; 