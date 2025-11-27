# Procurement & Finance Test Users

All users share the password: `TestPass123!`.

## Finance Department

- **finance.manager@testnvccz.com** (`FIN_MGR`, `departmentRole: HEAD`)
  - Approvals: Finance requisitions & invoices (Step 2 in Finance flow)
  - Tests: submit/approve requisitions, review invoices, ensure finance config steps trigger.

- **finance.accountant@testnvccz.com** (`ACCOUNTANT`, `departmentRole: MEMBER`)
  - Approvals: Finance invoices (Step 1 in finance flow)
  - Tests: verify invoice approval route, check notifications, ensure audit log entries.

## Procurement Department

- **proc.manager@testnvccz.com** (`PROC_MGR`, `departmentRole: HEAD`)
  - Approvals: Procurement requisitions, invoices, RFQ stages when roleCode included.
  - Tests: create requisitions, approve them, accept RFQs, process invoicing/purchase orders.

- **proc.officer@testnvccz.com** (`PROC_OFF`, `departmentRole: DEPUTY`)
  - Approvals: Same as manager (backup approver).
  - Tests: confirm deputy can approve requisitions when manager is not involved.

- **proc.buyer@testnvccz.com** (`BUYER`, `departmentRole: MEMBER`)
  - Capabilities: create requisitions/RFQs/invoices; approvals depend on config roleCode.
  - Tests: submit requisitions/invoices, trigger payroll flows, validate role-based steps.

- **proc.coordinator@testnvccz.com** (`PROC_COORD`, `departmentRole: MEMBER`)
  - Capabilities: create orders/invoices, coordinate approvals.
  - Tests: confirm config steps that mention `PROC_COORD` run correctly.

- **proc.member@testnvccz.com** (`PROC_MEM`, `departmentRole: MEMBER`)
  - Capabilities: general procurement tasks (no approvals unless config references `PROC_MEM`).
  - Tests: generate requisitions/RFQs and ensure approvals get routed (should fail if not matching).

## Suggested Test Flow

1. **Finance requisitions**
   - Log in as `finance.manager@testnvccz.com`, create requisition, submit, ensure approval steps run.
2. **Finance invoices**
   - Submit invoice, approve as `finance.accountant` then `finance.manager`, watch accounting entries.
3. **Procurement requisition + RFQ**
   - Use `proc.member` to create requisition, submit, approve via `proc.manager`/`proc.officer`.
4. **Procurement invoice**
   - Create invoice as `proc.buyer`, route approvals per config (`PROC_MGR`, `PROC_COORD` if configured).
5. **Role coverage**
   - Ensure every role used in your approval config can reach its stage (`PROC_MGR`, `PROC_COORD`, `BUYER`, etc.).

## RFQ Vendors

- **Logix Vine Supplies** (`logixvine@gmail.com`)
  - Target vendor for RFQs that supply general office/IT items.
  - Receives the formatted RFQ email with item table, deadline, and links to submit.
  - Re-run `node scripts/setup-rfq-vendors.js` if you ever need to recreate the vendor/user record.

- **Vexima Games Ltd** (`veximagames@gmail.com`)
  - Use for testing gaming/performance hardware RFQ flows.
  - Same RFQ email behavior as above; the action button opens the vendor quote form and the email also spells out the `POST /vendor-quotations/submit` API call that vendors can hit directly.

When you create the RFQ, those two vendors will automatically receive the styled email with the item table plus the frontend link or API instructions they can use to submit their quote.



