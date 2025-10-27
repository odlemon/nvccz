// @ts-nocheck
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { EmailNotificationService } from './EmailNotificationService';

import { dbConnection } from '../utils/database';
const prisma = dbConnection.getPrismaClient();

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
        throw new Error('Payslip not found');
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
        companyName: "National Venture Capital Company of Zimbabwe"
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
        companyName: "National Venture Capital Company of Zimbabwe"
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
}

