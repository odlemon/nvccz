// Accounting endpoints for fallback Swagger spec
export const accountingEndpoints = {
  // Asset Management - ALL endpoints
  '/accounting/assets': {
    post: { summary: 'Create asset', tags: ['Asset Management'], security: [{ bearerAuth: [] }] },
    get: { summary: 'Get assets', tags: ['Asset Management'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/assets/{id}': {
    get: { summary: 'Get asset by ID', tags: ['Asset Management'], security: [{ bearerAuth: [] }] },
    put: { summary: 'Update asset', tags: ['Asset Management'], security: [{ bearerAuth: [] }] },
    delete: { summary: 'Delete asset', tags: ['Asset Management'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/assets/{assetId}/depreciation': {
    post: { summary: 'Calculate depreciation for an asset', tags: ['Asset Management'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/assets/{id}/depreciate': {
    post: { summary: 'Calculate depreciation for an asset (data)', tags: ['Asset Management'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/assets/depreciation/{depreciationId}/post': {
    post: { summary: 'Post depreciation entry', tags: ['Asset Management'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/assets/{assetId}/dispose': {
    post: { summary: 'Dispose of an asset', tags: ['Asset Management'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/assets/{id}/dispose': {
    post: { summary: 'Dispose of an asset (data)', tags: ['Asset Management'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/assets/register': {
    get: { summary: 'Get asset register', tags: ['Asset Management'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/assets/{assetId}/depreciation-schedule': {
    get: { summary: 'Get depreciation schedule for an asset', tags: ['Asset Management'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/assets/depreciation-schedule': {
    get: { summary: 'Get depreciation schedule (data)', tags: ['Asset Management'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/assets/dashboard': {
    get: { summary: 'Get asset dashboard', tags: ['Asset Management'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/assets/depreciation/monthly': {
    post: { summary: 'Post monthly depreciation', tags: ['Asset Management'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/assets/depreciation/annual': {
    post: { summary: 'Post annual depreciation', tags: ['Asset Management'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/assets/{id}/revalue': {
    post: { summary: 'Revalue an asset', tags: ['Asset Management'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/assets/register/generate': {
    get: { summary: 'Generate asset register', tags: ['Asset Management'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/assets/depreciation-schedule/generate': {
    get: { summary: 'Generate depreciation schedule', tags: ['Asset Management'], security: [{ bearerAuth: [] }] }
  },

  // Bank Reconciliation - ALL endpoints
  '/api/accounting/bank-reconciliation/upload': {
    post: { summary: 'Upload and process bank statement', tags: ['Bank Reconciliation'], security: [{ bearerAuth: [] }] }
  },
  '/api/accounting/bank-reconciliation': {
    get: { summary: 'Get all bank reconciliations', tags: ['Bank Reconciliation'], security: [{ bearerAuth: [] }] }
  },
  '/api/accounting/bank-reconciliation/summary': {
    get: { summary: 'Get reconciliation summary statistics', tags: ['Bank Reconciliation'], security: [{ bearerAuth: [] }] }
  },
  '/api/accounting/bank-reconciliation/{id}': {
    get: { summary: 'Get reconciliation by ID', tags: ['Bank Reconciliation'], security: [{ bearerAuth: [] }] },
    delete: { summary: 'Delete reconciliation', tags: ['Bank Reconciliation'], security: [{ bearerAuth: [] }] }
  },
  '/api/accounting/bank-reconciliation/{reconciliationId}/unmatched': {
    get: { summary: 'Get unmatched transactions for manual review', tags: ['Bank Reconciliation'], security: [{ bearerAuth: [] }] }
  },
  '/api/accounting/bank-reconciliation/transactions/{bankTransactionId}/matches': {
    get: { summary: 'Get potential matches for a specific transaction', tags: ['Bank Reconciliation'], security: [{ bearerAuth: [] }] }
  },
  '/api/accounting/bank-reconciliation/approve-match': {
    post: { summary: 'Approve manual match', tags: ['Bank Reconciliation'], security: [{ bearerAuth: [] }] }
  },
  '/api/accounting/bank-reconciliation/results/{reconciliationResultId}/reject': {
    post: { summary: 'Reject a reconciliation result', tags: ['Bank Reconciliation'], security: [{ bearerAuth: [] }] }
  },
  '/api/accounting/bank-reconciliation/{reconciliationId}/audit-trail': {
    get: { summary: 'Get audit trail for a reconciliation', tags: ['Bank Reconciliation'], security: [{ bearerAuth: [] }] }
  },

  // Credit Notes - ALL endpoints
  '/accounting/credit-notes': {
    post: { summary: 'Create credit note', tags: ['Credit Notes'], security: [{ bearerAuth: [] }] },
    get: { summary: 'Get credit notes', tags: ['Credit Notes'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/credit-notes/report': {
    get: { summary: 'Generate credit note report', tags: ['Credit Notes'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/credit-notes/dashboard': {
    get: { summary: 'Get credit note dashboard', tags: ['Credit Notes'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/credit-notes/customer/{customerId}': {
    get: { summary: 'Get credit notes for a customer', tags: ['Credit Notes'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/credit-notes/{id}/send': {
    post: { summary: 'Send credit note to customer', tags: ['Credit Notes'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/credit-notes/{id}/apply': {
    post: { summary: 'Apply credit note to invoice', tags: ['Credit Notes'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/credit-notes/{id}': {
    get: { summary: 'Get credit note by ID', tags: ['Credit Notes'], security: [{ bearerAuth: [] }] },
    put: { summary: 'Update credit note', tags: ['Credit Notes'], security: [{ bearerAuth: [] }] },
    delete: { summary: 'Delete credit note', tags: ['Credit Notes'], security: [{ bearerAuth: [] }] }
  },

  // Inventory Management - ALL endpoints
  '/accounting/inventory/items': {
    post: { summary: 'Create inventory item', tags: ['Inventory Management'], security: [{ bearerAuth: [] }] },
    get: { summary: 'Get inventory items', tags: ['Inventory Management'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/inventory/items/{id}': {
    get: { summary: 'Get inventory item by ID', tags: ['Inventory Management'], security: [{ bearerAuth: [] }] },
    put: { summary: 'Update inventory item', tags: ['Inventory Management'], security: [{ bearerAuth: [] }] },
    delete: { summary: 'Delete inventory item', tags: ['Inventory Management'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/inventory/movements': {
    post: { summary: 'Record stock movement', tags: ['Inventory Management'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/inventory/items/{itemId}/movements': {
    get: { summary: 'Get stock movements for an item', tags: ['Inventory Management'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/inventory/valuation': {
    get: { summary: 'Get inventory valuation', tags: ['Inventory Management'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/inventory/reorder-alerts': {
    get: { summary: 'Get reorder level alerts', tags: ['Inventory Management'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/inventory/reorder-levels': {
    get: { summary: 'Get reorder levels (data for reorder alerts)', tags: ['Inventory Management'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/inventory/dashboard': {
    get: { summary: 'Get inventory dashboard', tags: ['Inventory Management'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/inventory/sales-invoice': {
    post: { summary: 'Process sales invoice', tags: ['Inventory Management'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/inventory/update-stock': {
    post: { summary: 'Update stock quantity', tags: ['Inventory Management'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/inventory/calculate-cogs': {
    post: { summary: 'Calculate Cost of Goods Sold', tags: ['Inventory Management'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/inventory/report': {
    get: { summary: 'Generate inventory report', tags: ['Inventory Management'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/inventory/check-reorder-levels': {
    get: { summary: 'Check reorder levels', tags: ['Inventory Management'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/inventory/inventory-value': {
    get: { summary: 'Get inventory value', tags: ['Inventory Management'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/inventory/adjustments': {
    post: { summary: 'Create inventory adjustment', tags: ['Inventory Management'], security: [{ bearerAuth: [] }] }
  },

  // Multi-Currency - ALL endpoints
  '/accounting/multi-currency/exchange-rates': {
    post: { summary: 'Create exchange rate', tags: ['Multi-Currency'], security: [{ bearerAuth: [] }] },
    get: { summary: 'Get exchange rates', tags: ['Multi-Currency'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/multi-currency/exchange-rates/{id}': {
    put: { summary: 'Update exchange rate', tags: ['Multi-Currency'], security: [{ bearerAuth: [] }] },
    delete: { summary: 'Delete exchange rate', tags: ['Multi-Currency'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/multi-currency/convert': {
    post: { summary: 'Convert currency', tags: ['Multi-Currency'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/multi-currency/payments': {
    post: { summary: 'Process multi-currency payment', tags: ['Multi-Currency'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/multi-currency/forex-gain-loss': {
    get: { summary: 'Get forex gain/loss', tags: ['Multi-Currency'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/multi-currency/dashboard': {
    get: { summary: 'Get multi-currency dashboard', tags: ['Multi-Currency'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/multi-currency/calculate-forex-gain-loss': {
    post: { summary: 'Calculate forex gain/loss', tags: ['Multi-Currency'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/multi-currency/post-forex-gain-loss': {
    post: { summary: 'Post forex gain/loss', tags: ['Multi-Currency'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/multi-currency/reconcile-invoice/{invoiceId}': {
    get: { summary: 'Reconcile multi-currency invoice', tags: ['Multi-Currency'], security: [{ bearerAuth: [] }] }
  },

  // Statement of Accounts - ALL endpoints
  '/accounting/statements/customer': {
    post: { summary: 'Generate customer statements', tags: ['Statement of Accounts'], security: [{ bearerAuth: [] }] },
    get: { summary: 'Get all vendor statements', tags: ['Statement of Accounts'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/statements/vendor': {
    post: { summary: 'Generate statements for all vendors', tags: ['Statement of Accounts'], security: [{ bearerAuth: [] }] },
    get: { summary: 'Get all vendor statements', tags: ['Statement of Accounts'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/statements/customer/{customerId}': {
    post: { summary: 'Generate statement for a specific customer', tags: ['Statement of Accounts'], security: [{ bearerAuth: [] }] },
    get: { summary: 'Get statements for a specific customer', tags: ['Statement of Accounts'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/statements/vendor/{vendorId}': {
    post: { summary: 'Generate statement for a specific vendor', tags: ['Statement of Accounts'], security: [{ bearerAuth: [] }] },
    get: { summary: 'Get statements for a specific vendor', tags: ['Statement of Accounts'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/statements': {
    get: { summary: 'Get all statements', tags: ['Statement of Accounts'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/statements/{id}': {
    get: { summary: 'Get statement by ID', tags: ['Statement of Accounts'], security: [{ bearerAuth: [] }] },
    delete: { summary: 'Delete statement', tags: ['Statement of Accounts'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/statements/dashboard': {
    get: { summary: 'Get statement dashboard', tags: ['Statement of Accounts'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/statements/{statementId}/format': {
    get: { summary: 'Format statement', tags: ['Statement of Accounts'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/statements/{statementId}/email': {
    post: { summary: 'Email statement', tags: ['Statement of Accounts'], security: [{ bearerAuth: [] }] }
  },

  // Activity Logs
  '/api/activity-logs': {
    post: { summary: 'Create a new activity log', tags: ['Activity Logs'], security: [{ bearerAuth: [] }] },
    get: { summary: 'Get all activity logs', tags: ['Activity Logs'], security: [{ bearerAuth: [] }] }
  },
  '/api/activity-logs/statistics': {
    get: { summary: 'Get activity log statistics', tags: ['Activity Logs'], security: [{ bearerAuth: [] }] }
  },
  '/api/activity-logs/{id}': {
    get: { summary: 'Get activity log by ID', tags: ['Activity Logs'], security: [{ bearerAuth: [] }] }
  },

  // Applications
  '/api/applications': {
    post: { summary: 'Create a new investment application (PUBLIC)', tags: ['Applications'] },
    get: { summary: 'Get all applications (PROTECTED)', tags: ['Applications'], security: [{ bearerAuth: [] }] }
  },
  '/api/applications/{id}/status': {
    get: { summary: 'Get application status (PUBLIC)', tags: ['Applications'] }
  },
  '/api/applications/{id}/submit': {
    post: { summary: 'Submit application (PUBLIC)', tags: ['Applications'] }
  },
  '/api/applications/{id}': {
    get: { summary: 'Get application by ID (PROTECTED)', tags: ['Applications'], security: [{ bearerAuth: [] }] },
    put: { summary: 'Update application (PROTECTED)', tags: ['Applications'], security: [{ bearerAuth: [] }] },
    delete: { summary: 'Delete application (PROTECTED)', tags: ['Applications'], security: [{ bearerAuth: [] }] }
  },
  '/api/applications/{id}/change-stage': {
    post: { summary: 'Change application stage (PROTECTED)', tags: ['Applications'], security: [{ bearerAuth: [] }] }
  },
  '/api/applications/{id}/due-diligence/initiate': {
    post: { summary: 'Initiate due diligence for an application (PROTECTED)', tags: ['Applications'], security: [{ bearerAuth: [] }] }
  },
  '/api/applications/{id}/due-diligence': {
    put: { summary: 'Update due diligence (PROTECTED)', tags: ['Applications'], security: [{ bearerAuth: [] }] },
    get: { summary: 'Get due diligence report (PROTECTED)', tags: ['Applications'], security: [{ bearerAuth: [] }] }
  },
  '/api/applications/{id}/due-diligence/complete': {
    post: { summary: 'Complete due diligence (PROTECTED)', tags: ['Applications'], security: [{ bearerAuth: [] }] }
  },
  '/api/applications/due-diligence': {
    get: { summary: 'Get all due diligence reviews (PROTECTED)', tags: ['Applications'], security: [{ bearerAuth: [] }] }
  },

  // Approval Workflows
  '/api/approval-workflows': {
    post: { summary: 'Create a new approval workflow', tags: ['Approval Workflows'], security: [{ bearerAuth: [] }] },
    get: { summary: 'Get all approval workflows', tags: ['Approval Workflows'], security: [{ bearerAuth: [] }] }
  },
  '/api/approval-workflows/{id}': {
    get: { summary: 'Get approval workflow by ID', tags: ['Approval Workflows'], security: [{ bearerAuth: [] }] }
  },
  '/api/approval-workflows/{module}/{entityType}': {
    get: { summary: 'Get workflows by module and entity type', tags: ['Approval Workflows'], security: [{ bearerAuth: [] }] }
  },

  // Approval Requests
  '/api/approval-workflows/requests': {
    post: { summary: 'Create an approval request', tags: ['Approval Requests'], security: [{ bearerAuth: [] }] }
  },
  '/api/approval-workflows/requests/my': {
    get: { summary: 'Get approval requests for current user', tags: ['Approval Requests'], security: [{ bearerAuth: [] }] }
  },
  '/api/approval-workflows/requests/{requestId}/steps/{stepId}/approve': {
    put: { summary: 'Process an approval/rejection', tags: ['Approval Requests'], security: [{ bearerAuth: [] }] }
  },

  // Authentication
  '/auth/login': {
    post: { summary: 'User login', tags: ['Authentication'] }
  },
  '/auth/me': {
    get: { summary: 'Get current user information', tags: ['Authentication'], security: [{ bearerAuth: [] }] }
  },

  // Automated Reporting
  '/api/automated-reporting/templates': {
    post: { summary: 'Create a new report template', tags: ['Automated Reporting'], security: [{ bearerAuth: [] }] },
    get: { summary: 'Get all report templates', tags: ['Automated Reporting'], security: [{ bearerAuth: [] }] }
  },
  '/api/automated-reporting/analytics': {
    get: { summary: 'Get reporting analytics', tags: ['Automated Reporting'], security: [{ bearerAuth: [] }] }
  },
  '/api/automated-reporting/templates/{id}': {
    get: { summary: 'Get report template by ID', tags: ['Automated Reporting'], security: [{ bearerAuth: [] }] },
    put: { summary: 'Update report template', tags: ['Automated Reporting'], security: [{ bearerAuth: [] }] },
    delete: { summary: 'Delete report template', tags: ['Automated Reporting'], security: [{ bearerAuth: [] }] }
  },
  '/api/automated-reporting/generate': {
    post: { summary: 'Generate a report', tags: ['Automated Reporting'], security: [{ bearerAuth: [] }] }
  },
  '/api/automated-reporting/variance-reports': {
    post: { summary: 'Create variance report', tags: ['Automated Reporting'], security: [{ bearerAuth: [] }] }
  },
  '/api/automated-reporting/turnover-reports': {
    post: { summary: 'Create turnover analysis report', tags: ['Automated Reporting'], security: [{ bearerAuth: [] }] }
  },

  // Board Reviews
  '/api/board-reviews/{applicationId}': {
    post: { summary: 'Create a new board review', tags: ['Board Reviews'], security: [{ bearerAuth: [] }] },
    get: { summary: 'Get board review by application ID', tags: ['Board Reviews'], security: [{ bearerAuth: [] }] },
    put: { summary: 'Update board review', tags: ['Board Reviews'], security: [{ bearerAuth: [] }] }
  },
  '/api/board-reviews/{applicationId}/complete': {
    post: { summary: 'Complete board review', tags: ['Board Reviews'], security: [{ bearerAuth: [] }] }
  },
  '/api/board-reviews': {
    get: { summary: 'Get all board reviews', tags: ['Board Reviews'], security: [{ bearerAuth: [] }] }
  },
  '/api/board-reviews/my': {
    get: { summary: 'Get my board reviews', tags: ['Board Reviews'], security: [{ bearerAuth: [] }] }
  },
  '/api/board-reviews/summary': {
    get: { summary: 'Get board review summary', tags: ['Board Reviews'], security: [{ bearerAuth: [] }] }
  },

  // Chart of Accounts
  '/api/accounting/chart-of-accounts': {
    post: { summary: 'Create a new chart of accounts entry', tags: ['Accounting - Chart of Accounts'], security: [{ bearerAuth: [] }] },
    get: { summary: 'Get all chart of accounts', tags: ['Accounting - Chart of Accounts'], security: [{ bearerAuth: [] }] }
  },
  '/api/accounting/chart-of-accounts/{id}': {
    get: { summary: 'Get chart of accounts by ID', tags: ['Accounting - Chart of Accounts'], security: [{ bearerAuth: [] }] },
    put: { summary: 'Update chart of accounts', tags: ['Accounting - Chart of Accounts'], security: [{ bearerAuth: [] }] },
    delete: { summary: 'Delete chart of accounts', tags: ['Accounting - Chart of Accounts'], security: [{ bearerAuth: [] }] }
  },
  '/api/accounting/chart-of-accounts/with-journal-entries': {
    get: { summary: 'Get all chart of accounts with detailed journal entry lines', tags: ['Accounting - Chart of Accounts'], security: [{ bearerAuth: [] }] }
  },

  // Trial Balance
  '/accounting/trial-balance': {
    get: { summary: 'Generate trial balance', tags: ['Trial Balance'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/trial-balance/summary': {
    get: { summary: 'Get trial balance summary', tags: ['Trial Balance'], security: [{ bearerAuth: [] }] }
  },
  '/accounting/trial-balance/by-account-type': {
    get: { summary: 'Get trial balance by account type', tags: ['Trial Balance'], security: [{ bearerAuth: [] }] }
  }
};
