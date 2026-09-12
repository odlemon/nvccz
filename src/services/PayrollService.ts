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
  resolveSdlPayableAccount,
} from './payrollLiabilityAccountHelpers';
import { classifyDeductionForPayrollJournal } from './payrollJournalDeductionClassification';
import { loadCapitalCallAccountingLetterhead } from "../utils/capitalCallAccountingLetterhead";
import { buildPayslipPdfBuffer, safePayslipPdfFileBaseName } from "../utils/payslipPdf";
import { PayrollRunApprovalService } from './payroll/PayrollRunApprovalService';
import { PayslipDocumentService } from './payroll/PayslipDocumentService';
import { EmployeeChangeRequestService } from './payroll/EmployeeChangeRequestService';
import {
  calculateEmployeePayrollWithLegs,
  persistPayrollLegs,
  resolveRunFxRate,
  usesDualCurrency,
} from './payroll/PayrollDualCurrencyService';
import { resolvePayrollUsdZigRate } from './payroll/PayrollFxService';

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
    /** When set, payroll deduction rows and GL classification use this catalog row (avoids taxRule.name vs DeductionTypes.name mismatches). */
    deductionTypeId?: string;
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
  private static payrollFxRate: Decimal | null = null;

  static setPayrollFxRate(rate: Decimal) {
    PayrollService.payrollFxRate = rate;
  }

  /**
   * Calculate payroll for a single employee
   */
  static async calculateEmployeePayroll(
    employeeId: string,
    payrollRunId: string,
    currencyId: string,
    options?: { bypassActiveRosterCheck?: boolean }
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
      if (
        !options?.bypassActiveRosterCheck &&
        (employee.terminated || !employee.isActive)
      ) {
        throw new Error('Employee has been terminated and is excluded from payroll');
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
              isStatutory: false,
              deductionTypeId: deductionType.id,
            });
            totalDeductions = totalDeductions.add(deductionAmount);
          }
        }
      }

      // 2. Statutory deductions (applied to ALL employees)
      // Avoid double-counting statutory deductions that are also represented as TaxRules (PAYE/NSSA/AIDS Levy).
      // In this codebase, PAYE/NSSA should come from TaxRules (so they can be period/rate-config driven),
      // while other statutory items (e.g. Pension) may come from DeductionTypes.
      const taxRuleTypeSet = new Set(
        (taxRules || [])
          .map((tr: any) => String(tr?.type || "").toUpperCase().trim())
          .filter(Boolean)
      );
      for (const deductionType of statutoryDeductionTypes) {
        const codeU = String(deductionType?.code || "").toUpperCase().trim();
        const nameU = String(deductionType?.name || "").toUpperCase().trim();
        const isTaxRuleBacked =
          (codeU && taxRuleTypeSet.has(codeU)) ||
          (nameU === "PAYE" && taxRuleTypeSet.has("PAYE")) ||
          (nameU.includes("NSSA") && taxRuleTypeSet.has("NSSA")) ||
          (nameU.includes("AIDS") && taxRuleTypeSet.has("AIDS_LEVY"));
        if (isTaxRuleBacked) {
          continue;
        }

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
              isStatutory: true,
              deductionTypeId: deductionType.id,
            });
            totalDeductions = totalDeductions.add(deductionAmount);
          }
        }
      }

      // 3. Tax rules (PAYE, NSSA, AIDS Levy) — AIDS = % of PAYE (Eq. 2)
      let computedPaye = new Decimal(0);
      for (const taxRule of taxRules) {
        const isTaxRuleEffective = taxRule.effectiveDate <= effectiveDate && 
          (taxRule.endDate === null || taxRule.endDate >= effectiveDate);

        if (isTaxRuleEffective && taxRule.type === 'PAYE') {
          computedPaye = this.calculatePAYE(grossPay, taxRule);
        }
      }

      for (const taxRule of taxRules) {
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
              deductionAmount = this.calculateAIDSLevy(computedPaye.gt(0) ? computedPaye : grossPay, taxRule);
              break;
            default:
              deductionAmount = this.calculateCustomTax(grossPay, taxRule);
          }

          if (deductionAmount.gt(0)) {
            const resolvedDt = await PayrollService.resolveDeductionTypeForTaxRule(taxRule, effectiveDate);
            deductions.push({
              type: resolvedDt?.name ?? taxRule.name,
              amount: deductionAmount,
              isStatutory: true,
              deductionTypeId: resolvedDt?.id,
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
   * Map a tax rule to a catalog DeductionTypes row so PayrollDeduction rows persist and GL can classify PAYE/NSSA.
   */
  private static async resolveDeductionTypeForTaxRule(
    taxRule: { type: string; name: string },
    effectiveDate: Date
  ): Promise<{ id: string; name: string; code: string } | null> {
    const typeU = String(taxRule.type || '').toUpperCase();
    const orMatch: Array<Record<string, unknown>> = [
      { code: taxRule.type },
      { code: typeU },
      { name: taxRule.name },
    ];
    if (typeU === 'PAYE') {
      orMatch.push({ code: 'PAYE' });
    }
    if (typeU === 'NSSA') {
      orMatch.push({ code: 'NSSA' });
    }
    if (typeU === 'AIDS_LEVY') {
      orMatch.push({ code: 'AIDS_LEVY' });
      orMatch.push({ name: { contains: 'AIDS' } });
    }
    return prisma.deductionTypes.findFirst({
      where: {
        isActive: true,
        AND: [
          { effectiveDate: { lte: effectiveDate } },
          { OR: [{ endDate: null }, { endDate: { gte: effectiveDate } }] },
          { OR: orMatch },
        ],
      },
      orderBy: { effectiveDate: 'desc' },
      select: { id: true, name: true, code: true },
    });
  }

  static async persistPayrollDeductionLinesFromCalculation(
    employeePayrollId: string,
    calculation: PayrollCalculationResult,
    currencyId: string | null
  ): Promise<{ created: number; skippedUnresolved: number }> {
    let created = 0;
    let skippedUnresolved = 0;
    for (const deduction of calculation.deductions) {
      let deductionTypeId = deduction.deductionTypeId;
      if (!deductionTypeId) {
        const byName = await prisma.deductionTypes.findFirst({
          where: { isActive: true, name: deduction.type },
        });
        deductionTypeId = byName?.id;
      }
      if (!deductionTypeId) {
        const label = String(deduction.type || '').toUpperCase();
        let codeGuess: string | undefined;
        if (label.includes('PAYE') || label.includes('PAY AS YOU') || label.includes('INCOME TAX')) {
          codeGuess = 'PAYE';
        } else if (label.includes('NSSA')) {
          codeGuess = 'NSSA';
        } else if (label.includes('AIDS')) {
          codeGuess = 'AIDS_LEVY';
        }
        if (codeGuess) {
          const byCode = await prisma.deductionTypes.findFirst({
            where: { isActive: true, code: codeGuess },
          });
          deductionTypeId = byCode?.id;
        }
      }
      if (deductionTypeId) {
        await prisma.payrollDeduction.create({
          data: {
            employeePayrollId,
            deductionTypeId,
            amount: deduction.amount,
            currencyId,
          },
        });
        created += 1;
      } else {
        skippedUnresolved += 1;
        console.warn(
          `[Payroll] No DeductionTypes match for calculated deduction "${deduction.type}" amount ${deduction.amount.toString()} — GL liability split may be incomplete`
        );
      }
    }
    return { created, skippedUnresolved };
  }

  /**
   * Re-persist `PayrollDeduction` rows from current rules/catalog (backfill / repair).
   * Uses roster rows already on the run; allows terminated employees who were on that run.
   */
  static async rebuildPayrollDeductionLinesForRun(payrollRunId: string): Promise<{
    employeePayrolls: number;
    deductionsCreated: number;
    skippedUnresolved: number;
  }> {
    const run = await prisma.payrollRun.findUnique({ where: { id: payrollRunId } });
    if (!run) {
      throw new Error('Payroll run not found');
    }
    const cid = run.currencyId || '';
    const eps = await prisma.employeePayroll.findMany({ where: { payrollRunId } });
    let deductionsCreated = 0;
    let skippedUnresolved = 0;
    for (const ep of eps) {
      const calculation = await PayrollService.calculateEmployeePayroll(
        ep.employeeId,
        payrollRunId,
        cid,
        { bypassActiveRosterCheck: true }
      );
      await prisma.payrollDeduction.deleteMany({ where: { employeePayrollId: ep.id } });
      const r = await PayrollService.persistPayrollDeductionLinesFromCalculation(
        ep.id,
        calculation,
        run.currencyId
      );
      deductionsCreated += r.created;
      skippedUnresolved += r.skippedUnresolved;
    }
    return {
      employeePayrolls: eps.length,
      deductionsCreated,
      skippedUnresolved,
    };
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
  private static calculateAIDSLevy(payeOrGross: Decimal, taxRule: any): Decimal {
    const rateFraction = taxRule?.rate
      ? new Decimal(taxRule.rate.toString()).div(100)
      : new Decimal(0.03);
    return payeOrGross.mul(rateFraction);
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

      PayrollRunApprovalService.assertCanProcess(payrollRun);

      const employeeIds = (
        await prisma.employee.findMany({
          where: { isActive: true, terminated: false, lifecycleStatus: 'ACTIVE' },
          select: { id: true },
        })
      ).map((e) => e.id);
      const hasPending = await EmployeeChangeRequestService.hasPendingForEmployees(employeeIds);
      if (hasPending) {
        throw new Error('Cannot process payroll: pending employee change requests exist');
      }

      const fxRate = await resolveRunFxRate(payrollRun);
      PayrollService.setPayrollFxRate(fxRate);
      if (!payrollRun.fxRateUsdZig) {
        await prisma.payrollRun.update({
          where: { id: payrollRunId },
          data: { fxRateUsdZig: fxRate },
        });
      }

      // Update status to processing
      await prisma.payrollRun.update({
        where: { id: payrollRunId },
        data: { status: 'PROCESSING', processError: null }
      });

      const employees = await prisma.employee.findMany({
        where: { isActive: true, terminated: false, lifecycleStatus: 'ACTIVE' },
        include: { user: true, salaryStructures: { include: { allowanceType: true } } }
      });

      let totalGrossPay = new Decimal(0);
      let totalDeductions = new Decimal(0);
      let totalNetPay = new Decimal(0);

      // Process each employee
      for (const employee of employees) {
        const effectiveDate = payrollRun.endDate;
        // One PAYE engine for everybody.
        //
        // This used to branch: split-salary employees went through the
        // bracket-driven ZimraStatutoryEngine, while single-currency employees
        // went through calculateEmployeePayroll, which applies flat TaxRules
        // with a `rate / 100` convention. The two disagreed badly for the same
        // salary — a single-currency employee on 1,515 gross was assessed 2.27
        // in total deductions (0.15%) because bracket-driven PAYE never ran for
        // them. calculateEmployeePayrollWithLegs handles a 100%-USD contract as
        // a single USD leg, so routing everyone through it gives one consistent,
        // progressive calculation.
        const calculation = await calculateEmployeePayrollWithLegs(
          employee,
          effectiveDate,
          fxRate
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

        const employeePayrollRow = await prisma.employeePayroll.findFirst({
          where: { payrollRunId, employeeId: employee.id },
        });
        if (!employeePayrollRow) {
          throw new Error(`Employee payroll row missing after upsert for employee ${employee.id}`);
        }

        await PayrollService.persistPayrollDeductionLinesFromCalculation(
          employeePayrollRow.id,
          calculation,
          payrollRun.currencyId
        );

        if (calculation.legs?.length) {
          await persistPayrollLegs(employeePayrollRow.id, calculation.legs);
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

        try {
          await PayslipDocumentService.generateAndStore(employee.id, payrollRunId);
        } catch (pdfError) {
          console.error(`Failed to store payslip PDF for ${employee.id}:`, pdfError);
          throw pdfError;
        }

        try {
          await this.sendPayslipEmail(employee.id, payrollRunId);
        } catch (emailError) {
          console.error(`Failed to send payslip email to ${employee.id}:`, emailError);
        }

        totalGrossPay = totalGrossPay.add(calculation.grossPay);
        totalDeductions = totalDeductions.add(calculation.totalDeductions);
        totalNetPay = totalNetPay.add(calculation.netPay);
      }

      // Update payroll run totals (not COMPLETED until JE succeeds)
      await prisma.payrollRun.update({
        where: { id: payrollRunId },
        data: {
          totalGrossPay,
          totalDeductions,
          totalNetPay
        }
      });

      try {
        const { PerformanceGoalService } = await import('./PerformanceGoalService');
        await PerformanceGoalService.syncPayrollToGoals(payrollRunId, totalGrossPay, createdById);
      } catch (syncError: any) {
        console.error('[FAIL] Failed to sync payroll to performance goals:', syncError.message);
      }

      let journalEntryId: string | null = null;
      try {
        journalEntryId = await PayrollService.createPayrollJournalEntry(
          payrollRunId,
          totalGrossPay,
          totalDeductions,
          totalNetPay,
          createdById,
          payrollRun.currencyId || '',
          { rethrowOnError: true }
        );
      } catch (journalError: any) {
        await prisma.payrollRun.update({
          where: { id: payrollRunId },
          data: {
            status: 'FAILED',
            processError: journalError.message || 'Journal entry failed',
          },
        });
        throw journalError;
      }

      await prisma.payrollRun.update({
        where: { id: payrollRunId },
        data: {
          status: 'COMPLETED',
          journalEntryId,
        },
      });

      try {
        const { BudgetPayrollSyncService } = await import('./BudgetPayrollSyncService');
        const budgetSync = await BudgetPayrollSyncService.syncPayrollRunToBudget(
          payrollRunId,
          createdById
        );
        if (budgetSync.synced) {
          console.log(
            `[OK] Accounting budget salary actual updated: ${budgetSync.actualAmount} (budget ${budgetSync.budgetId})`
          );
        } else {
          console.log(`[WARN] Budget payroll sync: ${budgetSync.message || 'skipped'}`);
        }
      } catch (budgetSyncError: any) {
        console.error('[FAIL] Failed to sync payroll to accounting budget:', budgetSyncError.message);
      }

    } catch (error) {
      const run = await prisma.payrollRun.findUnique({ where: { id: payrollRunId } });
      if (run?.status === 'PROCESSING') {
        await prisma.payrollRun.update({
          where: { id: payrollRunId },
          data: {
            status: 'FAILED',
            processError: error?.message || String(error),
          },
        });
      }
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
    currencyId: string,
    options?: { rethrowOnError?: boolean }
  ): Promise<string | null> {
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
              },
              legs: true,
            }
          }
        }
      });

      if (!payrollRun) {
        throw new Error('Payroll run not found');
      }
      console.log(`[OK] Payroll run found: ${payrollRun.name} (${payrollRun.payPeriod})`);
      
      // Calculate total PAYE and NSSA/Pension from persisted deductions (catalog code + name heuristics)
      console.log('Step 2: Calculating liability breakdown from deductions...');
      let totalPAYE = new Decimal(0);
      let totalNSSA = new Decimal(0);
      let totalPension = new Decimal(0);
      let totalSDL = new Decimal(0);

      // Legs are stored per currency. A ZiG leg's amounts are ZiG, and adding
      // them to USD amounts produced a PAYE credit of 60,890 against a gross of
      // 42,209 -- see FINDING-004. Everything is brought to the run's currency
      // before it is summed.
      const fxRateUsdZig = new Decimal(payrollRun.fxRateUsdZig?.toString() || '0');
      const toRunCurrency = (amount: any, currencyCode: string): Decimal => {
        const value = new Decimal(amount?.toString() || '0');
        if (!currencyCode || currencyCode === 'USD') return value;
        if (currencyCode === 'ZIG') {
          if (fxRateUsdZig.lte(0)) {
            throw new Error(
              `Payroll run ${payrollRun.payPeriod} has ZiG legs but no usable fxRateUsdZig ` +
                `(${payrollRun.fxRateUsdZig}); a single-currency journal cannot be posted from it.`
            );
          }
          return value.div(fxRateUsdZig);
        }
        throw new Error(
          `Unsupported payroll leg currency "${currencyCode}" on run ${payrollRun.payPeriod}.`
        );
      };

      for (const employeePayroll of payrollRun.employeePayrolls) {
        if (employeePayroll.legs?.length) {
          for (const leg of employeePayroll.legs) {
            const cc = String((leg as any).currencyCode || '');
            totalPAYE = totalPAYE
              .add(toRunCurrency(leg.payeAmount, cc))
              .add(toRunCurrency(leg.aidsLevyAmount, cc));
            totalNSSA = totalNSSA.add(toRunCurrency(leg.nssaAmount, cc));
            totalSDL = totalSDL.add(toRunCurrency(leg.sdlAmount, cc));
          }
          // The deduction rows mirror the legs for a split-currency employee, so
          // reading both counted every statutory amount twice: NSSA was credited
          // at exactly 2x the leg total. Legs are the authoritative record when
          // present; the deduction loop below is the path for employees without.
          continue;
        }
        for (const deduction of employeePayroll.deductions) {
          const dt = deduction.deductionType;
          const bucket = classifyDeductionForPayrollJournal({
            name: dt.name,
            code: dt.code,
          });
          const deductionTypeName = dt.name.toUpperCase();
          const deductionTypeCode = String(dt.code || '').toUpperCase();

          if (bucket === 'PAYE') {
            totalPAYE = totalPAYE.add(deduction.amount);
            console.log(`   Found PAYE deduction: ${deductionTypeName} = $${deduction.amount.toString()}`);
          } else if (bucket === 'NSSA_PENSION') {
            if (deductionTypeCode.includes('PENSION') || deductionTypeName.includes('PENSION')) {
              totalPension = totalPension.add(deduction.amount);
              console.log(`   Found Pension deduction: ${deductionTypeName} = $${deduction.amount.toString()}`);
            } else {
              totalNSSA = totalNSSA.add(deduction.amount);
              console.log(`   Found NSSA deduction: ${deductionTypeName} = $${deduction.amount.toString()}`);
            }
          } else if (bucket === 'SDL') {
            totalSDL = totalSDL.add(deduction.amount);
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
      const calculatedTotal = totalPAYE.add(totalNSSAPension).add(totalSDL).add(totalNetPay);
      const difference = totalGrossPay.sub(calculatedTotal).abs();
      console.log(`   Verification: Gross Pay ($${totalGrossPay.toString()}) = PAYE + NSSA/Pension + SDL + Net Pay ($${calculatedTotal.toString()})`);
      console.log(`   Difference: $${difference.toString()}`);
      
      // The credit side is derived from the liability components, not accepted
      // from the caller, so the entry balances by construction of real numbers
      // rather than by back-solving.
      //
      // This used to reassign totalNetPay to (gross - PAYE - NSSA - SDL)
      // whenever the breakdown disagreed, which made the balance check below
      // self-satisfying: it validated a total that had just been solved from
      // gross, so it could never fail. With deductions double-counted the
      // back-solved figure went negative, the Net Wages line was skipped for
      // being <= 0, and an unbalanced entry was posted while the check passed.
      const netWagesPayable = totalGrossPay
        .sub(totalPAYE)
        .sub(totalNSSAPension)
        .sub(totalSDL);

      if (netWagesPayable.lt(0)) {
        throw new Error(
          `Payroll liabilities exceed gross pay for ${payrollRun.payPeriod}: gross ` +
            `${totalGrossPay.toString()}, PAYE ${totalPAYE.toString()}, NSSA/Pension ` +
            `${totalNSSAPension.toString()}, SDL ${totalSDL.toString()} leaves ` +
            `${netWagesPayable.toString()} for net wages. No journal was posted.`
        );
      }

      // A gap against the net pay the run itself calculated is worth surfacing:
      // a cent or two is currency rounding, more than that means the liability
      // breakdown and the payslips disagree and the journal should not be
      // trusted to represent the run.
      const netPayGap = netWagesPayable.sub(totalNetPay).abs();
      if (netPayGap.gt(0.05)) {
        throw new Error(
          `Journal liability breakdown does not reconcile to the run's net pay for ` +
            `${payrollRun.payPeriod}: components imply ${netWagesPayable.toString()}, ` +
            `the run calculated ${totalNetPay.toString()} (difference ${netPayGap.toString()}). ` +
            `No journal was posted.`
        );
      }
      totalNetPay = netWagesPayable;

      // DR Payroll expense (5010 preferred, 5030 fallback) — never an arbitrary 5xxx expense
      const salariesExpenseAccount = await resolveSalariesAndWagesExpenseAccount();
      console.log(
        `[OK] Payroll salary expense GL: ${salariesExpenseAccount.accountNo} – ${salariesExpenseAccount.accountName}`
      );

      // PAYE (2150), NSSA/Pension (2160), Net Wages (2250) — exact codes only (no random 21xx/22xx fallback)
      console.log('Step 3: Resolving payroll liability accounts (2150, 2160, 2250)...');
      const payePayableAccount = await resolvePayePayableAccount();
      const nssaPensionPayableAccount = await resolveNssaPensionPayableAccount();
      const sdlPayableAccount = await resolveSdlPayableAccount();
      const netWagesPayableAccount = await resolveNetWagesPayableAccount();
      console.log(`   [OK] PAYE: ${payePayableAccount.accountNo} — NSSA/Pension: ${nssaPensionPayableAccount.accountNo} — SDL: ${sdlPayableAccount.accountNo} — Net wages: ${netWagesPayableAccount.accountNo}`);

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

      // Use payroll run endDate as the accounting date so KPI analytics and financial statements land in the correct period.
      // BUT clamp it to "now" if endDate is in the future, otherwise the JE is parked in the future and the
      // GL viewer's default date filter hides it. Past periods → real period date. Future-dated test runs → today.
      const now = new Date();
      const accountingDate = payrollRun.endDate.getTime() > now.getTime()
        ? now
        : payrollRun.endDate;
      // Generate unique reference number by including timestamp to avoid duplicate reference number errors
      const timestamp = Date.now();
      const uniqueReferenceNumber = `PAYROLL-${payrollRun.payPeriod.replace(/\s+/g, '-').toUpperCase()}-${timestamp}`;
      
      // Build every line first, prove the entry balances, and only then write
      // anything. The previous order created the lines, then checked a total
      // that had been back-solved from gross -- so an unbalanced entry was
      // already in the ledger by the time the check ran, and the check could
      // not fail anyway. Nothing is persisted now unless the debits and the
      // credits agree.
      console.log('Step 4: Building journal entry lines...');

      const plannedLines: Array<{
        chartOfAccountId: string;
        debitAmount: Decimal;
        creditAmount: Decimal;
        description: string;
      }> = [
        {
          chartOfAccountId: salariesExpenseAccount.id,
          debitAmount: totalGrossPay,
          creditAmount: new Decimal(0),
          description: `Gross Pay Expense: ${payrollRun.payPeriod}`,
        },
      ];

      const creditLine = (accountId: string, amount: Decimal, description: string) => {
        if (amount.lte(0)) return;
        plannedLines.push({
          chartOfAccountId: accountId,
          debitAmount: new Decimal(0),
          creditAmount: amount,
          description,
        });
      };

      creditLine(payePayableAccount.id, totalPAYE, `PAYE Payable: ${payrollRun.payPeriod}`);
      creditLine(
        nssaPensionPayableAccount.id,
        totalNSSAPension,
        `NSSA/Pension Payable: ${payrollRun.payPeriod}`
      );
      creditLine(sdlPayableAccount.id, totalSDL, `SDL Payable: ${payrollRun.payPeriod}`);
      creditLine(
        netWagesPayableAccount.id,
        totalNetPay,
        `Net Wages Payable: ${payrollRun.payPeriod}`
      );

      // Checked against the lines themselves, not against the variables they
      // were built from.
      const plannedDebit = plannedLines.reduce((sum, l) => sum.add(l.debitAmount), new Decimal(0));
      const plannedCredit = plannedLines.reduce((sum, l) => sum.add(l.creditAmount), new Decimal(0));
      const plannedDifference = plannedDebit.sub(plannedCredit).abs();

      console.log('   Journal Entry Balance Verification (pre-write):');
      console.log(`     Lines:  ${plannedLines.length}`);
      console.log(`     Debit:  ${plannedDebit.toString()}`);
      console.log(`     Credit: ${plannedCredit.toString()}`);
      console.log(`     Difference: ${plannedDifference.toString()}`);

      if (plannedDifference.gt(0.01)) {
        throw new Error(
          `Payroll journal for ${payrollRun.payPeriod} does not balance: debit ` +
            `${plannedDebit.toString()} against credit ${plannedCredit.toString()} ` +
            `(difference ${plannedDifference.toString()}). No journal was posted.`
        );
      }

      const journalEntry = await createJournalEntryWithAuditSequence({
        transactionDate: accountingDate,
        referenceNumber: uniqueReferenceNumber,
        description: `Payroll Journal - Gross Pay: ${payrollRun.name} (${payrollRun.payPeriod})`,
        totalAmount: totalGrossPay,
        currencyId: finalCurrencyId,
        status: 'POSTED',
        createdById,
      });

      await prisma.journalEntryLine.createMany({
        data: plannedLines.map((l) => ({
          journalEntryId: journalEntry.id,
          chartOfAccountId: l.chartOfAccountId,
          debitAmount: l.debitAmount,
          creditAmount: l.creditAmount,
          description: l.description,
          vatAmount: new Decimal(0),
        })),
      });
      console.log(`   [OK] ${plannedLines.length} balanced line(s) written`);

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
      return journalEntry.id;
    } catch (error: any) {
      console.error('[FAIL] Error creating payroll journal entry:', error);
      console.error('Error details:', error.message);
      console.error('Error stack:', error.stack);
      if (options?.rethrowOnError) {
        throw error;
      }
      console.error('⚠️  Payroll processed but journal entry creation failed. Manual correction may be required.');
      return null;
    }
  }

  /** Description header used for gross-pay accrual journals (must match backfill delete lookup). */
  static payrollGrossAccrualJournalDescription(payrollRun: { name: string; payPeriod: string }): string {
    return `Payroll Journal - Gross Pay: ${payrollRun.name} (${payrollRun.payPeriod})`;
  }

  /**
   * Delete posted gross-pay accrual journal(s) for a payroll run (by description / PAYROLL- reference).
   * Does not touch payment/cashbook journals.
   */
  static async deletePayrollGrossAccrualJournalEntries(payrollRunId: string): Promise<{ deletedIds: string[] }> {
    const run = await prisma.payrollRun.findUnique({
      where: { id: payrollRunId },
      select: { id: true, name: true, payPeriod: true },
    });
    if (!run) {
      throw new Error('Payroll run not found');
    }
    const exactDesc = PayrollService.payrollGrossAccrualJournalDescription(run);
    const candidates = await prisma.journalEntry.findMany({
      where: {
        OR: [
          { description: exactDesc },
          {
            AND: [
              { description: { startsWith: 'Payroll Journal - Gross Pay:' } },
              { description: { contains: run.payPeriod } },
              { description: { contains: run.name } },
            ],
          },
        ],
      },
      select: { id: true, referenceNumber: true, description: true },
    });
    const safe = candidates.filter(
      (je) =>
        je.referenceNumber.startsWith('PAYROLL-') ||
        je.description.startsWith('Payroll Journal - Gross Pay:')
    );
    const byId = new Map(safe.map((j) => [j.id, j]));
    const deletedIds: string[] = [];
    for (const je of byId.values()) {
      await prisma.journalEntry.delete({ where: { id: je.id } });
      deletedIds.push(je.id);
    }
    return { deletedIds };
  }

  /**
   * Backfill repair: rebuild deduction lines, replace accrual GL, re-sync payroll goals (same as post-processPayrollRun).
   */
  static async repairCompletedPayrollRunAccounting(
    payrollRunId: string,
    options?: { rethrowJournalErrors?: boolean }
  ): Promise<{
    deductions: { employeePayrolls: number; deductionsCreated: number; skippedUnresolved: number };
    deletedJournalEntryIds: string[];
  }> {
    const run = await prisma.payrollRun.findUnique({ where: { id: payrollRunId } });
    if (!run) {
      throw new Error('Payroll run not found');
    }
    if (run.status !== 'COMPLETED') {
      throw new Error(`Payroll run must be COMPLETED (got ${run.status})`);
    }
    const deductions = await PayrollService.rebuildPayrollDeductionLinesForRun(payrollRunId);
    const { deletedIds } = await PayrollService.deletePayrollGrossAccrualJournalEntries(payrollRunId);
    await PayrollService.createPayrollJournalEntry(
      payrollRunId,
      new Decimal(run.totalGrossPay.toString()),
      new Decimal(run.totalDeductions.toString()),
      new Decimal(run.totalNetPay.toString()),
      run.createdById,
      run.currencyId || '',
      { rethrowOnError: options?.rethrowJournalErrors !== false }
    );
    const { PerformanceGoalService } = await import('./PerformanceGoalService');
    await PerformanceGoalService.syncPayrollToGoals(
      payrollRunId,
      new Decimal(run.totalGrossPay.toString()),
      run.createdById
    );
    try {
      const { BudgetPayrollSyncService } = await import('./BudgetPayrollSyncService');
      await BudgetPayrollSyncService.syncPayrollRunToBudget(payrollRunId, run.createdById);
    } catch (budgetSyncError: any) {
      console.error('[FAIL] Budget payroll sync on repair:', budgetSyncError.message);
    }
    return { deductions, deletedJournalEntryIds: deletedIds };
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

      const employeePayroll = await prisma.employeePayroll.findFirst({
        where: { payrollRunId, employeeId },
        include: {
          allowances: { include: { allowanceType: true } },
          deductions: { include: { deductionType: true } },
        },
      });

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
        companyName: process.env.COMPANY_NAME_FULL || "National Venture Capital Company of Zimbabwe",
      };

      // Build a PDF attachment (letterhead + clean layout), same identity source as capital calls
      const letterhead = await loadCapitalCallAccountingLetterhead().catch(() => null);
      const employeeName = `${payslip.employee.user.firstName} ${payslip.employee.user.lastName}`;
      const ccy = String(payslip.currency?.code || payslip.currency?.symbol || "USD").toUpperCase();
      const paymentDateLabel = new Date(payslip.payrollRun.endDate).toISOString().slice(0, 10);
      const allowances =
        employeePayroll?.allowances?.map((a: any) => ({
          name: a.allowanceType?.name || "Allowance",
          amount: Number(a.amount || 0),
        })) || [];
      const deductions =
        employeePayroll?.deductions?.map((d: any) => ({
          name: d.deductionType?.name || "Deduction",
          amount: Number(d.amount || 0),
        })) || [];
      const pdfBuffer = await buildPayslipPdfBuffer({
        payslipNumber: payslip.id,
        payPeriod: String(payslip.payrollRun.payPeriod || ""),
        paymentDateLabel,
        currencyCode: ccy,
        employeeName,
        employeeNumber: payslip.employee.employeeNumber || null,
        employeeEmail: payslip.employee.user.email || null,
        bankName: payslip.employee.bankName || null,
        bankAccountNumber: payslip.employee.accountNumber || null,
        bankBranchCode: payslip.employee.branchCode || null,
        grossPay: Number(payslip.grossPay || 0),
        totalDeductions: Number(payslip.totalDeductions || 0),
        netPay: Number(payslip.netPay || 0),
        basicSalary: payslip.employee.basicSalary ? Number(payslip.employee.basicSalary) : null,
        allowances,
        deductions,
        letterhead,
      });
      const pdfFilename = `Payslip-${safePayslipPdfFileBaseName(employeeName)}-${safePayslipPdfFileBaseName(
        String(payslip.payrollRun.payPeriod || paymentDateLabel)
      )}.pdf`;

      // Send the email
      await EmailNotificationService.sendPayslipEmail({
        ...payslipData,
        pdfAttachment: { filename: pdfFilename, content: pdfBuffer },
      });

      console.log(`Payslip email sent successfully to ${payslip.employee.user.email}`);
    } catch (error) {
      console.error('Error sending payslip email:', error);
      throw error;
    }
  }

  /**
   * Convert currency using payroll run FX snapshot (ZIG per USD).
   */
  private static convertCurrency(
    amount: Decimal,
    fromCurrencyId: string,
    toCurrencyId: string
  ): Decimal {
    if (fromCurrencyId === toCurrencyId) {
      return amount;
    }
    const exchangeRate = PayrollService.payrollFxRate || new Decimal(40);
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

