// @ts-nocheck
import { Router } from 'express';
import multer from 'multer';
import { PayrollController } from '../controllers/PayrollController';
import { PayrollExtendedController } from '../controllers/PayrollExtendedController';
import { PayrollAccessController } from '../controllers/PayrollAccessController';
import { PayrollEmployeeProvisionController } from '../controllers/PayrollEmployeeProvisionController';
import { authenticate } from '../middleware/authenticate';
import { requireAnyPermission } from '../middleware/permissionAuth';
import { PAYROLL_PERMISSIONS as P } from '../config/payrollPermissions';
import { PayrollVendorService } from '../services/payroll/PayrollVendorService';
import {
  PayrollInputService,
  PayrollCalendarService,
  PayrollOnboardingService,
  PayrollRfqService,
} from '../services/payroll/PayrollOperationsService';

/**
 * Authorisation note.
 *
 * Every route below used to be `authenticate` only, which meant any logged-in
 * user — including a plain employee — could create, process, approve and release
 * payroll runs. Guards are now permission-based; the matching grants live in
 * src/config/payrollPermissions.ts and are applied by
 *   npm run db:migrate:payroll-v6-permissions
 * Shipping a guard without running that migration 403s every request.
 *
 * The `/employee/*` self-service routes stay authenticate-only on purpose: the
 * controllers scope them to the caller's own employee record, so every
 * authenticated user may read their own pay data and nobody else's.
 */
const router = Router();

const canViewEmployees = requireAnyPermission([P.employeesView, P.employeesManage]);
const canManageEmployees = requireAnyPermission([P.employeesManage]);
const canViewRuns = requireAnyPermission([P.runsView, P.runsManage]);
const canManageRuns = requireAnyPermission([P.runsManage]);
const canApproveRuns = requireAnyPermission([P.runsApprove]);
const canReleaseRuns = requireAnyPermission([P.runsRelease]);
const canViewComponents = requireAnyPermission([P.componentsView, P.componentsManage]);
const canManageComponents = requireAnyPermission([P.componentsManage]);
const canViewTax = requireAnyPermission([P.taxView, P.taxManage]);
const canManageTax = requireAnyPermission([P.taxManage]);
const canViewLeave = requireAnyPermission([P.leaveView, P.leaveManage]);
const canManageLeave = requireAnyPermission([P.leaveManage]);
const canViewSettings = requireAnyPermission([P.settingsView, P.settingsManage]);
const canViewVendors = requireAnyPermission([P.vendorsView]);
const canManageVendors = requireAnyPermission([P.vendorsManage]);
const canViewInputs = requireAnyPermission([P.inputsView, P.inputsManage]);
const canManageInputs = requireAnyPermission([P.inputsManage]);
const canViewCalendar = requireAnyPermission([P.calendarView, P.calendarManage]);
const canManageCalendar = requireAnyPermission([P.calendarManage]);
const canViewOnboarding = requireAnyPermission([P.onboardingView, P.onboardingManage]);
const canManageOnboarding = requireAnyPermission([P.onboardingManage]);
const canManageSettings = requireAnyPermission([P.settingsManage]);

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

// ===== CURRENT-USER ACCESS =====
// Authenticated-only and self-scoped: tells the caller which payroll grants
// they hold so the UI can gate on the same answer the guards enforce.
router.get('/me/access', authenticate, PayrollAccessController.getMyAccess);

// ===== AUDIT TRAIL =====
// Payroll had no audit store at all: the runtime logged events to an in-memory
// array that died with the page, so the governance screen showed invented
// history. Backed by payroll_audit_events (npm run db:migrate:payroll-v6-audit-table).
router.get('/audit', authenticate, requireAnyPermission([P.auditView]), PayrollAccessController.listAudit);

// ===== EMPLOYEE MANAGEMENT ROUTES =====
/* Swagger: multipart create/update in src/config/payroll-endpoints.ts (Payroll tag) */
router.post(
  '/employees',
  authenticate,
  canManageEmployees,
  employeeMultipart,
  PayrollController.createEmployee
);
// Employee.userId is required and unique -- an employee IS a user account with
// payroll data attached -- and the module's "Add employee" form has no user id
// to give, so POST /employees could never be driven from it. This provisions
// both rows in one transaction.
router.post('/employees/with-user', authenticate, canManageEmployees, PayrollEmployeeProvisionController.createWithUser);
router.get('/employees', authenticate, canViewEmployees, PayrollController.getEmployees);
router.get('/employees/:id/reimbursement-vendor', authenticate, canViewEmployees, PayrollController.getEmployeeReimbursementVendor);
router.post('/employees/:id/reimbursement-vendor', authenticate, canManageEmployees, PayrollController.ensureEmployeeReimbursementVendor);
router.put(
  '/employees/:id',
  authenticate,
  canManageEmployees,
  employeeMultipart,
  PayrollController.updateEmployee
);
// Employee update. `PayrollController.updateEmployee` has existed all along with no route in
// front of it, so the module's Edit Employee control called PUT /employees/:id and got a 404.
router.put('/employees/:id', authenticate, canManageEmployees, employeeMultipart, PayrollController.updateEmployee);
router.post('/employees/:id/terminate', authenticate, canManageEmployees, PayrollController.terminateEmployee);
router.post('/employees/:id/suspend', authenticate, canManageEmployees, PayrollExtendedController.suspendEmployee);
router.post('/employees/:id/reinstate', authenticate, canManageEmployees, PayrollExtendedController.reinstateEmployee);
// An employee may raise a change request against their own record; the controller
// enforces the ownership check, so this stays authenticate-only.
router.post('/employees/:id/change-requests', authenticate, PayrollExtendedController.submitChangeRequest);
router.get('/employees/:id/change-requests', authenticate, canViewEmployees, PayrollExtendedController.listChangeRequests);
router.post('/change-requests/:requestId/approve', authenticate, canManageEmployees, PayrollExtendedController.approveChangeRequest);
router.post('/change-requests/:requestId/reject', authenticate, canManageEmployees, PayrollExtendedController.rejectChangeRequest);
router.delete('/employees/:id', authenticate, canManageEmployees, PayrollController.deleteEmployee);
router.delete('/employees/:id/permanent', authenticate, canManageEmployees, PayrollController.permanentlyDeleteEmployee);

// ===== EMPLOYEE PORTAL ROUTES (self-scoped in the controller) =====
router.get('/employee/portal', authenticate, PayrollController.getEmployeePayrollInfo);
router.get('/employee/payslips', authenticate, PayrollController.getEmployeePayslips);
router.get('/employee/payslips/:payslipId/download', authenticate, PayrollExtendedController.downloadOwnPayslip);
router.get('/employee/payslips/:payslipId/verify', authenticate, PayrollExtendedController.verifyOwnPayslip);
router.get('/employee/leave-balances', authenticate, PayrollController.getEmployeeLeaveBalances);

// ===== PAYROLL RUN ROUTES =====
// Maker-checker: prepare/process require runs.manage, approve/reject require
// runs.approve, and no non-admin role is granted both.
router.post('/payroll-runs', authenticate, canManageRuns, PayrollController.createPayrollRun);
router.get('/payroll-runs', authenticate, canViewRuns, PayrollController.getAllPayrollRuns);
router.put('/payroll-runs/:payrollRunId', authenticate, canManageRuns, PayrollController.updatePayrollRun);
router.delete('/payroll-runs/:payrollRunId', authenticate, canManageRuns, PayrollController.deletePayrollRun);
router.post('/payroll-runs/:payrollRunId/process', authenticate, canManageRuns, PayrollController.processPayrollRun);
router.post('/payroll-runs/:payrollRunId/submit-for-approval', authenticate, canManageRuns, PayrollExtendedController.submitRunForApproval);
router.post('/payroll-runs/:payrollRunId/approve', authenticate, canApproveRuns, PayrollExtendedController.approveRun);
router.post('/payroll-runs/:payrollRunId/reject', authenticate, canApproveRuns, PayrollExtendedController.rejectRun);
router.post('/payroll-runs/:payrollRunId/payment', authenticate, canReleaseRuns, PayrollController.processPayrollPayment);
router.get('/payroll-runs/:payrollRunId', authenticate, canViewRuns, PayrollController.getPayrollRunSummary);

// ===== BANK FILE GENERATION =====
router.post('/payroll-runs/:payrollRunId/bank-file', authenticate, canReleaseRuns, PayrollController.generateBankFile);

// ===== PAYSLIP ROUTES (administrative access to any employee's payslip) =====
router.get('/payslips/:employeeId/:payrollRunId', authenticate, canViewRuns, PayrollController.getEmployeePayslip);
router.get('/payslips/by-id/:payslipId/download', authenticate, canViewRuns, PayrollExtendedController.downloadPayslip);
router.get('/payslips/by-id/:payslipId/verify', authenticate, canViewRuns, PayrollExtendedController.verifyPayslip);

// ===== STATUTORY BRACKETS & LEVIES =====
router.get('/statutory/brackets', authenticate, canViewTax, PayrollExtendedController.listBrackets);
router.post('/statutory/brackets', authenticate, canManageTax, PayrollExtendedController.createBracket);
router.put('/statutory/brackets/:id', authenticate, canManageTax, PayrollExtendedController.updateBracket);
router.delete('/statutory/brackets/:id', authenticate, canManageTax, PayrollExtendedController.deleteBracket);
router.get('/statutory/levies', authenticate, canViewTax, PayrollExtendedController.listLevies);
router.put('/statutory/levies', authenticate, canManageTax, PayrollExtendedController.upsertLevies);

// ===== SALARY STRUCTURE MANAGEMENT =====
router.post('/salary-structures', authenticate, canManageComponents, PayrollController.createSalaryStructure);
router.get('/salary-structures/employee/:employeeId', authenticate, canViewComponents, PayrollController.getEmployeeSalaryStructures);
router.put('/salary-structures/:id', authenticate, canManageComponents, PayrollController.updateSalaryStructure);
router.delete('/salary-structures/:id', authenticate, canManageComponents, PayrollController.deleteSalaryStructure);

// ===== LEAVE BALANCE MANAGEMENT =====
router.post('/leave-balances', authenticate, canManageLeave, PayrollController.updateLeaveBalance);
router.get('/leave-balances', authenticate, canViewLeave, PayrollController.getAllLeaveBalances);

// ===== TAX RULES MANAGEMENT =====
router.post('/tax-rules', authenticate, canManageTax, PayrollController.createTaxRule);
router.get('/tax-rules', authenticate, canViewTax, PayrollController.getTaxRules);
router.put('/tax-rules/:id', authenticate, canManageTax, PayrollController.updateTaxRule);
router.delete('/tax-rules/:id', authenticate, canManageTax, PayrollController.deleteTaxRule);

// ===== ALLOWANCE TYPES MANAGEMENT =====
router.post('/allowance-types', authenticate, canManageComponents, PayrollController.createAllowanceType);
router.get('/allowance-types', authenticate, canViewComponents, PayrollController.getAllowanceTypes);
router.put('/allowance-types/:id', authenticate, canManageComponents, PayrollController.updateAllowanceType);
router.delete('/allowance-types/:id', authenticate, canManageComponents, PayrollController.deleteAllowanceType);

// ===== DEDUCTION TYPES MANAGEMENT =====
router.post('/deduction-types', authenticate, canManageComponents, PayrollController.createDeductionType);
router.get('/deduction-types', authenticate, canViewComponents, PayrollController.getDeductionTypes);
router.get('/deduction-types/:id', authenticate, canViewComponents, PayrollController.getDeductionType);
router.put('/deduction-types/:id', authenticate, canManageComponents, PayrollController.updateDeductionType);
router.delete('/deduction-types/:id', authenticate, canManageComponents, PayrollController.deleteDeductionType);

// ===== EMPLOYEE DEDUCTION ASSIGNMENTS (Non-Statutory Only) =====
router.put('/deduction-types/:id/employees', authenticate, canManageComponents, PayrollController.assignEmployeesToDeduction);
router.delete('/deduction-types/:id/employees', authenticate, canManageComponents, PayrollController.removeEmployeesFromDeduction);

// ===== BANK FILE TEMPLATES MANAGEMENT =====
router.post('/bank-templates', authenticate, canManageSettings, PayrollController.createBankFileTemplate);
// Vendors & Quotations read its suppliers from a hardcoded fixture — invented companies with
// invented ratings and contract values, shown to staff as real records. `payroll.vendors.view`
// already existed as a permission and was already granted; only the endpoint was missing.
router.get('/vendors', authenticate, canViewVendors, async (req, res) => {
  try {
    res.json({ success: true, data: await PayrollVendorService.list(req.query) });
  } catch (e: any) {
    res.status(e?.status || 500).json({ success: false, message: e?.message || 'Error' });
  }
});

// Four screens that had no backend at all and rendered the runtime's fixtures instead:
// Inputs & Validation, Pay Groups & Calendar, Onboarding, and the RFQ half of Vendors.
// See design-refs/payroll-v6-backend-asks.md sections 2.2, 2.4, 2.5 and 2.8.
const handle = (fn: (req: any) => Promise<unknown>) => async (req: any, res: any) => {
  try {
    res.json({ success: true, data: await fn(req) });
  } catch (e: any) {
    res.status(e?.status || 400).json({ success: false, message: e?.message || 'Error' });
  }
};

// Inputs & Validation
router.get('/inputs/batches', authenticate, canViewInputs, handle((req) => PayrollInputService.listBatches(req.query)));
router.get('/inputs/batches/:id', authenticate, canViewInputs, handle((req) => PayrollInputService.getBatch(req.params.id)));
router.post('/inputs/batches', authenticate, canManageInputs, handle((req) => PayrollInputService.createBatch({ ...req.body, uploadedById: req.user?.id })));
router.post('/inputs/batches/:id/commit', authenticate, canManageInputs, handle((req) => PayrollInputService.commitBatch(req.params.id)));
router.patch('/inputs/rows/:rowId/resolve', authenticate, canManageInputs, handle((req) => PayrollInputService.resolveRow(req.params.rowId, { ...req.body, resolvedById: req.user?.id })));

// Pay groups and calendar
router.get('/pay-groups', authenticate, canViewCalendar, handle(() => PayrollCalendarService.listGroups()));
router.post('/pay-groups', authenticate, canManageCalendar, handle((req) => PayrollCalendarService.createGroup(req.body)));
router.patch('/pay-groups/:id', authenticate, canManageCalendar, handle((req) => PayrollCalendarService.updateGroup(req.params.id, req.body)));
router.put('/pay-groups/:id/periods', authenticate, canManageCalendar, handle((req) => PayrollCalendarService.upsertPeriod(req.params.id, req.body)));

// Onboarding
router.get('/onboarding/candidates', authenticate, canViewOnboarding, handle((req) => PayrollOnboardingService.list(req.query)));
router.post('/onboarding/candidates', authenticate, canManageOnboarding, handle((req) => PayrollOnboardingService.create({ ...req.body, createdById: req.user?.id })));
router.patch('/onboarding/candidates/:id', authenticate, canManageOnboarding, handle((req) => PayrollOnboardingService.update(req.params.id, req.body)));

// RFQs and quotations
router.get('/rfqs', authenticate, canViewVendors, handle((req) => PayrollRfqService.list(req.query)));
router.post('/rfqs', authenticate, canManageVendors, handle((req) => PayrollRfqService.create({ ...req.body, createdById: req.user?.id })));
router.post('/rfqs/:id/bids', authenticate, canManageVendors, handle((req) => PayrollRfqService.recordBid(req.params.id, req.body)));
router.post('/rfqs/:id/award/:bidId', authenticate, canManageVendors, handle((req) => PayrollRfqService.award(req.params.id, req.params.bidId)));

router.get('/bank-templates', authenticate, canViewSettings, PayrollController.getBankFileTemplates);
router.put('/bank-templates/:id', authenticate, canManageSettings, PayrollController.updateBankFileTemplate);
router.delete('/bank-templates/:id', authenticate, canManageSettings, PayrollController.deleteBankFileTemplate);

export default router;
