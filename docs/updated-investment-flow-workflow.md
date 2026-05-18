Things to test in prod (1‑liners)
Suite 06: POST /procurement/suite06/intakes/:id/extract now works without re-uploading the PDF.

Error was: extract failed / required second PDF upload / missing fields.
Suite 06: GET /procurement/suite06/intakes + POST /procurement/suite06/intakes/:id/document are available and show in Swagger.

Error was: endpoints missing from Swagger / no intake list / no doc replace flow.
Suite 06: documentUrl download works even if stored URL had double /api/public-media/ and it self-heals on extract/read.

Error was: “Failed to download document. Status: 404”.
Procurement requisitions: admin users (no department) can access GET /procurement/requisitions.

Error was: “User is not assigned to any department”.
Pending approvals: admin users can access GET /procurement/requisitions/pending-approval across departments.

Error was: blocked by department/role checks.
Portfolio submit application: migration script updated to add board_voting_disabled on either users or legacy db_users.

Error was: Prisma column missing db_users.board_voting_disabled.
Performance rollup: GET /performance/rollup/:goalId no longer selects removed kpi.type.

Error was: Prisma “Unknown field type for select statement on model KPI”.
Procurement PO from quotation: PO numbers can align with quotation reference and PO APIs include quotation.quotationNumber.

Error was: PO looked unrelated to quotation / reference not visible.
PO email to vendor: sending PO now requires a letterhead PDF attachment (same branding pipeline).

Error was: PO email could be sent without PDF / without letterhead if rendering failed.
Quotation vs PO totals: vendor quotation VAT/totals now use same VAT logic as PO, and legacy quotes are corrected on accept/reject.

Error was: PO total ≠ quotation total (VAT applied only on PO).
Vendor invoice submit: procurement invoice dueDate can be in the future (only blocked if earlier than invoiceDate).

Error was: due date constrained to “today” in the submission flow (backend now allows future).
Procurement numbering: RFQ/REQ/PO/GRN numbers now follow accounting-style PREFIX_YYYYMMDD_0001 and won’t clash with INV_… / QUO_….

Error was: RFQ numbers used timestamp/random format, not the agreed format.