// @ts-nocheck
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

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
      // Get employee with salary structure
      const employee = await prisma.employee.findUnique({
        where: { id: employeeId },
        include: {
          salaryStructures: {
            where: { isActive: true },
            include: { allowanceType: true }
          },
          currency: true
        }
      });

      if (!employee) {
        throw new Error('Employee not found');
      }

      // Get active tax rules for the currency
      const taxRules = await prisma.taxRules.findMany({
        where: {
          currencyId,
          isActive: true,
          effectiveDate: { lte: new Date() },
          OR: [
            { endDate: null },
            { endDate: { gte: new Date() } }
          ]
        },
        orderBy: { effectiveDate: 'desc' }
      });

      // Get active deduction types
      const deductionTypes = await prisma.deductionTypes.findMany({
        where: { isActive: true }
      });

      // Calculate basic salary
      const basicSalary = employee.basicSalary;

      // Calculate allowances
      const allowances = [];
      let totalAllowances = new Decimal(0);

      for (const salaryStructure of employee.salaryStructures) {
        const allowance = {
          type: salaryStructure.allowanceType.name,
          amount: salaryStructure.amount,
          isTaxable: salaryStructure.allowanceType.isTaxable
        };
        allowances.push(allowance);
        totalAllowances = totalAllowances.add(salaryStructure.amount);
      }

      // Calculate gross pay
      const grossPay = basicSalary.add(totalAllowances);

      // Calculate deductions
      const deductions = [];
      let totalDeductions = new Decimal(0);

      // Calculate statutory deductions (PAYE, NSSA, AIDS Levy)
      for (const taxRule of taxRules) {
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
            include: { user: true }
          },
          payrollRun: true,
          currency: true
        }
      });

      if (!payslip) {
        throw new Error('Payslip not found');
      }

      return payslip;
    } catch (error) {
      console.error('Error getting employee payslip:', error);
      throw error;
    }
  }
}

