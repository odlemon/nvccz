// @ts-nocheck
import { describe, it, expect } from '@jest/globals';
import VATService from '../../services/VATService';

describe('VATService', () => {
  describe('calculateVAT', () => {
    it('should calculate VAT correctly for a given amount', () => {
      const amount = 1000;
      const expectedVAT = 145; // 14.5% of 1000
      
      const result = VATService.calculateVAT(amount);
      
      expect(result).toBe(expectedVAT);
    });

    it('should handle decimal amounts correctly', () => {
      const amount = 100.50;
      const expectedVAT = 14.57; // 14.5% of 100.50, rounded to 2 decimal places
      
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
      // Mock a Prisma Decimal object
      const amount = {
        toString: () => '500.75',
        d: [50075, 0],
        e: 2,
        s: 1
      } as any;
      const expectedVAT = 72.61; // 14.5% of 500.75, rounded to 2 decimal places
      
      const result = VATService.calculateVAT(amount);
      
      expect(result).toBe(expectedVAT);
    });
  });

  describe('calculateTotalWithVAT', () => {
    it('should calculate total with VAT correctly', () => {
      const baseAmount = 1000;
      const expectedTotal = 1145; // 1000 + 14.5% VAT
      
      const result = VATService.calculateTotalWithVAT(baseAmount);
      
      expect(result).toBe(expectedTotal);
    });

    it('should handle decimal amounts correctly', () => {
      const baseAmount = 100.50;
      const expectedTotal = 115.07; // 100.50 + 14.5% VAT, rounded to 2 decimal places
      
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
    it('should extract VAT amount from total correctly', () => {
      const totalAmount = 1145;
      const expectedVAT = 145; // VAT portion of 1145
      
      const result = VATService.extractVATFromTotal(totalAmount);
      
      expect(result).toBe(expectedVAT);
    });

    it('should handle decimal totals correctly', () => {
      const totalAmount = 115.07;
      const expectedVAT = 14.57; // VAT portion of 115.07, rounded to 2 decimal places
      
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
      const expectedRate = 14.5;
      
      const result = VATService.getVATRate();
      
      expect(result).toBeCloseTo(expectedRate, 1);
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
      
      // The extracted VAT should equal the calculated VAT
      expect(extractedVAT).toBe(calculatedVAT);
      
      // The total should equal base + VAT
      expect(totalWithVAT).toBe(baseAmount + calculatedVAT);
    });
  });
}); 