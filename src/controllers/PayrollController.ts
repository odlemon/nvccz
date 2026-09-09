// @ts-nocheck
import { Request, Response } from 'express';
import { PayrollAuditService } from "../services/payroll/PayrollAuditService";
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { PayrollService } from '../services/PayrollService';
import { StaffReimbursementVendorService } from '../services/StaffReimbursementVendorService';

import { companyNameFullFromEnv } from '../config/companyDisplay';
import { prisma } from '../utils/database';
import { PerformancePayrollBscHookService } from '../services/PerformancePayrollBscHookService';
import { EmployeeTerminationService } from '../services/EmployeeTerminationService';
import { parseDate } from '../utils/dateHelper';
import {
  formatEmployeeForApi,
  payrollFormField,
  resolveEmployeePictureUrl,
  isEmployeePictureUrlFieldPresent,
  resolveEmployeePictureUrlFromFormField
} from '../services/payrollEmployeePictureUpload';

export class PayrollController {
  /**
   * Create a new employee from user
   */
  static async createEmployee(req: Request, res: Response) {
    try {
      const userId = payrollFormField(req, 'userId');
      const basicSalaryRaw = payrollFormField(req, 'basicSalary');
      const bankName = payrollFormField(req, 'bankName');
      const branchCode = payrollFormField(req, 'branchCode');
      const accountNumber = payrollFormField(req, 'accountNumber');
      const currencyId = payrollFormField(req, 'currencyId');
      const idNumber = payrollFormField(req, 'idNumber');
      const nextOfKin = payrollFormField(req, 'nextOfKin');
      const nextOfKinContact = payrollFormField(req, 'nextOfKinContact');
      const address = payrollFormField(req, 'address');
      const bscNewHireCounterGoalId = payrollFormField(req, 'bscNewHireCounterGoalId');

      if (!userId) {
        return res.status(400).json({ success: false, message: 'userId is required' });
      }
      if (basicSalaryRaw === undefined) {
        return res.status(400).json({ success: false, message: 'basicSalary is required' });
      }
      const basicSalaryNum = parseFloat(basicSalaryRaw);
      if (!Number.isFinite(basicSalaryNum)) {
        return res.status(400).json({ success: false, message: 'basicSalary must be a number' });
      }

      let pictureUrl: string | null = null;
      try {
        pictureUrl = await resolveEmployeePictureUrl(req);
      } catch (uploadErr) {
        return res.status(400).json({
          success: false,
          message: uploadErr instanceof Error ? uploadErr.message : 'Picture upload failed'
        });
      }

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

      const actorId = (req as any).user?.id;
      if (!actorId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
      }

      const employee = await prisma.employee.create({
        data: {
          userId,
          employeeNumber: nextEmployeeNumber,
          bankName,
          branchCode,
          accountNumber,
          basicSalary: basicSalaryNum,
          currencyId,
          idNumber,
          nextOfKin,
          nextOfKinContact,
          address,
          pictureUrl
        },
        include: {
          user: {
            select: { firstName: true, lastName: true, email: true }
          },
          currency: true
        }
      });

      PerformancePayrollBscHookService.onEmployeeCreated({
        bscNewHireCounterGoalId:
          bscNewHireCounterGoalId != null ? String(bscNewHireCounterGoalId).trim() : undefined,
        createdByUserId: actorId ? String(actorId) : null
      }).catch((err) => console.warn("[payroll-bsc-hook] new hire KPI skipped:", err?.message || err));

      res.status(201).json({
        success: true,
        message: 'Employee created successfully',
        data: formatEmployeeForApi(employee)
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
        where: { isActive: true, terminated: false },
        include: {
          user: {
            select: { firstName: true, lastName: true, email: true }
          },
          currency: true,
          reimbursementVendor: {
            select: { id: true, name: true, isActive: true, email: true }
          }
        }
      });

      res.json({
        success: true,
        data: employees.map(formatEmployeeForApi)
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
   * Staff reimbursement: linked shell vendor for creditors sub-ledger (cashbook SUPPLIER payment).
   */
  static async getEmployeeReimbursementVendor(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const data = await StaffReimbursementVendorService.getReimbursementVendor(id);
      res.json({ success: true, data });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      if (msg === 'Employee not found') {
        return res.status(404).json({ success: false, message: msg });
      }
      console.error('Error getting reimbursement vendor:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get reimbursement vendor',
        error: msg
      });
    }
  }

  static async ensureEmployeeReimbursementVendor(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const data = await StaffReimbursementVendorService.ensureReimbursementVendor(id);
      res.json({ success: true, data });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      if (msg === 'Employee not found') {
        return res.status(404).json({ success: false, message: msg });
      }
      console.error('Error ensuring reimbursement vendor:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to ensure reimbursement vendor',
        error: msg
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
        currencyId,
        dualCurrency,
      } = req.body;

      const createdById = (req as any).user.id;

      // Convert dates for comparison
      const startDateObj = new Date(startDate);
      const endDateObj = new Date(endDate);

      // Check for overlapping payroll runs in the same period
      const existingPayrollRun = await prisma.payrollRun.findFirst({
        where: {
          OR: [
            // Check if new period overlaps with existing period
            {
              AND: [
                { startDate: { lte: endDateObj } },
                { endDate: { gte: startDateObj } }
              ]
            },
            // Check if existing period is within new period
            {
              AND: [
                { startDate: { gte: startDateObj } },
                { endDate: { lte: endDateObj } }
              ]
            },
            // Check if new period is within existing period
            {
              AND: [
                { startDate: { lte: startDateObj } },
                { endDate: { gte: endDateObj } }
              ]
            }
          ],
          // Exclude cancelled payroll runs
          status: {
            not: 'CANCELLED'
          }
        }
      });

      if (existingPayrollRun) {
        return res.status(400).json({
          success: false,
          message: 'A payroll run already exists for this period',
          error: `Payroll run "${existingPayrollRun.name}" (${existingPayrollRun.payPeriod}) already covers the period ${startDate} to ${endDate}`,
          existingPayrollRun: {
            id: existingPayrollRun.id,
            name: existingPayrollRun.name,
            payPeriod: existingPayrollRun.payPeriod,
            startDate: existingPayrollRun.startDate,
            endDate: existingPayrollRun.endDate,
            status: existingPayrollRun.status
          }
        });
      }

      const { resolvePayrollUsdZigRate } = await import('../services/payroll/PayrollFxService');
      const fxRateUsdZig = await resolvePayrollUsdZigRate();

      const payrollRun = await prisma.payrollRun.create({
        data: {
          name,
          payPeriod,
          startDate: startDateObj,
          endDate: endDateObj,
          currencyId,
          createdById,
          dualCurrency: Boolean(dualCurrency),
          fxRateUsdZig,
        },
        include: {
          currency: true,
          createdBy: {
            select: { firstName: true, lastName: true, email: true }
          }
        }
      });

      await PayrollAuditService.record({
        action: 'PAYROLL_RUN_CREATED',
        eventClass: 'Change',
        entityType: 'payroll_run',
        entityId: (payrollRun as any)?.id ?? null,
        entityLabel: (payrollRun as any)?.name ?? null,
        detail: `Created payroll run for ${(payrollRun as any)?.payPeriod ?? 'an unnamed period'}`,
        actor: (req as any).user,
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

      await PayrollAuditService.record({
        action: 'PAYROLL_RUN_PROCESSED',
        eventClass: 'Change',
        entityType: 'payroll_run',
        entityId: payrollRunId,
        entityLabel: (payrollRun as any)?.name ?? null,
        detail: `Calculated payroll and generated payslips: gross ${(payrollRun as any)?.totalGrossPay ?? '0'}, net ${(payrollRun as any)?.totalNetPay ?? '0'}`,
        actor: (req as any).user,
      });
      res.json({
        success: true,
        message: 'Payroll run processed successfully',
        data: payrollRun
      });
    } catch (error) {
      console.error('Error processing payroll run:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      const isClientError =
        /must be approved|not found|Cannot process|pending employee change|Only DRAFT/i.test(message);
      res.status(isClientError ? 400 : 500).json({
        success: false,
        message: isClientError ? message : 'Failed to process payroll run',
        error: message
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

      if (!payslip) {
        return res.json({
          success: true,
          message: 'No payslip found for this employee and payroll run',
          data: null
        });
      }

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
        rate,
        threshold,
        ceiling,
        isStatutory,
        effectiveDate,
        endDate,
        currencyId
      } = req.body;

      const createdById = (req as any).user.id;

      // Validate that statutory deductions don't require employee assignment
      if (isStatutory === true || isStatutory === 'true') {
        // Statutory deductions apply to ALL employees automatically
        // No employee assignment needed
      }

      const deductionType = await prisma.deductionTypes.create({
        data: {
          name,
          code,
          description,
          rate: new Decimal(rate || 0),
          threshold: threshold ? new Decimal(threshold) : null,
          ceiling: ceiling ? new Decimal(ceiling) : null,
          isStatutory: isStatutory === 'true' || isStatutory === true,
          effectiveDate: new Date(effectiveDate),
          endDate: endDate ? new Date(endDate) : null,
          currencyId,
          createdById
        },
        include: {
          createdBy: {
            select: { firstName: true, lastName: true, email: true }
          },
          currency: {
            select: { code: true, name: true, symbol: true }
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
          },
          currency: {
            select: { code: true, name: true, symbol: true }
          },
          employeeDeductions: {
            where: { isActive: true },
            select: {
              id: true,
              employeeId: true,
              amount: true,
              rate: true,
              isActive: true,
              effectiveDate: true,
              endDate: true,
              employee: {
                select: {
                  id: true,
                  employeeNumber: true,
                  isActive: true,
                  terminated: true,
                  user: {
                    select: {
                      firstName: true,
                      lastName: true,
                      email: true
                    }
                  }
                }
              }
            }
          }
        }
      });

      // Clean up the response to only show meaningful employee deduction data
      const cleanedDeductionTypes = deductionTypes.map(deductionType => ({
        ...deductionType,
        employeeDeductions: deductionType.employeeDeductions.map(empDed => {
          const cleanedEmpDed: any = {
            id: empDed.id,
            employeeId: empDed.employeeId,
            isActive: empDed.isActive,
            effectiveDate: empDed.effectiveDate,
            endDate: empDed.endDate,
            employee: empDed.employee
          };
          
          // Only include amount/rate if they have values (custom overrides)
          if (empDed.amount) cleanedEmpDed.amount = empDed.amount;
          if (empDed.rate) cleanedEmpDed.rate = empDed.rate;
          
          return cleanedEmpDed;
        })
      }));

      res.json({
        success: true,
        data: cleanedDeductionTypes
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
   * Get single deduction type with employees
   */
  static async getDeductionType(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const deductionType = await prisma.deductionTypes.findUnique({
        where: { id },
        include: {
          createdBy: {
            select: { firstName: true, lastName: true, email: true }
          },
          currency: {
            select: { code: true, name: true, symbol: true }
          },
          employeeDeductions: {
            where: { isActive: true },
            select: {
              id: true,
              employeeId: true,
              amount: true,
              rate: true,
              isActive: true,
              effectiveDate: true,
              endDate: true,
              employee: {
                select: {
                  id: true,
                  employeeNumber: true,
                  isActive: true,
                  terminated: true,
                  user: {
                    select: {
                      firstName: true,
                      lastName: true,
                      email: true
                    }
                  }
                }
              }
            }
          }
        }
      });

      if (!deductionType) {
        return res.status(404).json({
          success: false,
          message: 'Deduction type not found'
        });
      }

      // Clean up the response to only show meaningful employee deduction data
      const cleanedDeductionType = {
        ...deductionType,
        employeeDeductions: deductionType.employeeDeductions.map(empDed => {
          const cleanedEmpDed: any = {
            id: empDed.id,
            employeeId: empDed.employeeId,
            isActive: empDed.isActive,
            effectiveDate: empDed.effectiveDate,
            endDate: empDed.endDate,
            employee: empDed.employee
          };
          
          // Only include amount/rate if they have values (custom overrides)
          if (empDed.amount) cleanedEmpDed.amount = empDed.amount;
          if (empDed.rate) cleanedEmpDed.rate = empDed.rate;
          
          return cleanedEmpDed;
        })
      };

      res.json({
        success: true,
        data: cleanedDeductionType
      });
    } catch (error) {
      console.error('Error getting deduction type:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get deduction type',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Assign employees to deduction type (Non-Statutory Only)
   */
  static async assignEmployeesToDeduction(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { employeeIds, amount, rate } = req.body;

      // Check if deduction type exists and is not statutory
      const deductionType = await prisma.deductionTypes.findUnique({
        where: { id }
      });

      if (!deductionType) {
        return res.status(404).json({
          success: false,
          message: 'Deduction type not found'
        });
      }

      if (deductionType.isStatutory) {
        return res.status(400).json({
          success: false,
          message: 'Cannot assign employees to statutory deductions. Statutory deductions apply to all employees automatically.'
        });
      }

      for (const employeeId of employeeIds) {
        const row = await prisma.employee.findUnique({
          where: { id: employeeId },
          select: { id: true, employeeNumber: true, terminated: true }
        });
        if (!row) {
          return res.status(400).json({ success: false, message: `Employee not found: ${employeeId}` });
        }
        if (row.terminated) {
          return res.status(400).json({
            success: false,
            message: `Cannot assign deductions to a terminated employee (${row.employeeNumber || row.id}).`
          });
        }
      }

      // Create employee deductions
      const employeeDeductions = [];
      for (const employeeId of employeeIds) {
        const employeeDeduction = await prisma.employeeDeduction.create({
          data: {
            employeeId,
            deductionTypeId: id,
            amount: amount ? new Decimal(amount) : null,
            rate: rate ? new Decimal(rate) : null, // Only set if custom rate provided
            effectiveDate: new Date() // Use current date as assignment date
          },
          include: {
            employee: {
              select: {
                id: true,
                employeeNumber: true,
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                    email: true
                  }
                }
              }
            }
          }
        });
        employeeDeductions.push(employeeDeduction);
      }

      res.json({
        success: true,
        message: 'Employees assigned to deduction type successfully',
        data: employeeDeductions
      });
    } catch (error) {
      console.error('Error assigning employees to deduction:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to assign employees to deduction type',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Remove employees from deduction type (Non-Statutory Only)
   */
  static async removeEmployeesFromDeduction(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { employeeIds } = req.body;

      // Check if deduction type exists and is not statutory
      const deductionType = await prisma.deductionTypes.findUnique({
        where: { id }
      });

      if (!deductionType) {
        return res.status(404).json({
          success: false,
          message: 'Deduction type not found'
        });
      }

      if (deductionType.isStatutory) {
        return res.status(400).json({
          success: false,
          message: 'Cannot remove employees from statutory deductions. Statutory deductions apply to all employees automatically.'
        });
      }

      // Remove employee deductions
      const removedCount = await prisma.employeeDeduction.deleteMany({
        where: {
          deductionTypeId: id,
          employeeId: { in: employeeIds }
        }
      });

      // Get remaining employees
      const remainingEmployees = await prisma.employeeDeduction.findMany({
        where: { deductionTypeId: id },
        include: {
          employee: {
            select: {
              id: true,
              employeeNumber: true,
              user: {
                select: {
                  firstName: true,
                  lastName: true,
                  email: true
                }
              }
            }
          }
        }
      });

      res.json({
        success: true,
        message: 'Employees removed from deduction type successfully',
        data: {
          removedCount: removedCount.count,
          remainingEmployees
        }
      });
    } catch (error) {
      console.error('Error removing employees from deduction:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to remove employees from deduction type',
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
      if (employee.terminated) {
        return res.status(403).json({
          success: false,
          message: 'This employment has been terminated. Payroll self-service is not available.'
        });
      }

      res.json({
        success: true,
        data: formatEmployeeForApi(employee)
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
      if (employee.terminated) {
        return res.status(403).json({
          success: false,
          message: 'This employment has been terminated. Payslip self-service is not available.'
        });
      }

      const skip = (Number(page) - 1) * Number(limit);

      const payslips = await prisma.payslip.findMany({
        where: { employeeId: employee.id },
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

      // Transform payslips to include all employee fields and company name
      const transformedPayslips = payslips.map(payslip => ({
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
        companyName: companyNameFullFromEnv()
      }));

      const total = await prisma.payslip.count({
        where: { employeeId: employee.id }
      });

      res.json({
        success: true,
        data: transformedPayslips,
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
      if (employee.terminated) {
        return res.status(403).json({
          success: false,
          message: 'This employment has been terminated. Leave self-service is not available.'
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

      // First, try to find existing leave balance
      const existingBalance = await prisma.leaveBalance.findFirst({
        where: {
          employeeId,
          leaveType
        }
      });

      let leaveBalance;
      if (existingBalance) {
        // Update existing balance
        leaveBalance = await prisma.leaveBalance.update({
          where: { id: existingBalance.id },
          data: {
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
      } else {
        // Create new balance
        leaveBalance = await prisma.leaveBalance.create({
          data: {
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
      }

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
        rate,
        threshold,
        ceiling,
        isStatutory,
        isActive,
        effectiveDate,
        endDate,
        currencyId
      } = req.body;

      const updateData: any = {
        name,
        code,
        description,
        isStatutory: isStatutory === 'true' || isStatutory === true,
        isActive: isActive === 'true' || isActive === true
      };

      // Only update fields that are provided
      if (rate !== undefined) updateData.rate = new Decimal(rate);
      if (threshold !== undefined) updateData.threshold = threshold ? new Decimal(threshold) : null;
      if (ceiling !== undefined) updateData.ceiling = ceiling ? new Decimal(ceiling) : null;
      if (effectiveDate !== undefined) updateData.effectiveDate = new Date(effectiveDate);
      if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;
      if (currencyId !== undefined) updateData.currencyId = currencyId;

      const deductionType = await prisma.deductionTypes.update({
        where: { id },
        data: updateData,
        include: {
          createdBy: {
            select: { firstName: true, lastName: true, email: true }
          },
          currency: {
            select: { code: true, name: true, symbol: true }
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
      const bankName = payrollFormField(req, 'bankName');
      const branchCode = payrollFormField(req, 'branchCode');
      const accountNumber = payrollFormField(req, 'accountNumber');
      const basicSalaryRaw = payrollFormField(req, 'basicSalary');
      const currencyId = payrollFormField(req, 'currencyId');
      const idNumber = payrollFormField(req, 'idNumber');
      const nextOfKin = payrollFormField(req, 'nextOfKin');
      const nextOfKinContact = payrollFormField(req, 'nextOfKinContact');
      const address = payrollFormField(req, 'address');
      const isActiveRaw = payrollFormField(req, 'isActive');

      let isActive: boolean | undefined;
      if (isActiveRaw !== undefined) {
        const lower = isActiveRaw.toLowerCase();
        if (lower === 'true' || lower === '1') isActive = true;
        else if (lower === 'false' || lower === '0') isActive = false;
        else {
          return res.status(400).json({
            success: false,
            message: 'isActive must be true or false'
          });
        }
      } else if (req.body?.isActive !== undefined && typeof req.body.isActive === 'boolean') {
        isActive = req.body.isActive;
      }

      const existing = await prisma.employee.findUnique({ where: { id } });
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Employee not found' });
      }
      if (existing.terminated) {
        return res.status(400).json({
          success: false,
          message: 'This employee is terminated. Updates are not allowed except through a formal reinstatement process.'
        });
      }
      if (isActive === true) {
        /* allow */
      } else if (isActive === false) {
        const performedBy = (req as any).user;
        if (!performedBy?.id) {
          return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const out = await EmployeeTerminationService.terminateEmployee({
          employeeId: id,
          performedBy,
          reason: 'Deactivated via employee update (isActive set to false)'
        });
        return res.json({
          success: true,
          message: 'Employee deactivated; treated as termination (payroll, scorecards, contracts, turnover KPI).',
          data: formatEmployeeForApi(out.employee)
        });
      }

      const hasPictureFile = Boolean((req as { file?: Express.Multer.File }).file?.buffer?.length);
      let pictureUrl: string | null | undefined;
      if (hasPictureFile) {
        try {
          pictureUrl = await resolveEmployeePictureUrl(req);
        } catch (uploadErr) {
          return res.status(400).json({
            success: false,
            message: uploadErr instanceof Error ? uploadErr.message : 'Picture upload failed'
          });
        }
      } else if (isEmployeePictureUrlFieldPresent(req)) {
        // Empty pictureUrl in form-data means user removed the photo.
        pictureUrl = resolveEmployeePictureUrlFromFormField(req);
      }

      const data: Record<string, unknown> = {};
      if (bankName !== undefined) data.bankName = bankName;
      if (branchCode !== undefined) data.branchCode = branchCode;
      if (accountNumber !== undefined) data.accountNumber = accountNumber;
      if (currencyId !== undefined) data.currencyId = currencyId;
      if (idNumber !== undefined) data.idNumber = idNumber;
      if (nextOfKin !== undefined) data.nextOfKin = nextOfKin;
      if (nextOfKinContact !== undefined) data.nextOfKinContact = nextOfKinContact;
      if (address !== undefined) data.address = address;
      if (pictureUrl !== undefined) data.pictureUrl = pictureUrl;

      if (basicSalaryRaw !== undefined) {
        const basicSalaryNum = parseFloat(basicSalaryRaw);
        if (!Number.isFinite(basicSalaryNum)) {
          return res.status(400).json({ success: false, message: 'basicSalary must be a number' });
        }
        data.basicSalary = basicSalaryNum;
      } else if (req.body?.basicSalary !== undefined && req.body.basicSalary !== '') {
        const n = parseFloat(String(req.body.basicSalary));
        if (!Number.isFinite(n)) {
          return res.status(400).json({ success: false, message: 'basicSalary must be a number' });
        }
        data.basicSalary = n;
      }

      const employee = await prisma.employee.update({
        where: { id },
        data,
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
        data: formatEmployeeForApi(employee)
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
   * Delete employee (soft delete — same as terminate: off payroll, contracts cancelled, turnover sync)
   */
  static async deleteEmployee(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const performedBy = (req as any).user;
      if (!performedBy?.id) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
      const out = await EmployeeTerminationService.terminateEmployee({
        employeeId: id,
        performedBy,
        reason: 'Soft delete (legacy DELETE /employees/:id)'
      });
      res.json({
        success: true,
        message: 'Employee terminated and removed from active roster',
        data: { employee: out.employee, performanceContractsCancelled: out.performanceContractsCancelled }
      });
    } catch (error: any) {
      if (String(error?.message || '').includes('not found')) {
        return res.status(404).json({ success: false, message: 'Employee not found' });
      }
      if (String(error?.message || '').includes('already terminated')) {
        return res.status(400).json({ success: false, message: error.message });
      }
      console.error('Error deleting employee:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete employee',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Terminate employment (FHA / HR). Excludes employee from payroll & scorecard lists; cancels open EMPLOYEE performance contracts; syncs turnover KPIs.
   */
  static async terminateEmployee(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { reason } = req.body || {};
      const performedBy = (req as any).user;
      if (!performedBy?.id) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
      const out = await EmployeeTerminationService.terminateEmployee({
        employeeId: id,
        performedBy,
        reason: reason != null ? String(reason) : null
      });
      res.json({
        success: true,
        message: 'Employee terminated successfully',
        data: {
          employee: out.employee,
          performanceContractsCancelled: out.performanceContractsCancelled,
          turnoverKpiSyncAttempts: out.turnoverKpiSyncAttempts
        }
      });
    } catch (error: any) {
      if (String(error?.message || '').includes('not found')) {
        return res.status(404).json({ success: false, message: 'Employee not found' });
      }
      if (String(error?.message || '').includes('already terminated')) {
        return res.status(400).json({ success: false, message: error.message });
      }
      console.error('Error terminating employee:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to terminate employee',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Permanently delete employee (hard delete with cascade)
   * WARNING: This will delete all related payroll data permanently
   */
  static async permanentlyDeleteEmployee(req: Request, res: Response) {
    try {
      const { id } = req.params;

      // Check if employee exists
      const employee = await prisma.employee.findUnique({
        where: { id }
      });

      if (!employee) {
        return res.status(404).json({
          success: false,
          message: 'Employee not found'
        });
      }

      // Use transaction to delete all related records first
      await prisma.$transaction(async (tx) => {
        // Delete employee payrolls first
        await tx.employeePayroll.deleteMany({
          where: { employeeId: id }
        });

        // Delete payslips
        await tx.payslip.deleteMany({
          where: { employeeId: id }
        });

        // Delete salary structures
        await tx.salaryStructure.deleteMany({
          where: { employeeId: id }
        });

        // Delete leave balances
        await tx.leaveBalance.deleteMany({
          where: { employeeId: id }
        });

        // Finally delete the employee
        await tx.employee.delete({
          where: { id }
        });
      });

      res.json({
        success: true,
        message: 'Employee permanently deleted successfully'
      });
    } catch (error) {
      console.error('Error permanently deleting employee:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to permanently delete employee',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Update payroll run
   */
  static async updatePayrollRun(req: Request, res: Response) {
    try {
      const { payrollRunId } = req.params;
      const {
        name,
        payPeriod,
        startDate,
        endDate,
        currencyId
      } = req.body;

      // Check if payroll run exists and is in draft status
      const existingPayrollRun = await prisma.payrollRun.findUnique({
        where: { id: payrollRunId }
      });

      if (!existingPayrollRun) {
        return res.status(404).json({
          success: false,
          message: 'Payroll run not found'
        });
      }

      if (existingPayrollRun.status !== 'DRAFT') {
        return res.status(400).json({
          success: false,
          message: 'Only draft payroll runs can be updated'
        });
      }

      // If dates are being updated, check for overlapping periods
      if (startDate && endDate) {
        const startDateObj = new Date(startDate);
        const endDateObj = new Date(endDate);

        // Check for overlapping payroll runs (excluding current one)
        const overlappingPayrollRun = await prisma.payrollRun.findFirst({
          where: {
            id: { not: payrollRunId }, // Exclude current payroll run
            OR: [
              // Check if new period overlaps with existing period
              {
                AND: [
                  { startDate: { lte: endDateObj } },
                  { endDate: { gte: startDateObj } }
                ]
              },
              // Check if existing period is within new period
              {
                AND: [
                  { startDate: { gte: startDateObj } },
                  { endDate: { lte: endDateObj } }
                ]
              },
              // Check if new period is within existing period
              {
                AND: [
                  { startDate: { lte: startDateObj } },
                  { endDate: { gte: endDateObj } }
                ]
              }
            ],
            // Exclude cancelled payroll runs
            status: {
              not: 'CANCELLED'
            }
          }
        });

        if (overlappingPayrollRun) {
          return res.status(400).json({
            success: false,
            message: 'A payroll run already exists for this period',
            error: `Payroll run "${overlappingPayrollRun.name}" (${overlappingPayrollRun.payPeriod}) already covers the period ${startDate} to ${endDate}`,
            existingPayrollRun: {
              id: overlappingPayrollRun.id,
              name: overlappingPayrollRun.name,
              payPeriod: overlappingPayrollRun.payPeriod,
              startDate: overlappingPayrollRun.startDate,
              endDate: overlappingPayrollRun.endDate,
              status: overlappingPayrollRun.status
            }
          });
        }
      }

      const payrollRun = await prisma.payrollRun.update({
        where: { id: payrollRunId },
        data: {
          name,
          payPeriod,
          startDate: startDate ? new Date(startDate) : undefined,
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
        message: 'Payroll run updated successfully',
        data: payrollRun
      });
    } catch (error) {
      console.error('Error updating payroll run:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update payroll run',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Process Payroll Payment - Wages Clearing
   * POST /api/payroll/payroll-runs/:payrollRunId/payment
   */
  static async processPayrollPayment(req: Request, res: Response) {
    try {
      const { payrollRunId } = req.params;
      const { bankId, paymentDate } = req.body;
      const createdById = (req as any).user.id;

      if (!bankId) {
        return res.status(400).json({
          success: false,
          message: 'Bank ID is required'
        });
      }

      if (!paymentDate) {
        return res.status(400).json({
          success: false,
          message: 'Payment date is required'
        });
      }

      const result = await PayrollService.processPayrollPayment(
        payrollRunId,
        bankId,
        parseDate(paymentDate),
        createdById
      );

      res.json({
        success: true,
        message: result.message,
        data: {
          cashbookEntry: result.cashbookEntry,
          journalEntry: result.journalEntry
        }
      });
    } catch (error) {
      console.error('Error processing payroll payment:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to process payroll payment',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Delete payroll run
   */
  static async deletePayrollRun(req: Request, res: Response) {
    try {
      const { payrollRunId } = req.params;

      // Check if payroll run exists
      const existingPayrollRun = await prisma.payrollRun.findUnique({
        where: { id: payrollRunId }
      });

      if (!existingPayrollRun) {
        return res.status(404).json({
          success: false,
          message: 'Payroll run not found'
        });
      }

      if (existingPayrollRun.status === 'COMPLETED') {
        return res.status(400).json({
          success: false,
          message: 'Completed payroll runs cannot be deleted'
        });
      }

      // Delete related records first (cascade should handle this, but being explicit)
      await prisma.payrollDeduction.deleteMany({
        where: {
          employeePayroll: {
            payrollRunId
          }
        }
      });

      await prisma.payrollAllowance.deleteMany({
        where: {
          employeePayroll: {
            payrollRunId
          }
        }
      });

      await prisma.employeePayroll.deleteMany({
        where: { payrollRunId }
      });

      await prisma.payslip.deleteMany({
        where: { payrollRunId }
      });

      // Delete the payroll run
      await prisma.payrollRun.delete({
        where: { id: payrollRunId }
      });

      res.json({
        success: true,
        message: 'Payroll run deleted successfully'
      });
    } catch (error) {
      console.error('Error deleting payroll run:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete payroll run',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
