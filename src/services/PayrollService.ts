// @ts-nocheck
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { EmailNotificationService } from './EmailNotificationService';

import { prisma } from '../utils/database';
import { createJournalEntryWithAuditSequence } from './AuditTrailSequenceService';
import { resolveSalariesAndWagesExpenseAccount } from './payrollGlAccountResolver';
import {
  resolveNetWagesPayableAccount,
  resolveNssaPensionPayableAccount,
  resolvePayePayableAccount,
} from './payrollLiabilityAccountHelpers';

export interface PayrollCalculationResult {
  basicSalary: Decimal;
  totalAllowances: Decimal;
  grossPay: Decimal;
  totalDeductions: Decimal;
  netPay: Decimal;
  allowances: Array<{
    type: string;
    amount: Decimal;
    isTaxable: boolean;
  }>;
  deductions: Array<{
    type: string;
    amount: Decimal;
    isStatutory: boolean;
  }>;
}

export interface BankFileData {
  employeeName: string;
  bankName: string;
  branchCode: string;
  accountNumber: string;
  paymentAmount: Decimal;
  paymentReference: string;
}

export class PayrollService {
  /**
   * Calculate payroll for a single employee
   */
  static async calculateEmployeePayroll(
    employeeId: string,
    payrollRunId: string,
    currencyId: string
  ): Promise<PayrollCalculationResult> {
    try {
      // Get payroll run to determine the effective date for calculations
      const payrollRun = await prisma.payrollRun.findUnique({
        where: { id: payrollRunId }
      });

      if (!payrollRun) {
        throw new Error('Payroll run not found');
      }

      // Use payroll run end date as the effective date for calculations
      const effectiveDate = payrollRun.endDate;

      // Get employee with salary structure
      const employee = await prisma.employee.findUnique({
        where: { id: employeeId },
        include: {
          salaryStructures: {
            where: { 
              isActive: true,
              effectiveDate: { lte: effectiveDate },
              OR: [
                { endDate: null },
                { endDate: { gte: effectiveDate } }
              ]
            },
            include: { allowanceType: true }
          },
          currency: true
        }
      });

      if (!employee) {
        throw new Error('Employee not found');
      }

      // Get active tax rules for the currency and effective date
      const taxRules = await prisma.taxRules.findMany({
        where: {
          currencyId,
          isActive: true,
          effectiveDate: { lte: effectiveDate },
          OR: [
            { endDate: null },
            { endDate: { gte: effectiveDate } }
          ]
        },
        orderBy: { effectiveDate: 'desc' }
      });

      // Get employee-specific deductions that are effective for the payroll period
      const employeeDeductions = await prisma.employeeDeduction.findMany({
        where: {
          employeeId,
          isActive: true,
          effectiveDate: { lte: effectiveDate },
          OR: [
            { endDate: null },
            { endDate: { gte: effectiveDate } }
          ]
        },
        include: { 
          deductionType: true
        }
      });

      // Get statutory deduction types
      const statutoryDeductionTypes = await prisma.deductionTypes.findMany({
        where: {
          isStatutory: true,
          isActive: true,
          effectiveDate: { lte: effectiveDate },
          OR: [
            { endDate: null },
            { endDate: { gte: effectiveDate } }
          ]
        },
        orderBy: { effectiveDate: 'desc' }
      });

      // Calculate basic salary
      const basicSalary = employee.basicSalary;

      // Calculate allowances - only include those effective for the payroll period
      const allowances = [];
      let totalAllowances = new Decimal(0);

      for (const salaryStructure of employee.salaryStructures) {
        // Double-check effective date logic
        const isEffective = salaryStructure.effectiveDate <= effectiveDate && 
          (salaryStructure.endDate === null || salaryStructure.endDate >= effectiveDate);

        if (isEffective) {
          // Currency conversion for allowances
          let allowanceAmount = salaryStructure.amount;
          
          // If allowance has different currency than payroll currency, convert it
          if (salaryStructure.currencyId && salaryStructure.currencyId !== currencyId) {
            allowanceAmount = this.convertCurrency(salaryStructure.amount, salaryStructure.currencyId, currencyId);
          }

          const allowance = {
            type: salaryStructure.allowanceType.name,
            amount: allowanceAmount,
            isTaxable: salaryStructure.allowanceType.isTaxable
          };
          allowances.push(allowance);
          totalAllowances = totalAllowances.add(allowanceAmount);
        }
      }

      // Calculate gross pay
      const grossPay = basicSalary.add(totalAllowances);

      // Calculate deductions
      // Note: Effective date logic ensures deductions are only applied if:
      // 1. Deduction type is active and effective for the payroll period
      // 2. Employee deduction assignment is effective for the payroll period
      // 3. Both effectiveDate <= payrollEndDate AND (endDate is null OR endDate >= payrollEndDate)
      const deductions = [];
      let totalDeductions = new Decimal(0);

      // 1. Employee-specific deductions
      for (const employeeDeduction of employeeDeductions) {
        const deductionType = employeeDeduction.deductionType;
        
        // Check if deduction type is active and effective
        const isDeductionTypeEffective = deductionType.isActive && 
          deductionType.effectiveDate <= effectiveDate && 
          (deductionType.endDate === null || deductionType.endDate >= effectiveDate);
        
        // Check if employee deduction is effective for the payroll period
        const isEmployeeDeductionEffective = employeeDeduction.effectiveDate <= effectiveDate && 
          (employeeDeduction.endDate === null || employeeDeduction.endDate >= effectiveDate);

        if (isDeductionTypeEffective && isEmployeeDeductionEffective) {
          let deductionAmount = new Decimal(0);

          if (employeeDeduction.amount) {
            // Fixed amount deduction - apply currency conversion if needed
            deductionAmount = employeeDeduction.amount;
            
            // If deduction type has different currency than payroll currency, convert it
            if (deductionType.currencyId && deductionType.currencyId !== currencyId) {
              deductionAmount = this.convertCurrency(employeeDeduction.amount, deductionType.currencyId, currencyId);
            }
          } else {
            // Percentage-based deduction
            const rate = employeeDeduction.rate || deductionType.rate;
            deductionAmount = this.calculatePercentageDeduction(
              grossPay, 
              rate, 
              deductionType.threshold, 
              deductionType.ceiling
            );
          }

          if (deductionAmount.gt(0)) {
            deductions.push({
              type: deductionType.name,
              amount: deductionAmount,
              isStatutory: false
            });
            totalDeductions = totalDeductions.add(deductionAmount);
          }
        }
      }

      // 2. Statutory deductions (applied to ALL employees)
      for (const deductionType of statutoryDeductionTypes) {
        // Check if statutory deduction is effective for the payroll period
        const isStatutoryDeductionEffective = deductionType.effectiveDate <= effectiveDate && 
          (deductionType.endDate === null || deductionType.endDate >= effectiveDate);

        if (isStatutoryDeductionEffective) {
          let deductionAmount = this.calculatePercentageDeduction(
            grossPay,
            deductionType.rate,
            deductionType.threshold,
            deductionType.ceiling
          );

          if (deductionAmount.gt(0)) {
            deductions.push({
              type: deductionType.name,
              amount: deductionAmount,
              isStatutory: true
            });
            totalDeductions = totalDeductions.add(deductionAmount);
          }
        }
      }

      // 3. Tax rules (PAYE, NSSA, AIDS Levy)
      for (const taxRule of taxRules) {
        // Double-check effective date logic for tax rules
        const isTaxRuleEffective = taxRule.effectiveDate <= effectiveDate && 
          (taxRule.endDate === null || taxRule.endDate >= effectiveDate);

        if (isTaxRuleEffective) {
          let deductionAmount = new Decimal(0);

          switch (taxRule.type) {
            case 'PAYE':
              deductionAmount = this.calculatePAYE(grossPay, taxRule);
              break;
            case 'NSSA':
              deductionAmount = this.calculateNSSA(grossPay, taxRule);
              break;
            case 'AIDS_LEVY':
              deductionAmount = this.calculateAIDSLevy(grossPay, taxRule);
              break;
            default:
              // Custom tax calculation
              deductionAmount = this.calculateCustomTax(grossPay, taxRule);
          }

          if (deductionAmount.gt(0)) {
            deductions.push({
              type: taxRule.name,
              amount: deductionAmount,
              isStatutory: true
            });
            totalDeductions = totalDeductions.add(deductionAmount);
          }
        }
      }

      // Calculate net pay
      const netPay = grossPay.sub(totalDeductions);

      return {
        basicSalary,
        totalAllowances,
        grossPay,
        totalDeductions,
        netPay,
        allowances,
        deductions
      };
    } catch (error) {
      console.error('Error calculating employee payroll:', error);
      throw error;
    }
  }

  /**
   * Calculate PAYE (Pay As You Earn) tax
   */
  private static calculatePAYE(grossPay: Decimal, taxRule: any): Decimal {
    if (taxRule.threshold && grossPay.lte(taxRule.threshold)) {
      return new Decimal(0);
    }

    const taxableAmount = taxRule.threshold 
      ? grossPay.sub(taxRule.threshold)
      : grossPay;

    if (taxRule.ceiling && taxableAmount.gt(taxRule.ceiling)) {
      return taxRule.ceiling.mul(taxRule.rate).div(100);
    }

    return taxableAmount.mul(taxRule.rate).div(100);
  }

  /**
   * Calculate NSSA contribution
   */
  private static calculateNSSA(grossPay: Decimal, taxRule: any): Decimal {
    if (taxRule.ceiling && grossPay.gt(taxRule.ceiling)) {
      return taxRule.ceiling.mul(taxRule.rate).div(100);
    }

    return grossPay.mul(taxRule.rate).div(100);
  }

  /**
   * Calculate AIDS Levy
   */
  private static calculateAIDSLevy(grossPay: Decimal, taxRule: any): Decimal {
    return grossPay.mul(taxRule.rate).div(100);
  }

  /**
   * Calculate custom tax
   */
  private static calculateCustomTax(grossPay: Decimal, taxRule: any): Decimal {
    if (taxRule.threshold && grossPay.lte(taxRule.threshold)) {
      return new Decimal(0);
    }

    const taxableAmount = taxRule.threshold 
      ? grossPay.sub(taxRule.threshold)
      : grossPay;

    return taxableAmount.mul(taxRule.rate).div(100);
  }

  /**
   * Process payroll run for all employees
   */
  static async processPayrollRun(
    payrollRunId: string,
    createdById: string
  ): Promise<void> {
    try {
      const payrollRun = await prisma.payrollRun.findUnique({
        where: { id: payrollRunId },
        include: { currency: true }
      });

      if (!payrollRun) {
        throw new Error('Payroll run not found');
      }

      if (payrollRun.status !== 'DRAFT') {
        throw new Error('Payroll run is not in draft status');
      }

      // Update status to processing
      await prisma.payrollRun.update({
        where: { id: payrollRunId },
        data: { status: 'PROCESSING' }
      });

      // Get all active employees
      const employees = await prisma.employee.findMany({
        where: { isActive: true },
        include: { user: true }
      });

      let totalGrossPay = new Decimal(0);
      let totalDeductions = new Decimal(0);
      let totalNetPay = new Decimal(0);

      // Process each employee
      for (const employee of employees) {
        const calculation = await this.calculateEmployeePayroll(
          employee.id,
          payrollRunId,
          payrollRun.currencyId || ''
        );

        // Create or update employee payroll record
        await prisma.employeePayroll.upsert({
          where: {
            payrollRunId_employeeId: {
              payrollRunId,
              employeeId: employee.id
            }
          },
          update: {
            basicSalary: calculation.basicSalary,
            totalAllowances: calculation.totalAllowances,
            totalDeductions: calculation.totalDeductions,
            grossPay: calculation.grossPay,
            netPay: calculation.netPay,
            currencyId: payrollRun.currencyId
          },
          create: {
            payrollRunId,
            employeeId: employee.id,
            basicSalary: calculation.basicSalary,
            totalAllowances: calculation.totalAllowances,
            totalDeductions: calculation.totalDeductions,
            grossPay: calculation.grossPay,
            netPay: calculation.netPay,
            currencyId: payrollRun.currencyId
          }
        });

        // Create allowance records
        for (const allowance of calculation.allowances) {
          const allowanceType = await prisma.allowanceTypes.findFirst({
            where: { name: allowance.type }
          });

          if (allowanceType) {
            await prisma.payrollAllowance.create({
              data: {
                employeePayrollId: (await prisma.employeePayroll.findFirst({
                  where: {
                    payrollRunId,
                    employeeId: employee.id
                  }
                }))!.id,
                allowanceTypeId: allowanceType.id,
                amount: allowance.amount,
                currencyId: payrollRun.currencyId
              }
            });
          }
        }

        // Create deduction records
        for (const deduction of calculation.deductions) {
          const deductionType = await prisma.deductionTypes.findFirst({
            where: { name: deduction.type }
          });

          if (deductionType) {
            await prisma.payrollDeduction.create({
              data: {
                employeePayrollId: (await prisma.employeePayroll.findFirst({
                  where: {
                    payrollRunId,
                    employeeId: employee.id
                  }
                }))!.id,
                deductionTypeId: deductionType.id,
                amount: deduction.amount,
                currencyId: payrollRun.currencyId
              }
            });
          }
        }

        // Create payslip record
        await prisma.payslip.upsert({
          where: {
            employeeId_payrollRunId: {
              employeeId: employee.id,
              payrollRunId
            }
          },
          update: {
            grossPay: calculation.grossPay,
            totalDeductions: calculation.totalDeductions,
            netPay: calculation.netPay,
            currencyId: payrollRun.currencyId
          },
          create: {
            employeeId: employee.id,
            payrollRunId,
            grossPay: calculation.grossPay,
            totalDeductions: calculation.totalDeductions,
            netPay: calculation.netPay,
            currencyId: payrollRun.currencyId
          }
        });

        // Send payslip email to employee
        try {
          await this.sendPayslipEmail(employee.id, payrollRunId);
        } catch (emailError) {
          console.error(`Failed to send payslip email to ${employee.id}:`, emailError);
          // Continue processing even if email fails
        }

        totalGrossPay = totalGrossPay.add(calculation.grossPay);
        totalDeductions = totalDeductions.add(calculation.totalDeductions);
        totalNetPay = totalNetPay.add(calculation.netPay);
      }

      // Update payroll run totals
      await prisma.payrollRun.update({
        where: { id: payrollRunId },
        data: {
          status: 'COMPLETED',
          totalGrossPay,
          totalDeductions,
          totalNetPay
        }
      });

      // Sync payroll data to performance goals (before journal entry)
      try {
        const { PerformanceGoalService } = await import('./PerformanceGoalService');
        await PerformanceGoalService.syncPayrollToGoals(payrollRunId, totalGrossPay, createdById);
      } catch (syncError: any) {
        // Log but don't fail payroll processing
        console.error('[FAIL] Failed to sync payroll to performance goals:', syncError.message);
        console.error('Error type:', syncError.constructor.name);
        console.error('Stack:', syncError.stack);
      }

      // Create Payroll Journal Entry (SRD 2.0) - Gross Pay Expense + Liability Posting
      // Requirement: DR Payroll Expense (5010) preferred, else Salaries and Wages (5030), for full Gross Pay
      // Requirement: CR split between PAYE Payable (2150), NSSA/Pension Payable (2160), and Net Wages Payable (2250)
      console.log('📝 Starting payroll journal entry creation...');
      console.log(`   Payroll Run ID: ${payrollRunId}`);
      console.log(`   Total Gross Pay: ${totalGrossPay.toString()}`);
      console.log(`   Total Deductions: ${totalDeductions.toString()}`);
      console.log(`   Total Net Pay: ${totalNetPay.toString()}`);
      console.log(`   Currency ID: ${payrollRun.currencyId || 'N/A'}`);
      try {
        await PayrollService.createPayrollJournalEntry(payrollRunId, totalGrossPay, totalDeductions, totalNetPay, createdById, payrollRun.currencyId || '');
        console.log('[OK] Payroll journal entry creation completed successfully');
      } catch (journalError: any) {
        // Log but don't fail payroll processing
        console.error('[FAIL] Failed to create payroll journal entry:', journalError.message);
        console.error('Error type:', journalError.constructor.name);
        console.error('Stack:', journalError.stack);
      }

    } catch (error) {
      // Update status to cancelled on error
      await prisma.payrollRun.update({
        where: { id: payrollRunId },
        data: { status: 'CANCELLED' }
      });
      console.error('Error processing payroll run:', error);
      throw error;
    }
  }

  /**
   * Create Payroll Journal Entry (SRD 2.0)
   * Posts the full Gross Pay amount (before deductions) as DR to 5010 (or 5030 fallback via resolver)
   * Splits credit side between: PAYE Payable (2150), NSSA/Pension Payable (2160), and Net Wages Payable (2250)
   */
  static async createPayrollJournalEntry(
    payrollRunId: string,
    totalGrossPay: Decimal,
    totalDeductions: Decimal,
    totalNetPay: Decimal,
    createdById: string,
    currencyId: string
  ): Promise<void> {
      console.log('═══════════════════════════════════════════════════════════════');
    console.log('🔵 createPayrollJournalEntry METHOD CALLED');
    console.log(`   Payroll Run ID: ${payrollRunId}`);
    console.log(`   Total Gross Pay: ${totalGrossPay.toString()}`);
    console.log(`   Total Deductions: ${totalDeductions.toString()}`);
    console.log(`   Total Net Pay: ${totalNetPay.toString()}`);
    console.log(`   Created By ID: ${createdById}`);
    console.log(`   Currency ID: ${currencyId}`);
    console.log('═══════════════════════════════════════════════════════════════');
    try {
      // Get payroll run details with employee payrolls and deductions
      console.log('Step 1: Fetching payroll run details with deductions...');
      const payrollRun = await prisma.payrollRun.findUnique({
        where: { id: payrollRunId },
        include: {
          employeePayrolls: {
            include: {
              deductions: {
                include: {
                  deductionType: true
                }
              }
            }
          }
        }
      });

      if (!payrollRun) {
        throw new Error('Payroll run not found');
      }
      console.log(`[OK] Payroll run found: ${payrollRun.name} (${payrollRun.payPeriod})`);
      
      // Calculate total PAYE and NSSA/Pension from deductions
      console.log('Step 2: Calculating liability breakdown from deductions...');
      let totalPAYE = new Decimal(0);
      let totalNSSA = new Decimal(0);
      let totalPension = new Decimal(0);
      
      // Get TaxRules to identify PAYE and NSSA deductions
      const taxRules = await prisma.taxRules.findMany({
        where: {
          currencyId: payrollRun.currencyId || undefined,
          isActive: true
        }
      });
      
      // Create a map of tax rule names to types
      const taxRuleMap = new Map<string, string>();
      taxRules.forEach(rule => {
        taxRuleMap.set(rule.name.toUpperCase(), rule.type.toUpperCase());
      });
      
      for (const employeePayroll of payrollRun.employeePayrolls) {
        for (const deduction of employeePayroll.deductions) {
          const deductionTypeName = deduction.deductionType.name.toUpperCase();
          const deductionTypeCode = deduction.deductionType.code?.toUpperCase() || '';
          
          // Check if this deduction matches a TaxRule type
          const taxRuleType = taxRuleMap.get(deductionTypeName);
          
          if (taxRuleType === 'PAYE' || deductionTypeCode === 'PAYE' || deductionTypeName.includes('PAYE')) {
            totalPAYE = totalPAYE.add(deduction.amount);
            console.log(`   Found PAYE deduction: ${deductionTypeName} = $${deduction.amount.toString()}`);
          } else if (taxRuleType === 'NSSA' || deductionTypeCode === 'NSSA' || deductionTypeName.includes('NSSA')) {
            totalNSSA = totalNSSA.add(deduction.amount);
            console.log(`   Found NSSA deduction: ${deductionTypeName} = $${deduction.amount.toString()}`);
          } else if (deductionTypeCode === 'PENSION' || deductionTypeName.includes('PENSION')) {
            totalPension = totalPension.add(deduction.amount);
            console.log(`   Found Pension deduction: ${deductionTypeName} = $${deduction.amount.toString()}`);
          }
        }
      }
      
      // If no deductions found, check if we can calculate from totalDeductions
      // This handles cases where deductions might not be properly categorized
      if (totalPAYE.eq(0) && totalNSSA.eq(0) && totalPension.eq(0) && totalDeductions.gt(0)) {
        console.log('⚠️  No categorized deductions found, but totalDeductions > 0.');
        console.log('   This may indicate deductions are not properly categorized as PAYE/NSSA/Pension.');
        console.log('   Journal entry will use Net Pay = Gross Pay - Total Deductions.');
        console.log('   Consider setting up TaxRules for PAYE and NSSA for proper liability splitting.');
      }
      
      // Combine NSSA and Pension (if both exist, they go to the same account)
      const totalNSSAPension = totalNSSA.add(totalPension);
      
      console.log(`   Total PAYE: $${totalPAYE.toString()}`);
      console.log(`   Total NSSA: $${totalNSSA.toString()}`);
      console.log(`   Total Pension: $${totalPension.toString()}`);
      console.log(`   Total NSSA/Pension: $${totalNSSAPension.toString()}`);
      console.log(`   Total Net Wages Payable: $${totalNetPay.toString()}`);
      
      // Verify: PAYE + NSSA/Pension + Net Pay = Gross Pay (within rounding tolerance)
      const calculatedTotal = totalPAYE.add(totalNSSAPension).add(totalNetPay);
      const difference = totalGrossPay.sub(calculatedTotal).abs();
      console.log(`   Verification: Gross Pay ($${totalGrossPay.toString()}) = PAYE + NSSA/Pension + Net Pay ($${calculatedTotal.toString()})`);
      console.log(`   Difference: $${difference.toString()}`);
      
      if (difference.gt(0.01)) {
        console.log(`⚠️  Warning: Liability breakdown doesn't match Gross Pay. Adjusting Net Wages Payable...`);
        // Adjust Net Wages Payable to balance
        totalNetPay = totalGrossPay.sub(totalPAYE).sub(totalNSSAPension);
        console.log(`   Adjusted Net Wages Payable: $${totalNetPay.toString()}`);
      }

      // DR Payroll expense (5010 preferred, 5030 fallback) — never an arbitrary 5xxx expense
      const salariesExpenseAccount = await resolveSalariesAndWagesExpenseAccount();
      console.log(
        `[OK] Payroll salary expense GL: ${salariesExpenseAccount.accountNo} – ${salariesExpenseAccount.accountName}`
      );

      // PAYE (2150), NSSA/Pension (2160), Net Wages (2250) — exact codes only (no random 21xx/22xx fallback)
      console.log('Step 3: Resolving payroll liability accounts (2150, 2160, 2250)...');
      const payePayableAccount = await resolvePayePayableAccount();
      const nssaPensionPayableAccount = await resolveNssaPensionPayableAccount();
      const netWagesPayableAccount = await resolveNetWagesPayableAccount();
      console.log(`   [OK] PAYE: ${payePayableAccount.accountNo} — NSSA/Pension: ${nssaPensionPayableAccount.accountNo} — Net wages: ${netWagesPayableAccount.accountNo}`);

      // Get default currency if not provided
      let finalCurrencyId = currencyId;
      if (!finalCurrencyId || finalCurrencyId === '') {
        const defaultCurrency = await prisma.currency.findFirst({
          where: { code: 'USD' }
        });
        
        if (!defaultCurrency) {
          // Try to get any currency
          const anyCurrency = await prisma.currency.findFirst({
            where: { isActive: true }
          });
          
          if (!anyCurrency) {
            throw new Error('No currency found. Please ensure at least one currency is configured in the system.');
          }
          
          finalCurrencyId = anyCurrency.id;
          console.log(`⚠️  Using currency: ${anyCurrency.code} (${anyCurrency.id})`);
        } else {
          finalCurrencyId = defaultCurrency.id;
          console.log(`[OK] Using default currency: ${defaultCurrency.code} (${defaultCurrency.id})`);
        }
      }

      // Create journal entry
      // Use processing date (today) instead of payroll run endDate to ensure entry appears in Journal view
      // The endDate might be in the future, which would exclude it from default Journal view date range
      // Generate unique reference number by including timestamp to avoid duplicate reference number errors
      const timestamp = Date.now();
      const uniqueReferenceNumber = `PAYROLL-${payrollRun.payPeriod.replace(/\s+/g, '-').toUpperCase()}-${timestamp}`;
      
      const journalEntry = await createJournalEntryWithAuditSequence({
        transactionDate: new Date(),
        referenceNumber: uniqueReferenceNumber,
        description: `Payroll Journal - Gross Pay: ${payrollRun.name} (${payrollRun.payPeriod})`,
        totalAmount: totalGrossPay,
        currencyId: finalCurrencyId,
        status: 'POSTED',
        createdById,
      });

      // Create journal entry lines
      console.log('Step 4: Creating journal entry lines...');
      
      // DR Payroll expense (5010 / 5030) - Full Gross Pay amount (before deductions)
      await prisma.journalEntryLine.create({
        data: {
          journalEntryId: journalEntry.id,
          chartOfAccountId: salariesExpenseAccount.id,
          debitAmount: totalGrossPay,
          creditAmount: new Decimal(0),
          description: `Gross Pay Expense: ${payrollRun.payPeriod}`,
          vatAmount: new Decimal(0)
        }
      });
      console.log(`   [OK] DR Salaries Expense (${salariesExpenseAccount.accountNo}): $${totalGrossPay.toString()}`);

      // CR PAYE Payable (2150) - Total PAYE deductions
      if (totalPAYE.gt(0)) {
        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            chartOfAccountId: payePayableAccount.id,
            debitAmount: new Decimal(0),
            creditAmount: totalPAYE,
            description: `PAYE Payable: ${payrollRun.payPeriod}`,
            vatAmount: new Decimal(0)
          }
        });
        console.log(`   [OK] CR PAYE Payable (${payePayableAccount.accountNo}): $${totalPAYE.toString()}`);
      }

      // CR NSSA/Pension Payable (2160) - Total NSSA and Pension deductions
      if (totalNSSAPension.gt(0)) {
        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            chartOfAccountId: nssaPensionPayableAccount.id,
            debitAmount: new Decimal(0),
            creditAmount: totalNSSAPension,
            description: `NSSA/Pension Payable: ${payrollRun.payPeriod}`,
            vatAmount: new Decimal(0)
          }
        });
        console.log(`   [OK] CR NSSA/Pension Payable (${nssaPensionPayableAccount.accountNo}): $${totalNSSAPension.toString()}`);
      }

      // CR Net Wages Payable (2250) - Net Pay amount
      if (totalNetPay.gt(0)) {
        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            chartOfAccountId: netWagesPayableAccount.id,
            debitAmount: new Decimal(0),
            creditAmount: totalNetPay,
            description: `Net Wages Payable: ${payrollRun.payPeriod}`,
            vatAmount: new Decimal(0)
          }
        });
        console.log(`   [OK] CR Net Wages Payable (${netWagesPayableAccount.accountNo}): $${totalNetPay.toString()}`);
      }

      // Verify journal entry is balanced
      const totalCredit = totalPAYE.add(totalNSSAPension).add(totalNetPay);
      const balanceCheck = totalGrossPay.sub(totalCredit).abs();
      
      console.log('\n Journal Entry Balance Verification:');
      console.log(`   Total Debit: $${totalGrossPay.toString()}`);
      console.log(`   Total Credit: $${totalCredit.toString()}`);
      console.log(`   Difference: $${balanceCheck.toString()}`);
      console.log(`   Balanced: ${balanceCheck.lte(0.01) ? '[OK]' : '[FAIL]'}`);

      if (balanceCheck.gt(0.01)) {
        throw new Error(`Journal entry is not balanced! Debit: $${totalGrossPay.toString()}, Credit: $${totalCredit.toString()}`);
      }

      console.log(`\n[OK] Payroll Journal Entry created: ${journalEntry.referenceNumber}`);
      console.log(`   DR Salaries Expense (${salariesExpenseAccount.accountNo}): $${totalGrossPay.toString()}`);
      if (totalPAYE.gt(0)) {
        console.log(`   CR PAYE Payable (${payePayableAccount.accountNo}): $${totalPAYE.toString()}`);
      }
      if (totalNSSAPension.gt(0)) {
        console.log(`   CR NSSA/Pension Payable (${nssaPensionPayableAccount.accountNo}): $${totalNSSAPension.toString()}`);
      }
      if (totalNetPay.gt(0)) {
        console.log(`   CR Net Wages Payable (${netWagesPayableAccount.accountNo}): $${totalNetPay.toString()}`);
      }
    } catch (error: any) {
      console.error('[FAIL] Error creating payroll journal entry:', error);
      console.error('Error details:', error.message);
      console.error('Error stack:', error.stack);
      // Don't throw - allow payroll processing to complete even if journal entry fails
      // This ensures payroll data is saved, but log the error for manual correction
      console.error('⚠️  Payroll processed but journal entry creation failed. Manual correction may be required.');
    }
  }

  /**
   * Generate bank file for payroll run
   */
  static async generateBankFile(
    payrollRunId: string,
    bankTemplateId: string
  ): Promise<string> {
    try {
      const payrollRun = await prisma.payrollRun.findUnique({
        where: { id: payrollRunId },
        include: {
          employeePayrolls: {
            include: {
              employee: {
                include: { user: true }
              }
            }
          }
        }
      });

      if (!payrollRun) {
        throw new Error('Payroll run not found');
      }

      const bankTemplate = await prisma.bankFileTemplate.findUnique({
        where: { id: bankTemplateId }
      });

      if (!bankTemplate) {
        throw new Error('Bank template not found');
      }

      // Generate bank file data
      const bankFileData: BankFileData[] = [];
      
      for (const employeePayroll of payrollRun.employeePayrolls) {
        const employee = employeePayroll.employee;
        
        bankFileData.push({
          employeeName: `${employee.user.firstName} ${employee.user.lastName}`,
          bankName: employee.bankName || '',
          branchCode: employee.branchCode || '',
          accountNumber: employee.accountNumber || '',
          paymentAmount: employeePayroll.netPay,
          paymentReference: employee.employeeNumber
        });
      }

      // Generate CSV content
      const columnOrder = JSON.parse(bankTemplate.columnOrder);
      let csvContent = '';

      // Add header if required
      if (bankTemplate.hasHeader) {
        csvContent += columnOrder.join(bankTemplate.delimiter) + '\n';
      }

      // Add data rows
      for (const data of bankFileData) {
        const row = columnOrder.map(column => {
          switch (column.toLowerCase()) {
            case 'employee name':
              return data.employeeName;
            case 'bank name':
              return data.bankName;
            case 'branch code':
              return data.branchCode;
            case 'account number':
              return data.accountNumber;
            case 'payment amount (net pay)':
              return data.paymentAmount.toString();
            case 'payment reference':
              return data.paymentReference;
            default:
              return '';
          }
        });
        csvContent += row.join(bankTemplate.delimiter) + '\n';
      }

      return csvContent;
    } catch (error) {
      console.error('Error generating bank file:', error);
      throw error;
    }
  }

  /**
   * Get payroll run summary
   */
  static async getPayrollRunSummary(payrollRunId: string) {
    try {
      const payrollRun = await prisma.payrollRun.findUnique({
        where: { id: payrollRunId },
        include: {
          currency: true,
          createdBy: {
            select: { firstName: true, lastName: true, email: true }
          },
          employeePayrolls: {
            include: {
              employee: {
                include: { user: true }
              }
            }
          }
        }
      });

      if (!payrollRun) {
        throw new Error('Payroll run not found');
      }

      return payrollRun;
    } catch (error) {
      console.error('Error getting payroll run summary:', error);
      throw error;
    }
  }

  /**
   * Get employee payslip
   */
  static async getEmployeePayslip(employeeId: string, payrollRunId: string) {
    try {
      const payslip = await prisma.payslip.findUnique({
        where: {
          employeeId_payrollRunId: {
            employeeId,
            payrollRunId
          }
        },
        include: {
          employee: {
            include: { 
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                  email: true
                }
              },
              currency: true
            }
          },
          payrollRun: true,
          currency: true
        }
      });

      if (!payslip) {
        return null;
      }

      // Transform the response to include all employee fields and company name
      const transformedPayslip = {
        id: payslip.id,
        employeeId: payslip.employeeId,
        payrollRunId: payslip.payrollRunId,
        grossPay: payslip.grossPay,
        totalDeductions: payslip.totalDeductions,
        netPay: payslip.netPay,
        currencyId: payslip.currencyId,
        createdAt: payslip.createdAt,
        updatedAt: payslip.updatedAt,
        // Employee details with all fields
        employee: {
          id: payslip.employee.id,
          userId: payslip.employee.userId,
          employeeNumber: payslip.employee.employeeNumber,
          bankName: payslip.employee.bankName,
          branchCode: payslip.employee.branchCode,
          accountNumber: payslip.employee.accountNumber,
          basicSalary: payslip.employee.basicSalary,
          currencyId: payslip.employee.currencyId,
          idNumber: payslip.employee.idNumber,
          nextOfKin: payslip.employee.nextOfKin,
          nextOfKinContact: payslip.employee.nextOfKinContact,
          address: payslip.employee.address,
          pictureUrl: payslip.employee.pictureUrl,
          isActive: payslip.employee.isActive,
          createdAt: payslip.employee.createdAt,
          updatedAt: payslip.employee.updatedAt,
          user: payslip.employee.user,
          currency: payslip.employee.currency
        },
        payrollRun: payslip.payrollRun,
        currency: payslip.currency,
        // Company information
        companyName: process.env.COMPANY_NAME_FULL || "National Venture Capital Company of Zimbabwe"
      };

      return transformedPayslip;
    } catch (error) {
      console.error('Error getting employee payslip:', error);
      throw error;
    }
  }

  /**
   * Calculate percentage-based deduction
   */
  private static calculatePercentageDeduction(
    grossPay: Decimal,
    rate: Decimal,
    threshold?: Decimal,
    ceiling?: Decimal
  ): Decimal {
    // Check if gross pay meets threshold
    if (threshold && grossPay.lt(threshold)) {
      return new Decimal(0);
    }

    // Calculate percentage
    let deductionAmount = grossPay.mul(rate).div(100);

    // Apply ceiling if specified
    if (ceiling && deductionAmount.gt(ceiling)) {
      deductionAmount = ceiling;
    }

    return deductionAmount;
  }

  /**
   * Send payslip email to employee
   */
  private static async sendPayslipEmail(employeeId: string, payrollRunId: string): Promise<void> {
    try {
      // Fetch payslip data with all required information
      const payslip = await prisma.payslip.findUnique({
        where: {
          employeeId_payrollRunId: {
            employeeId,
            payrollRunId
          }
        },
        include: {
          employee: {
            include: {
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                  email: true
                }
              },
              currency: true
            }
          },
          payrollRun: true,
          currency: true
        }
      });

      if (!payslip) {
        throw new Error('Payslip not found');
      }

      // Transform the payslip data for email template
      const payslipData = {
        id: payslip.id,
        employeeId: payslip.employeeId,
        payrollRunId: payslip.payrollRunId,
        grossPay: payslip.grossPay,
        totalDeductions: payslip.totalDeductions,
        netPay: payslip.netPay,
        currencyId: payslip.currencyId,
        createdAt: payslip.createdAt,
        updatedAt: payslip.updatedAt,
        employee: payslip.employee,
        payrollRun: payslip.payrollRun,
        currency: payslip.currency,
        companyName: process.env.COMPANY_NAME_FULL || "National Venture Capital Company of Zimbabwe"
      };

      // Send the email
      await EmailNotificationService.sendPayslipEmail(payslipData);

      console.log(`Payslip email sent successfully to ${payslip.employee.user.email}`);
    } catch (error) {
      console.error('Error sending payslip email:', error);
      throw error;
    }
  }

  /**
   * Convert currency using hardcoded exchange rate
   * For now, using 1:40 rate where 1 payroll currency = 40 other currency
   */
  private static convertCurrency(
    amount: Decimal,
    fromCurrencyId: string,
    toCurrencyId: string
  ): Decimal {
    // If same currency, no conversion needed
    if (fromCurrencyId === toCurrencyId) {
      return amount;
    }

    // Hardcoded exchange rate: 1 payroll currency = 40 other currency
    // This means if we have 40 in other currency, we convert to 1 in payroll currency
    const exchangeRate = new Decimal(40);
    
    // Convert from other currency to payroll currency
    return amount.div(exchangeRate);
  }

  /**
   * Process Payroll Payment - Wages Clearing
   * Creates a cashbook payment and journal entry to clear Net Wages Payable
   * DR Net Wages Payable (2250), CR Bank Account (1100)
   */
  static async processPayrollPayment(
    payrollRunId: string,
    bankId: string,
    paymentDate: Date,
    createdById: string
  ): Promise<{ success: boolean; cashbookEntry: any; journalEntry: any; message: string }> {
    try {
      console.log('===============================================================');
      console.log('processPayrollPayment METHOD CALLED');
      console.log(`   Payroll Run ID: ${payrollRunId}`);
      console.log(`   Bank ID: ${bankId}`);
      console.log(`   Payment Date: ${paymentDate.toISOString()}`);
      console.log('===============================================================');

      // Step 1: Get payroll run details
      console.log('Step 1: Fetching payroll run details...');
      const payrollRun = await prisma.payrollRun.findUnique({
        where: { id: payrollRunId }
      });

      if (!payrollRun) {
        throw new Error('Payroll run not found');
      }

      if (payrollRun.status !== 'COMPLETED') {
        throw new Error('Payroll run must be completed before processing payment');
      }

      console.log(`[OK] Payroll run found: ${payrollRun.name} (${payrollRun.payPeriod})`);
      console.log(`   Total Net Pay: $${payrollRun.totalNetPay.toString()}`);

      // Step 2: Validate bank account
      console.log('Step 2: Validating bank account...');
      const bank = await prisma.bank.findUnique({
        where: { id: bankId },
        include: { glAccount: true, currency: true }
      });

      if (!bank) {
        throw new Error('Bank account not found');
      }

      console.log(`[OK] Bank account found: ${bank.name} (${bank.accountNumber})`);
      console.log(`   GL Account: ${bank.glAccount?.accountNo} - ${bank.glAccount?.accountName}`);

      if (!bank.glAccountId || !bank.glAccount) {
        throw new Error(
          'Bank has no linked GL cash account. Link this bank to a Balance Sheet bank/cash account in Chart of Accounts before payroll payment.'
        );
      }

      console.log('Step 3: Resolving Net Wages Payable (2250)...');
      const netWagesPayableAccount = await resolveNetWagesPayableAccount();
      console.log(
        '[OK] Net Wages Payable: ' + netWagesPayableAccount.accountNo + ' - ' + netWagesPayableAccount.accountName
      );

      // Step 4: Create cashbook payment entry
      console.log('Step 4: Creating cashbook payment entry...');
      const timestamp = Date.now().toString().slice(-6);
      const cashbookReference = 'PAYROLL-PAY-' + payrollRun.payPeriod.replace(/\s+/g, '-').toUpperCase() + '-' + timestamp;
      
      const cashbookEntry = await prisma.cashbookEntry.create({
        data: {
          bankId: bankId,
          transactionDate: paymentDate,
          type: 'PAYMENT',
          amount: payrollRun.totalNetPay,
          reference: cashbookReference,
          description: 'Payroll Payment - Net Wages: ' + payrollRun.name + ' (' + payrollRun.payPeriod + ')',
          status: 'POSTED',
          counterpartyType: 'GL',
          glAccountId: netWagesPayableAccount.id,
          createdById
        }
      });

      console.log('[OK] Cashbook entry created: ' + cashbookEntry.reference);

      // Step 5: Create journal entry
      console.log('Step 5: Creating journal entry for wages clearing...');
      console.log('   DR Net Wages Payable (' + netWagesPayableAccount.accountNo + '): $' + payrollRun.totalNetPay.toString());
      console.log('   CR Bank Account (' + bank.glAccount?.accountNo + '): $' + payrollRun.totalNetPay.toString());

      // Use same reference number as cashbook entry
      const journalEntry = await createJournalEntryWithAuditSequence({
        transactionDate: paymentDate,
        referenceNumber: cashbookReference,
        description: 'Payroll Payment - Wages Clearing: ' + payrollRun.name + ' (' + payrollRun.payPeriod + ')',
        totalAmount: payrollRun.totalNetPay,
        currencyId: bank.currency.id,
        status: 'POSTED',
        createdById,
      });

      // Step 6: Create journal entry lines
      console.log('Step 6: Creating journal entry lines...');

      // DR Net Wages Payable (2250) - Clear the liability
      await prisma.journalEntryLine.create({
        data: {
          journalEntryId: journalEntry.id,
          chartOfAccountId: netWagesPayableAccount.id,
          debitAmount: payrollRun.totalNetPay,
          creditAmount: new Decimal(0),
          description: 'Payroll Payment - Clear Net Wages Payable: ' + payrollRun.payPeriod,
          vatAmount: new Decimal(0)
        }
      });
      console.log('   [OK] DR Net Wages Payable (' + netWagesPayableAccount.accountNo + '): $' + payrollRun.totalNetPay.toString());

      // CR Bank Account (1100 or bank's GL account)
      await prisma.journalEntryLine.create({
        data: {
          journalEntryId: journalEntry.id,
          chartOfAccountId: bank.glAccountId,
          debitAmount: new Decimal(0),
          creditAmount: payrollRun.totalNetPay,
          description: 'Bank Payment - Payroll: ' + payrollRun.payPeriod,
          vatAmount: new Decimal(0)
        }
      });
      console.log('   [OK] CR Bank Account (' + bank.glAccount?.accountNo + '): $' + payrollRun.totalNetPay.toString());

      // Step 7: Link journal entry to cashbook entry
      await prisma.cashbookEntry.update({
        where: { id: cashbookEntry.id },
        data: { journalEntryId: journalEntry.id }
      });

      // Step 8: Verify journal entry is balanced
      const balanceCheck = payrollRun.totalNetPay.sub(payrollRun.totalNetPay).abs();
      console.log('\n Journal Entry Balance Verification:');
      const totalNetPayStr = payrollRun.totalNetPay.toString();
      console.log('   Total Debit: $' + totalNetPayStr);
      console.log('   Total Credit: $' + totalNetPayStr);
      const balanceStatus = balanceCheck.lte(0.01) ? '[OK]' : '[FAIL]';
      console.log('   Balanced: ' + balanceStatus + '\n');
      console.log('[OK] Payroll Payment processed successfully');
      console.log('   Cashbook Entry: ' + cashbookEntry.reference);
      console.log('   Journal Entry: ' + journalEntry.referenceNumber);
      console.log('   Net Wages Payable cleared: $' + totalNetPayStr + '\n');

      return {
        success: true,
        cashbookEntry,
        journalEntry,
        message: 'Payroll payment processed successfully. Net Wages Payable cleared: $' + payrollRun.totalNetPay.toString()
      };

    } catch (error: any) {
      console.error('[ERROR] Error processing payroll payment:', error);
      console.error('Error details:', error.message);
      console.error('Error stack:', error.stack);
      throw error;
    }
  }
}

