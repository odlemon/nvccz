// @ts-nocheck
import { Decimal } from "@prisma/client/runtime/library";

export class VATService {
  /** Standard statutory VAT as decimal (15.5% = 0.155). Single source of truth. */
  private static readonly VAT_RATE = 0.155;

  /** Decimal multiplier for standard rate (use for line-item `vatRate` fields, etc.). */
  static getDecimalRate(): number {
    return this.VAT_RATE;
  }

  /**
   * Cashbook / CSV codes that map to the standard rate. Label `15%` means "standard rate" (15.5%).
   */
  static standardRateFromVatCode(vatCode: string | undefined | null): number {
    if (vatCode == null || String(vatCode).trim() === '') return 0;
    const c = String(vatCode).trim();
    if (c === '15%' || c === '15.5%') return this.VAT_RATE;
    return 0;
  }

  /**
   * Calculate VAT amount from a given amount
   * @param amount - The base amount (excluding VAT)
   * @returns The VAT amount
   */
  static calculateVAT(amount: number | Decimal): number {
    const numericAmount = typeof amount === 'number' ? amount : parseFloat(amount.toString());
    return Math.round(numericAmount * this.VAT_RATE * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Calculate total amount including VAT
   * @param baseAmount - The base amount (excluding VAT)
   * @returns The total amount including VAT
   */
  static calculateTotalWithVAT(baseAmount: number | Decimal): number {
    const numericAmount = typeof baseAmount === 'number' ? baseAmount : parseFloat(baseAmount.toString());
    return Math.round(numericAmount * (1 + this.VAT_RATE) * 100) / 100;
  }

  /**
   * Extract VAT amount from a total amount that includes VAT
   * @param totalAmount - The total amount including VAT
   * @returns The VAT amount
   */
  static extractVATFromTotal(totalAmount: number | Decimal): number {
    const numericAmount = typeof totalAmount === 'number' ? totalAmount : parseFloat(totalAmount.toString());
    const baseAmount = numericAmount / (1 + this.VAT_RATE);
    return Math.round((numericAmount - baseAmount) * 100) / 100;
  }

  /**
   * Get the VAT rate as a percentage
   * @returns The VAT rate as a percentage
   */
  static getVATRate(): number {
    return this.VAT_RATE * 100;
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