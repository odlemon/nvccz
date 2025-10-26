SRD: CASHBOOK
1. Scope
This SRD covers ONLY the Cashbook. Its objective: track, process, match, and reconcile all
business cash and bank transactions, following double-entry best practices.
2. Main Features and Requirements
2.1 Cashbook Structure
• Support Multiple Cashbooks: Allow creation and management of multiple cashbook
accounts (e.g., bank accounts, petty cash, credit card, foreign currency).
• Cashbook Sides: Each cashbook must support two tabs: Receipts and Payments.
• Entry Type Logic: Cashbooks use separate entry types for payment and receipt
transactions; ensure clear D/C designation on entry types for correct posting.
2.2 Transaction Processing
2.2.1 Workflow: Receipts
• Step 1: User selects/creates the cashbook account to work with.
• Step 2: Select period and transaction date.
• Step 3: Choose entry type (customer, supplier, GL, etc.):
o For customer receipt, user selects customer account.
o For general ledger receipt, user selects relevant GL account.
• Step 4: Input reference, description, amount, any discount, and project code (if enabled).
• Step 5: If customer is “Open Item,” show matching screen to allocate payment to
invoice(s).
• Step 6: Repeat data entry for multiple receipts as needed (batch mode).
• Step 7: Post/update batch to general ledger (after review/optional printout/backups).
Accounting treatment:
• Bank (Asset) is debited when a receipt is made.
• Receipts posted credit customer/GL account and debit bank.
2.2.2 Workflow: Payments
• Step 1: User selects/creates the cashbook account to work with.
• Step 2: Select period and transaction date.
• Step 3: Choose entry type (supplier, GL, etc.):
o For supplier payment, select supplier account.
o For general ledger payment, select relevant GL account.
• Step 4: Input reference, description, amount, any discount, and project code (if enabled).
• Step 5: If paying an “Open Item” supplier, invoke matching screen for invoice allocation.
• Step 6: Repeat entries for batch.
• Step 7: Post/update batch to general ledger after review.
Accounting treatment:
• Bank (Asset) is credited when a payment is made.
• Payments posted debit supplier/GL account and credit bank.
2.2.3 Batch Processing and Updates
• All entries (payments/receipts) are initially captured in an unposted batch.
• System must support batch posting with the following options:
o Preview/edit batch
o Print batch
o Backup before update
o Post to GL, affecting balances and generating audit trails.
2.3 Entry Types, D/C Logic, and Account Access
• Each cashbook side (payments, receipts) must have distinct entry types tied to correct
D/C designation.
o Payments: DR by default (system handles banking leg automatically).
o Receipts: CR by default.
• Contra accounts (auto-generated): The “other leg” of the double entry is auto-created in
the background.
• Account Access Control:
o Entry types can be limited to customers, suppliers, GL, or allow any.
o Restricted access by user permissions.
2.4 Special Features and Configurations
• Reference Number Handling: System must allow auto-increment of references per
transaction, with options for always/never/once.
• Repeated Descriptions/Projects: System must support repeating description and/or
project fields for rapid batch entry.
• Settlement Discounts: Must permit entry of settlement discounts (pulled from
customer/supplier setup if configured).
• Tax Handling: Tax fields should be locked/grayed out where tax was already processed on
the source invoice.
2.5 Contra in Detail
• Detailed Contra Entries: When enabled, every cashbook entry must generate its own
contra, aiding detailed auditing.
• Summary Contra Entries: If not enabled, system may summarize contras in GL.
• Configurable at entry type/GL account level.
2.6 Import/Export of Batches
• Export batch: Users can export all entries (receipts/payments) in a batch (e.g., for backup
or transfer to another company).
• Delete batch: Users can delete unposted batches.
• Import batch: Users can import batches, mapping fields to the cashbook structure.
o Include error messages and validation on import (date, account match, values,
etc.).
o Allow for batch edits post-import before update.
2.7 Bank Reconciliation
• System must provide full support for bank reconciliation:
o Mark transactions as reconciled.
o Compare to imported or manually entered bank statement.
o Provide troubleshooting for mismatches and out-of-balance.
o Reversal of entries if errors are detected in posted entries.
2.8 Reporting & Audit Trail
• Audit Trail: Every batch update/post to GL leaves a full audit trail.
• Support export, print, and save of batch/reporting logs.
3. Frontend Requirements
3.1 User Interface
• Web/mobile-friendly screens for:
o List/create/select cashbooks
o Receipt and Payment entry (tabular batch entry grid)
o Batch review/edit screens
o Import/export batch dialogs
o Matching screens (for open item customers/suppliers)
o Bank reconciliation “wizard”
• Real-time validation (required fields, correct accounts, live bank balance calculation).
• Search/filter for past transactions by reference, date, value, description,
customer/supplier.
3.2 UX Considerations
• Rapid batch entry possible via keyboard (tab + arrow key navigation).
• Tooltips or help sections for each column (including D/C and expected debit/credit).
4. Step-by-Step Example
Capture a cashbook receipt for a customer (Open Item):
1. Select correct cashbook account.
2. Go to Receipts tab.
3. Set accounting period, input transaction date.
4. Select entry type “Customer Receipt.”
5. Select customer account (e.g., Kanika Enterprises, via code or description).
6. Enter reference number (auto-increments), description (“Payment for INV1234”), and
amount.
7. If customer is open item: matching dialog appears, allocate receipt to the relevant
invoice(s).
8. Input discount/project as appropriate.
9. (Repeat steps 4-8 for batch entries.)
10. Review/Edit batch, print or save for review.
11. Update/Post batch to General Ledger – system applies double-entry logic (debits bank,
credits customer).
12. Transaction reflected in both cashbook and customer ledger.
Similar workflow for payments, reversing debits/credits, and using supplier or GL accounts as
“contra.”
5. Technical/Backend Requirements
5.1 Database
• Structure to maintain cashbooks, entry types, unposted/posted batches, transactions,
open item matchings, reconciliations, user logs, audit trail.
• Each entry preserves:
o Cashbook_account, transaction_type (receipt/payment), reference, date, period,
amount, debit_account, credit_account, contra_id (where detailed).
• Full integrity checks on batch update/post.
5.2 Security
• User roles for entry, review, approval, and admin.
• Logging of all updates, batch posts, imports/exports, and reversals.
• Configuration of account access/control per user group.
5.3 Integration Points
• General Ledger
• Customers/Suppliers Master Data
• Tax modules
• Bank Statement imports for reconciliation
6. Accounting Standards
• All postings and processing must comply with GAAP/IAS double-entry standards.
• Retain lockout ability for closed periods.
7. Non-Functional Requirements
• Performance: Responsive data entry, batch posting within seconds for up to 10,000
transactions.
• Reliability: Data integrity checked before every post; restore on error.
• Auditability: Full audit logs for all entries/postings/edits.
8. Special Enhancements (from Demo Video and Additional Source)
• Batch Export/Import: Users can save cashbook and journal batches for later re-use or
transfer; import should allow for mapping and preview.
• Deletion: Unposted batches can be deleted directly in the interface, but this action is
logged and requires separate permission.
Summary Table: Debits & Credits by Transaction
Cashbook
Side
Transaction
Type
Debit
Account
Credit
Account
Notes
Receipts Customer
Payment
Bank Customer Open item allocation possible
Receipts GL Receipt Bank GL Account E.g. share capital, loan received
Payments Supplier
Payment
Supplier Bank Open item allocation possible
Payments GL Payment GL
Account
Bank E.g. accounting fees, business
expenses
Transfer Between
Cashbooks
Dest. Bank Source
Bank
Via cashbook transfer tool for
reconciliation