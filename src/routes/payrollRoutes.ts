// @ts-nocheck
import { Router } from 'express';
import multer from 'multer';
import { PayrollController } from '../controllers/PayrollController';
import { PayrollExtendedController } from '../controllers/PayrollExtendedController';
import { authenticate } from '../middleware/authenticate';

const router = Router();
const employeePictureUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

/** Parse multipart only when client sends form-data; JSON body still works without a file. */
function employeeMultipart(req: any, res: any, next: any) {
  const ct = String(req.headers['content-type'] || '');
  if (ct.includes('multipart/form-data')) {
    return employeePictureUpload.single('picture')(req, res, (err: any) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.code === 'LIMIT_FILE_SIZE' ? 'Picture must be 10MB or less' : err.message
        });
      }
      next();
    });
  }
  next();
}

// ===== EMPLOYEE MANAGEMENT ROUTES =====
/* Swagger: multipart create/update in src/config/payroll-endpoints.ts (Payroll - Employees) */
router.post(
  '/employees',
  authenticate,
  employeeMultipart,
  PayrollController.createEmployee
);
router.get('/employees', authenticate, PayrollController.getEmployees);
router.get('/employees/:id/reimbursement-vendor', authenticate, PayrollController.getEmployeeReimbursementVendor);
router.post('/employees/:id/reimbursement-vendor', authenticate, PayrollController.ensureEmployeeReimbursementVendor);
router.put(
  '/employees/:id',
  authenticate,
  employeeMultipart,
  PayrollController.updateEmployee
);
router.post('/employees/:id/terminate', authenticate, PayrollController.terminateEmployee);
router.post('/employees/:id/suspend', authenticate, PayrollExtendedController.suspendEmployee);
router.post('/employees/:id/reinstate', authenticate, PayrollExtendedController.reinstateEmployee);
router.post('/employees/:id/change-requests', authenticate, PayrollExtendedController.submitChangeRequest);
router.get('/employees/:id/change-requests', authenticate, PayrollExtendedController.listChangeRequests);
router.post('/change-requests/:requestId/approve', authenticate, PayrollExtendedController.approveChangeRequest);
router.post('/change-requests/:requestId/reject', authenticate, PayrollExtendedController.rejectChangeRequest);
router.delete('/employees/:id', authenticate, PayrollController.deleteEmployee);
router.delete('/employees/:id/permanent', authenticate, PayrollController.permanentlyDeleteEmployee);

// ===== EMPLOYEE PORTAL ROUTES =====
router.get('/employee/portal', authenticate, PayrollController.getEmployeePayrollInfo);
router.get('/employee/payslips', authenticate, PayrollController.getEmployeePayslips);
router.get('/employee/payslips/:payslipId/download', authenticate, PayrollExtendedController.downloadOwnPayslip);
router.get('/employee/payslips/:payslipId/verify', authenticate, PayrollExtendedController.verifyOwnPayslip);
router.get('/employee/leave-balances', authenticate, PayrollController.getEmployeeLeaveBalances);

// ===== PAYROLL RUN ROUTES =====
router.post('/payroll-runs', authenticate, PayrollController.createPayrollRun);
router.get('/payroll-runs', authenticate, PayrollController.getAllPayrollRuns);
router.put('/payroll-runs/:payrollRunId', authenticate, PayrollController.updatePayrollRun);
router.delete('/payroll-runs/:payrollRunId', authenticate, PayrollController.deletePayrollRun);
router.post('/payroll-runs/:payrollRunId/process', authenticate, PayrollController.processPayrollRun);
router.post('/payroll-runs/:payrollRunId/submit-for-approval', authenticate, PayrollExtendedController.submitRunForApproval);
router.post('/payroll-runs/:payrollRunId/approve', authenticate, PayrollExtendedController.approveRun);
router.post('/payroll-runs/:payrollRunId/reject', authenticate, PayrollExtendedController.rejectRun);
router.post('/payroll-runs/:payrollRunId/payment', authenticate, PayrollController.processPayrollPayment);
router.get('/payroll-runs/:payrollRunId', authenticate, PayrollController.getPayrollRunSummary);

// ===== BANK FILE GENERATION =====
router.post('/payroll-runs/:payrollRunId/bank-file', authenticate, PayrollController.generateBankFile);

// ===== PAYSLIP ROUTES =====
router.get('/payslips/:employeeId/:payrollRunId', authenticate, PayrollController.getEmployeePayslip);
router.get('/payslips/by-id/:payslipId/download', authenticate, PayrollExtendedController.downloadPayslip);
router.get('/payslips/by-id/:payslipId/verify', authenticate, PayrollExtendedController.verifyPayslip);

router.get('/statutory/brackets', authenticate, PayrollExtendedController.listBrackets);
router.post('/statutory/brackets', authenticate, PayrollExtendedController.createBracket);
router.put('/statutory/brackets/:id', authenticate, PayrollExtendedController.updateBracket);
router.delete('/statutory/brackets/:id', authenticate, PayrollExtendedController.deleteBracket);
router.get('/statutory/levies', authenticate, PayrollExtendedController.listLevies);
router.put('/statutory/levies', authenticate, PayrollExtendedController.upsertLevies);

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
router.get('/deduction-types/:id', authenticate, PayrollController.getDeductionType);
router.put('/deduction-types/:id', authenticate, PayrollController.updateDeductionType);
router.delete('/deduction-types/:id', authenticate, PayrollController.deleteDeductionType);

// ===== EMPLOYEE DEDUCTION ASSIGNMENTS (Non-Statutory Only) =====
router.put('/deduction-types/:id/employees', authenticate, PayrollController.assignEmployeesToDeduction);
router.delete('/deduction-types/:id/employees', authenticate, PayrollController.removeEmployeesFromDeduction);

// ===== BANK FILE TEMPLATES MANAGEMENT =====
router.post('/bank-templates', authenticate, PayrollController.createBankFileTemplate);
router.get('/bank-templates', authenticate, PayrollController.getBankFileTemplates);
router.put('/bank-templates/:id', authenticate, PayrollController.updateBankFileTemplate);
router.delete('/bank-templates/:id', authenticate, PayrollController.deleteBankFileTemplate);

export default router;
