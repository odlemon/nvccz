// @ts-nocheck
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { PayrollService } from '../services/PayrollService';

const prisma = new PrismaClient();

export class PayrollController {
  /**
   * Create a new employee from user
   */
  static async createEmployee(req: Request, res: Response) {
    try {
      const {
        userId,
        bankName,
        branchCode,
        accountNumber,
        basicSalary,
        currencyId
      } = req.body;

      // Check if user exists
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Check if employee already exists for this user
      const existingEmployee = await prisma.employee.findUnique({
        where: { userId }
      });

      if (existingEmployee) {
        return res.status(400).json({
          success: false,
          message: 'Employee already exists for this user'
        });
      }

      // Auto-generate employee number
      const lastEmployee = await prisma.employee.findFirst({
        orderBy: { employeeNumber: 'desc' }
      });

      let nextEmployeeNumber = 'EMP001';
      if (lastEmployee && lastEmployee.employeeNumber) {
        const lastNumber = parseInt(lastEmployee.employeeNumber.replace('EMP', ''));
        const nextNumber = lastNumber + 1;
        nextEmployeeNumber = `EMP${nextNumber.toString().padStart(3, '0')}`;
      }

      const employee = await prisma.employee.create({
        data: {
          userId,
          employeeNumber: nextEmployeeNumber,
          bankName,
          branchCode,
          accountNumber,
          basicSalary: parseFloat(basicSalary),
          currencyId
        },
        include: {
          user: {
            select: { firstName: true, lastName: true, email: true }
          },
          currency: true
        }
      });

      res.status(201).json({
        success: true,
        message: 'Employee created successfully',
        data: employee
      });
    } catch (error) {
      console.error('Error creating employee:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create employee',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get all employees
   */
  static async getEmployees(req: Request, res: Response) {
    try {
      const employees = await prisma.employee.findMany({
        where: { isActive: true },
        include: {
          user: {
            select: { firstName: true, lastName: true, email: true }
          },
          currency: true
        }
      });

      res.json({
        success: true,
        data: employees
      });
    } catch (error) {
      console.error('Error getting employees:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get employees',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Create a new payroll run
   */
  static async createPayrollRun(req: Request, res: Response) {
    try {
      const {
        name,
        payPeriod,
        startDate,
        endDate,
        currencyId
      } = req.body;

      const createdById = (req as any).user.id;

      const payrollRun = await prisma.payrollRun.create({
        data: {
          name,
          payPeriod,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          currencyId,
          createdById
        },
        include: {
          currency: true,
          createdBy: {
            select: { firstName: true, lastName: true, email: true }
          }
        }
      });

      res.status(201).json({
        success: true,
        message: 'Payroll run created successfully',
        data: payrollRun
      });
    } catch (error) {
      console.error('Error creating payroll run:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create payroll run',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Process payroll run
   */
  static async processPayrollRun(req: Request, res: Response) {
    try {
      const { payrollRunId } = req.params;
      const createdById = (req as any).user.id;

      await PayrollService.processPayrollRun(payrollRunId, createdById);

      const payrollRun = await PayrollService.getPayrollRunSummary(payrollRunId);

      res.json({
        success: true,
        message: 'Payroll run processed successfully',
        data: payrollRun
      });
    } catch (error) {
      console.error('Error processing payroll run:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to process payroll run',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get payroll run summary
   */
  static async getPayrollRunSummary(req: Request, res: Response) {
    try {
      const { payrollRunId } = req.params;

      const payrollRun = await PayrollService.getPayrollRunSummary(payrollRunId);

      res.json({
        success: true,
        data: payrollRun
      });
    } catch (error) {
      console.error('Error getting payroll run summary:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get payroll run summary',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Generate bank file
   */
  static async generateBankFile(req: Request, res: Response) {
    try {
      const { payrollRunId } = req.params;
      const { bankTemplateId } = req.body;

      if (!bankTemplateId) {
        return res.status(400).json({
          success: false,
          message: 'Bank template ID is required',
          error: 'Please provide bankTemplateId in the request body'
        });
      }

      const csvContent = await PayrollService.generateBankFile(payrollRunId, bankTemplateId);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="payroll_${payrollRunId}.csv"`);
      res.send(csvContent);
    } catch (error) {
      console.error('Error generating bank file:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate bank file',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get employee payslip
   */
  static async getEmployeePayslip(req: Request, res: Response) {
    try {
      const { employeeId, payrollRunId } = req.params;

      const payslip = await PayrollService.getEmployeePayslip(employeeId, payrollRunId);

      res.json({
        success: true,
        data: payslip
      });
    } catch (error) {
      console.error('Error getting employee payslip:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get employee payslip',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Create tax rule
   */
  static async createTaxRule(req: Request, res: Response) {
    try {
      const {
        name,
        type,
        rate,
        threshold,
        ceiling,
        effectiveDate,
        endDate,
        currencyId
      } = req.body;

      const createdById = (req as any).user.id;

      const taxRule = await prisma.taxRules.create({
        data: {
          name,
          type,
          rate: parseFloat(rate),
          threshold: threshold ? parseFloat(threshold) : null,
          ceiling: ceiling ? parseFloat(ceiling) : null,
          effectiveDate: new Date(effectiveDate),
          endDate: endDate ? new Date(endDate) : null,
          currencyId,
          createdById
        },
        include: {
          currency: true,
          createdBy: {
            select: { firstName: true, lastName: true, email: true }
          }
        }
      });

      res.status(201).json({
        success: true,
        message: 'Tax rule created successfully',
        data: taxRule
      });
    } catch (error) {
      console.error('Error creating tax rule:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create tax rule',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get tax rules
   */
  static async getTaxRules(req: Request, res: Response) {
    try {
      const { currencyId } = req.query;

      const whereClause: any = { isActive: true };
      if (currencyId) {
        whereClause.currencyId = currencyId;
      }

      const taxRules = await prisma.taxRules.findMany({
        where: whereClause,
        include: {
          currency: true,
          createdBy: {
            select: { firstName: true, lastName: true, email: true }
          }
        },
        orderBy: { effectiveDate: 'desc' }
      });

      res.json({
        success: true,
        data: taxRules
      });
    } catch (error) {
      console.error('Error getting tax rules:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get tax rules',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Create allowance type
   */
  static async createAllowanceType(req: Request, res: Response) {
    try {
      const {
        name,
        code,
        description,
        isTaxable
      } = req.body;

      const createdById = (req as any).user.id;

      const allowanceType = await prisma.allowanceTypes.create({
        data: {
          name,
          code,
          description,
          isTaxable: isTaxable === 'true' || isTaxable === true,
          createdById
        },
        include: {
          createdBy: {
            select: { firstName: true, lastName: true, email: true }
          }
        }
      });

      res.status(201).json({
        success: true,
        message: 'Allowance type created successfully',
        data: allowanceType
      });
    } catch (error) {
      console.error('Error creating allowance type:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create allowance type',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get allowance types
   */
  static async getAllowanceTypes(req: Request, res: Response) {
    try {
      const allowanceTypes = await prisma.allowanceTypes.findMany({
        where: { isActive: true },
        include: {
          createdBy: {
            select: { firstName: true, lastName: true, email: true }
          }
        }
      });

      res.json({
        success: true,
        data: allowanceTypes
      });
    } catch (error) {
      console.error('Error getting allowance types:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get allowance types',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Create deduction type
   */
  static async createDeductionType(req: Request, res: Response) {
    try {
      const {
        name,
        code,
        description,
        isStatutory
      } = req.body;

      const createdById = (req as any).user.id;

      const deductionType = await prisma.deductionTypes.create({
        data: {
          name,
          code,
          description,
          isStatutory: isStatutory === 'true' || isStatutory === true,
          createdById
        },
        include: {
          createdBy: {
            select: { firstName: true, lastName: true, email: true }
          }
        }
      });

      res.status(201).json({
        success: true,
        message: 'Deduction type created successfully',
        data: deductionType
      });
    } catch (error) {
      console.error('Error creating deduction type:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create deduction type',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get deduction types
   */
  static async getDeductionTypes(req: Request, res: Response) {
    try {
      const deductionTypes = await prisma.deductionTypes.findMany({
        where: { isActive: true },
        include: {
          createdBy: {
            select: { firstName: true, lastName: true, email: true }
          }
        }
      });

      res.json({
        success: true,
        data: deductionTypes
      });
    } catch (error) {
      console.error('Error getting deduction types:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get deduction types',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Create bank file template
   */
  static async createBankFileTemplate(req: Request, res: Response) {
    try {
      const {
        name,
        bankName,
        delimiter,
        hasHeader,
        columnOrder
      } = req.body;

      const createdById = (req as any).user.id;

      const bankTemplate = await prisma.bankFileTemplate.create({
        data: {
          name,
          bankName,
          delimiter: delimiter || ',',
          hasHeader: hasHeader === 'true' || hasHeader === true,
          columnOrder: JSON.stringify(columnOrder),
          createdById
        },
        include: {
          createdBy: {
            select: { firstName: true, lastName: true, email: true }
          }
        }
      });

      res.status(201).json({
        success: true,
        message: 'Bank file template created successfully',
        data: bankTemplate
      });
    } catch (error) {
      console.error('Error creating bank file template:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create bank file template',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get bank file templates
   */
  static async getBankFileTemplates(req: Request, res: Response) {
    try {
      const bankTemplates = await prisma.bankFileTemplate.findMany({
        where: { isActive: true },
        include: {
          createdBy: {
            select: { firstName: true, lastName: true, email: true }
          }
        }
      });

      res.json({
        success: true,
        data: bankTemplates
      });
    } catch (error) {
      console.error('Error getting bank file templates:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get bank file templates',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // ===== EMPLOYEE PORTAL ENDPOINTS =====

  /**
   * Get employee's own payroll information
   */
  static async getEmployeePayrollInfo(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;

      // Find employee record for this user
      const employee = await prisma.employee.findUnique({
        where: { userId },
        include: {
          user: {
            select: { firstName: true, lastName: true, email: true }
          },
          currency: true,
          salaryStructures: {
            where: { isActive: true },
            include: { allowanceType: true }
          },
          leaveBalances: true
        }
      });

      if (!employee) {
        return res.status(404).json({
          success: false,
          message: 'Employee record not found'
        });
      }

      res.json({
        success: true,
        data: employee
      });
    } catch (error) {
      console.error('Error getting employee payroll info:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get employee payroll info',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get employee's payslips
   */
  static async getEmployeePayslips(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
      const { page = 1, limit = 10 } = req.query;

      // Find employee record for this user
      const employee = await prisma.employee.findUnique({
        where: { userId }
      });

      if (!employee) {
        return res.status(404).json({
          success: false,
          message: 'Employee record not found'
        });
      }

      const skip = (Number(page) - 1) * Number(limit);

      const payslips = await prisma.payslip.findMany({
        where: { employeeId: employee.id },
        include: {
          payrollRun: {
            select: {
              id: true,
              name: true,
              payPeriod: true,
              startDate: true,
              endDate: true,
              status: true
            }
          },
          currency: true
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit)
      });

      const total = await prisma.payslip.count({
        where: { employeeId: employee.id }
      });

      res.json({
        success: true,
        data: payslips,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error) {
      console.error('Error getting employee payslips:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get employee payslips',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get employee's leave balances
   */
  static async getEmployeeLeaveBalances(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;

      // Find employee record for this user
      const employee = await prisma.employee.findUnique({
        where: { userId }
      });

      if (!employee) {
        return res.status(404).json({
          success: false,
          message: 'Employee record not found'
        });
      }

      const leaveBalances = await prisma.leaveBalance.findMany({
        where: { employeeId: employee.id },
        include: { currency: true },
        orderBy: { leaveType: 'asc' }
      });

      res.json({
        success: true,
        data: leaveBalances
      });
    } catch (error) {
      console.error('Error getting employee leave balances:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get employee leave balances',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // ===== SALARY STRUCTURE MANAGEMENT =====

  /**
   * Create salary structure for employee
   */
  static async createSalaryStructure(req: Request, res: Response) {
    try {
      const {
        employeeId,
        allowanceTypeId,
        amount,
        currencyId,
        effectiveDate,
        endDate
      } = req.body;

      const salaryStructure = await prisma.salaryStructure.create({
        data: {
          employeeId,
          allowanceTypeId,
          amount: parseFloat(amount),
          currencyId,
          effectiveDate: new Date(effectiveDate),
          endDate: endDate ? new Date(endDate) : null
        },
        include: {
          employee: {
            include: {
              user: {
                select: { firstName: true, lastName: true, email: true }
              }
            }
          },
          allowanceType: true,
          currency: true
        }
      });

      res.status(201).json({
        success: true,
        message: 'Salary structure created successfully',
        data: salaryStructure
      });
    } catch (error) {
      console.error('Error creating salary structure:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create salary structure',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get salary structures for employee
   */
  static async getEmployeeSalaryStructures(req: Request, res: Response) {
    try {
      const { employeeId } = req.params;
      const { active = 'true' } = req.query;

      const whereClause: any = { employeeId };
      if (active === 'true') {
        whereClause.isActive = true;
      }

      const salaryStructures = await prisma.salaryStructure.findMany({
        where: whereClause,
        include: {
          employee: {
            include: {
              user: {
                select: { firstName: true, lastName: true, email: true }
              }
            }
          },
          allowanceType: true,
          currency: true
        },
        orderBy: { effectiveDate: 'desc' }
      });

      res.json({
        success: true,
        data: salaryStructures
      });
    } catch (error) {
      console.error('Error getting salary structures:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get salary structures',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Update salary structure
   */
  static async updateSalaryStructure(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const {
        allowanceTypeId,
        amount,
        currencyId,
        isActive,
        effectiveDate,
        endDate
      } = req.body;

      const salaryStructure = await prisma.salaryStructure.update({
        where: { id },
        data: {
          allowanceTypeId,
          amount: amount ? parseFloat(amount) : undefined,
          currencyId,
          isActive: isActive !== undefined ? isActive : undefined,
          effectiveDate: effectiveDate ? new Date(effectiveDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined
        },
        include: {
          employee: {
            include: {
              user: {
                select: { firstName: true, lastName: true, email: true }
              }
            }
          },
          allowanceType: true,
          currency: true
        }
      });

      res.json({
        success: true,
        message: 'Salary structure updated successfully',
        data: salaryStructure
      });
    } catch (error) {
      console.error('Error updating salary structure:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update salary structure',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Delete salary structure
   */
  static async deleteSalaryStructure(req: Request, res: Response) {
    try {
      const { id } = req.params;

      await prisma.salaryStructure.delete({
        where: { id }
      });

      res.json({
        success: true,
        message: 'Salary structure deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting salary structure:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete salary structure',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // ===== LEAVE BALANCE MANAGEMENT =====

  /**
   * Create or update leave balance
   */
  static async updateLeaveBalance(req: Request, res: Response) {
    try {
      const {
        employeeId,
        leaveType,
        balance,
        currencyId
      } = req.body;

      const leaveBalance = await prisma.leaveBalance.upsert({
        where: {
          employeeId_leaveType: {
            employeeId,
            leaveType
          }
        },
        update: {
          balance: parseFloat(balance),
          currencyId
        },
        create: {
          employeeId,
          leaveType,
          balance: parseFloat(balance),
          currencyId
        },
        include: {
          employee: {
            include: {
              user: {
                select: { firstName: true, lastName: true, email: true }
              }
            }
          },
          currency: true
        }
      });

      res.json({
        success: true,
        message: 'Leave balance updated successfully',
        data: leaveBalance
      });
    } catch (error) {
      console.error('Error updating leave balance:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update leave balance',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get all leave balances
   */
  static async getAllLeaveBalances(req: Request, res: Response) {
    try {
      const { employeeId } = req.query;

      const whereClause: any = {};
      if (employeeId) {
        whereClause.employeeId = employeeId;
      }

      const leaveBalances = await prisma.leaveBalance.findMany({
        where: whereClause,
        include: {
          employee: {
            include: {
              user: {
                select: { firstName: true, lastName: true, email: true }
              }
            }
          },
          currency: true
        },
        orderBy: [
          { employee: { user: { firstName: 'asc' } } },
          { leaveType: 'asc' }
        ]
      });

      res.json({
        success: true,
        data: leaveBalances
      });
    } catch (error) {
      console.error('Error getting leave balances:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get leave balances',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // ===== ADMIN CONFIGURATION ENDPOINTS =====

  /**
   * Update tax rule
   */
  static async updateTaxRule(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const {
        name,
        type,
        rate,
        threshold,
        ceiling,
        isActive,
        effectiveDate,
        endDate,
        currencyId
      } = req.body;

      const taxRule = await prisma.taxRules.update({
        where: { id },
        data: {
          name,
          type,
          rate: rate ? parseFloat(rate) : undefined,
          threshold: threshold ? parseFloat(threshold) : undefined,
          ceiling: ceiling ? parseFloat(ceiling) : undefined,
          isActive: isActive !== undefined ? isActive : undefined,
          effectiveDate: effectiveDate ? new Date(effectiveDate) : undefined,
          endDate: endDate ? new Date(endDate) : undefined,
          currencyId
        },
        include: {
          currency: true,
          createdBy: {
            select: { firstName: true, lastName: true, email: true }
          }
        }
      });

      res.json({
        success: true,
        message: 'Tax rule updated successfully',
        data: taxRule
      });
    } catch (error) {
      console.error('Error updating tax rule:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update tax rule',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Delete tax rule
   */
  static async deleteTaxRule(req: Request, res: Response) {
    try {
      const { id } = req.params;

      await prisma.taxRules.delete({
        where: { id }
      });

      res.json({
        success: true,
        message: 'Tax rule deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting tax rule:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete tax rule',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Update allowance type
   */
  static async updateAllowanceType(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const {
        name,
        code,
        description,
        isTaxable,
        isActive
      } = req.body;

      const allowanceType = await prisma.allowanceTypes.update({
        where: { id },
        data: {
          name,
          code,
          description,
          isTaxable: isTaxable !== undefined ? isTaxable : undefined,
          isActive: isActive !== undefined ? isActive : undefined
        },
        include: {
          createdBy: {
            select: { firstName: true, lastName: true, email: true }
          }
        }
      });

      res.json({
        success: true,
        message: 'Allowance type updated successfully',
        data: allowanceType
      });
    } catch (error) {
      console.error('Error updating allowance type:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update allowance type',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Delete allowance type
   */
  static async deleteAllowanceType(req: Request, res: Response) {
    try {
      const { id } = req.params;

      await prisma.allowanceTypes.delete({
        where: { id }
      });

      res.json({
        success: true,
        message: 'Allowance type deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting allowance type:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete allowance type',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Update deduction type
   */
  static async updateDeductionType(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const {
        name,
        code,
        description,
        isStatutory,
        isActive
      } = req.body;

      const deductionType = await prisma.deductionTypes.update({
        where: { id },
        data: {
          name,
          code,
          description,
          isStatutory: isStatutory !== undefined ? isStatutory : undefined,
          isActive: isActive !== undefined ? isActive : undefined
        },
        include: {
          createdBy: {
            select: { firstName: true, lastName: true, email: true }
          }
        }
      });

      res.json({
        success: true,
        message: 'Deduction type updated successfully',
        data: deductionType
      });
    } catch (error) {
      console.error('Error updating deduction type:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update deduction type',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Delete deduction type
   */
  static async deleteDeductionType(req: Request, res: Response) {
    try {
      const { id } = req.params;

      await prisma.deductionTypes.delete({
        where: { id }
      });

      res.json({
        success: true,
        message: 'Deduction type deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting deduction type:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete deduction type',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Update bank file template
   */
  static async updateBankFileTemplate(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const {
        name,
        bankName,
        delimiter,
        hasHeader,
        columnOrder,
        isActive
      } = req.body;

      const bankTemplate = await prisma.bankFileTemplate.update({
        where: { id },
        data: {
          name,
          bankName,
          delimiter,
          hasHeader: hasHeader !== undefined ? hasHeader : undefined,
          columnOrder: columnOrder ? JSON.stringify(columnOrder) : undefined,
          isActive: isActive !== undefined ? isActive : undefined
        },
        include: {
          createdBy: {
            select: { firstName: true, lastName: true, email: true }
          }
        }
      });

      res.json({
        success: true,
        message: 'Bank file template updated successfully',
        data: bankTemplate
      });
    } catch (error) {
      console.error('Error updating bank file template:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update bank file template',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Delete bank file template
   */
  static async deleteBankFileTemplate(req: Request, res: Response) {
    try {
      const { id } = req.params;

      await prisma.bankFileTemplate.delete({
        where: { id }
      });

      res.json({
        success: true,
        message: 'Bank file template deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting bank file template:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete bank file template',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get all payroll runs
   */
  static async getAllPayrollRuns(req: Request, res: Response) {
    try {
      const { page = 1, limit = 10, status } = req.query;

      const whereClause: any = {};
      if (status) {
        whereClause.status = status;
      }

      const skip = (Number(page) - 1) * Number(limit);

      const payrollRuns = await prisma.payrollRun.findMany({
        where: whereClause,
        include: {
          currency: true,
          createdBy: {
            select: { firstName: true, lastName: true, email: true }
          },
          _count: {
            select: { employeePayrolls: true, payslips: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: Number(limit)
      });

      const total = await prisma.payrollRun.count({
        where: whereClause
      });

      res.json({
        success: true,
        data: payrollRuns,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error) {
      console.error('Error getting payroll runs:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get payroll runs',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Update employee
   */
  static async updateEmployee(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const {
        bankName,
        branchCode,
        accountNumber,
        basicSalary,
        currencyId,
        isActive
      } = req.body;

      const employee = await prisma.employee.update({
        where: { id },
        data: {
          bankName,
          branchCode,
          accountNumber,
          basicSalary: basicSalary ? parseFloat(basicSalary) : undefined,
          currencyId,
          isActive: isActive !== undefined ? isActive : undefined
        },
        include: {
          user: {
            select: { firstName: true, lastName: true, email: true }
          },
          currency: true
        }
      });

      res.json({
        success: true,
        message: 'Employee updated successfully',
        data: employee
      });
    } catch (error) {
      console.error('Error updating employee:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update employee',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Delete employee
   */
  static async deleteEmployee(req: Request, res: Response) {
    try {
      const { id } = req.params;

      await prisma.employee.delete({
        where: { id }
      });

      res.json({
        success: true,
        message: 'Employee deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting employee:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete employee',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
