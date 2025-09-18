// @ts-nocheck
import { Router } from 'express';
import { PayrollController } from '../controllers/PayrollController';
import { authenticate } from '../middleware/authenticate';

const router = Router();

// ===== EMPLOYEE MANAGEMENT ROUTES =====
router.post('/employees', authenticate, PayrollController.createEmployee);
router.get('/employees', authenticate, PayrollController.getEmployees);
router.put('/employees/:id', authenticate, PayrollController.updateEmployee);
router.delete('/employees/:id', authenticate, PayrollController.deleteEmployee);

// ===== EMPLOYEE PORTAL ROUTES =====
router.get('/employee/portal', authenticate, PayrollController.getEmployeePayrollInfo);
router.get('/employee/payslips', authenticate, PayrollController.getEmployeePayslips);
router.get('/employee/leave-balances', authenticate, PayrollController.getEmployeeLeaveBalances);

// ===== PAYROLL RUN ROUTES =====
router.post('/payroll-runs', authenticate, PayrollController.createPayrollRun);
router.get('/payroll-runs', authenticate, PayrollController.getAllPayrollRuns);
router.post('/payroll-runs/:payrollRunId/process', authenticate, PayrollController.processPayrollRun);
router.get('/payroll-runs/:payrollRunId', authenticate, PayrollController.getPayrollRunSummary);

// ===== BANK FILE GENERATION =====
router.post('/payroll-runs/:payrollRunId/bank-file', authenticate, PayrollController.generateBankFile);

// ===== PAYSLIP ROUTES =====
router.get('/payslips/:employeeId/:payrollRunId', authenticate, PayrollController.getEmployeePayslip);

// ===== SALARY STRUCTURE MANAGEMENT =====
router.post('/salary-structures', authenticate, PayrollController.createSalaryStructure);
router.get('/salary-structures/employee/:employeeId', authenticate, PayrollController.getEmployeeSalaryStructures);
router.put('/salary-structures/:id', authenticate, PayrollController.updateSalaryStructure);
router.delete('/salary-structures/:id', authenticate, PayrollController.deleteSalaryStructure);

// ===== LEAVE BALANCE MANAGEMENT =====
router.post('/leave-balances', authenticate, PayrollController.updateLeaveBalance);
router.get('/leave-balances', authenticate, PayrollController.getAllLeaveBalances);

// ===== TAX RULES MANAGEMENT =====
router.post('/tax-rules', authenticate, PayrollController.createTaxRule);
router.get('/tax-rules', authenticate, PayrollController.getTaxRules);
router.put('/tax-rules/:id', authenticate, PayrollController.updateTaxRule);
router.delete('/tax-rules/:id', authenticate, PayrollController.deleteTaxRule);

// ===== ALLOWANCE TYPES MANAGEMENT =====
router.post('/allowance-types', authenticate, PayrollController.createAllowanceType);
router.get('/allowance-types', authenticate, PayrollController.getAllowanceTypes);
router.put('/allowance-types/:id', authenticate, PayrollController.updateAllowanceType);
router.delete('/allowance-types/:id', authenticate, PayrollController.deleteAllowanceType);

// ===== DEDUCTION TYPES MANAGEMENT =====
router.post('/deduction-types', authenticate, PayrollController.createDeductionType);
router.get('/deduction-types', authenticate, PayrollController.getDeductionTypes);
router.put('/deduction-types/:id', authenticate, PayrollController.updateDeductionType);
router.delete('/deduction-types/:id', authenticate, PayrollController.deleteDeductionType);

// ===== BANK FILE TEMPLATES MANAGEMENT =====
router.post('/bank-templates', authenticate, PayrollController.createBankFileTemplate);
router.get('/bank-templates', authenticate, PayrollController.getBankFileTemplates);
router.put('/bank-templates/:id', authenticate, PayrollController.updateBankFileTemplate);
router.delete('/bank-templates/:id', authenticate, PayrollController.deleteBankFileTemplate);

export default router;
