// @ts-nocheck
import { describe, it, expect } from '@jest/globals';
import VATService from '../../services/VATService';

describe('VATService', () => {
  describe('calculateVAT', () => {
    it('should calculate VAT correctly for a given amount', () => {
      const amount = 1000;
      const expectedVAT = 155; // 15.5% of 1000

      const result = VATService.calculateVAT(amount);

      expect(result).toBe(expectedVAT);
    });

    it('should handle decimal amounts correctly', () => {
      const amount = 100.5;
      const expectedVAT = 15.58; // 15.5% of 100.50, rounded to 2 decimal places

      const result = VATService.calculateVAT(amount);

      expect(result).toBe(expectedVAT);
    });

    it('should handle zero amount', () => {
      const amount = 0;
      const expectedVAT = 0;

      const result = VATService.calculateVAT(amount);

      expect(result).toBe(expectedVAT);
    });

    it('should handle Prisma Decimal type', () => {
      const amount = {
        toString: () => '500.75',
        d: [50075, 0],
        e: 2,
        s: 1
      } as any;
      const expectedVAT = 77.62; // 15.5% of 500.75, rounded to 2 decimal places

      const result = VATService.calculateVAT(amount);

      expect(result).toBe(expectedVAT);
    });

    it('tax invoice UAT: 100.00 net → VAT 15.50', () => {
      expect(VATService.calculateVAT(100)).toBe(15.5);
      expect(VATService.calculateTotalWithVAT(100)).toBe(115.5);
    });
  });

  describe('calculateTotalWithVAT', () => {
    it('should calculate total with VAT correctly', () => {
      const baseAmount = 1000;
      const expectedTotal = 1155; // 1000 + 15.5% VAT

      const result = VATService.calculateTotalWithVAT(baseAmount);

      expect(result).toBe(expectedTotal);
    });

    it('should handle decimal amounts correctly', () => {
      const baseAmount = 100.5;
      const expectedTotal = 116.08; // 100.50 + 15.5% VAT, rounded to 2 decimal places

      const result = VATService.calculateTotalWithVAT(baseAmount);

      expect(result).toBe(expectedTotal);
    });

    it('should handle zero amount', () => {
      const baseAmount = 0;
      const expectedTotal = 0;

      const result = VATService.calculateTotalWithVAT(baseAmount);

      expect(result).toBe(expectedTotal);
    });
  });

  describe('extractVATFromTotal', () => {
    it('should extract VAT amount from a total amount correctly', () => {
      const totalAmount = 1155;
      const expectedVAT = 155; // VAT portion of 1155

      const result = VATService.extractVATFromTotal(totalAmount);

      expect(result).toBe(expectedVAT);
    });

    it('should handle decimal totals correctly', () => {
      const totalAmount = 116.08;
      const expectedVAT = 15.58; // VAT portion, rounded to 2 decimal places

      const result = VATService.extractVATFromTotal(totalAmount);

      expect(result).toBe(expectedVAT);
    });

    it('should handle zero total', () => {
      const totalAmount = 0;
      const expectedVAT = 0;

      const result = VATService.extractVATFromTotal(totalAmount);

      expect(result).toBe(expectedVAT);
    });
  });

  describe('getVATRate', () => {
    it('should return the correct VAT rate as percentage', () => {
      const result = VATService.getVATRate();

      expect(result).toBeCloseTo(15.5, 5);
    });
  });

  describe('isVATEligible', () => {
    it('should return true for taxable positive amounts', () => {
      const amount = 100;
      const isTaxable = true;

      const result = VATService.isVATEligible(amount, isTaxable);

      expect(result).toBe(true);
    });

    it('should return false for non-taxable amounts', () => {
      const amount = 100;
      const isTaxable = false;

      const result = VATService.isVATEligible(amount, isTaxable);

      expect(result).toBe(false);
    });

    it('should return false for zero amounts', () => {
      const amount = 0;
      const isTaxable = true;

      const result = VATService.isVATEligible(amount, isTaxable);

      expect(result).toBe(false);
    });

    it('should return false for negative amounts', () => {
      const amount = -100;
      const isTaxable = true;

      const result = VATService.isVATEligible(amount, isTaxable);

      expect(result).toBe(false);
    });
  });

  describe('VAT Rate Consistency', () => {
    it('should maintain consistent VAT rate across all calculations', () => {
      const baseAmount = 1000;
      const calculatedVAT = VATService.calculateVAT(baseAmount);
      const totalWithVAT = VATService.calculateTotalWithVAT(baseAmount);
      const extractedVAT = VATService.extractVATFromTotal(totalWithVAT);

      expect(extractedVAT).toBe(calculatedVAT);

      expect(totalWithVAT).toBe(baseAmount + calculatedVAT);
    });
  });
});
