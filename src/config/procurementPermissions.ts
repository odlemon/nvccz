/**
 * Procurement permission catalogue and default role grants.
 *
 * Naming follows the house convention already used by payroll and performance:
 *   <module>.<area>.<action>
 *
 * IMPORTANT (code + data coupling): a guard does nothing on its own. Roles carry their
 * grants in `Role.permissions` (a JSON array of {name,value}); a guard shipped without the
 * matching grant 403s every request. Run `npm run db:migrate:procurement-permissions` after
 * changing this file.
 *
 * Deliberately NOT behind a permission — only behind requireInternalStaffUser():
 *  - raising, editing, submitting and listing your OWN purchase requisitions. Every employee
 *    requests purchases (SRD §3 "Purchase Requisition"), so this cannot hinge on a
 *    procurement role;
 *  - approving or rejecting a requisition. Who may decide a given requisition is settled per
 *    record by the approval engine (a configured stage roleCode, or the requester's
 *    department HEAD/DEPUTY), which a role-wide grant would contradict.
 *
 * Segregation of duties in the defaults below:
 *  - running an RFQ (`rfq.manage`) and awarding it (`rfq.award`) are separate grants;
 *  - approving an invoice (`invoices.approve`) and recording its payment (`invoices.pay`)
 *    are never held by the same non-administrator role;
 *  - vendor bank details — the field a payment-redirection fraud changes — are managed by
 *    finance, not by the procurement desk that onboards the vendor.
 *
 * These are defaults, not policy sign-off. They are adjustable per role in Admin → Roles.
 */

export const PROCUREMENT_PERMISSIONS = {
  dashboardView: "procurement.dashboard.view",

  /** Every requisition, not just your own (your own needs no grant). */
  requisitionsViewAll: "procurement.requisitions.view",

  rfqView: "procurement.rfq.view",
  rfqManage: "procurement.rfq.manage",
  rfqAward: "procurement.rfq.award",

  quotationsView: "procurement.quotations.view",
  quotationsManage: "procurement.quotations.manage",
  /** Capturing a quotation received through an approved alternative channel, on the supplier's behalf. */
  quotationsCapture: "procurement.quotations.capture",
  /** Formally opening sealed bids after the closing deadline (§16). */
  bidsOpen: "procurement.bids.open",

  ordersView: "procurement.orders.view",
  ordersManage: "procurement.orders.manage",
  /** Dispatching a PO to the vendor is the point the organisation is committed. */
  ordersSend: "procurement.orders.send",

  receivingView: "procurement.receiving.view",
  receivingManage: "procurement.receiving.manage",
  receivingApprove: "procurement.receiving.approve",

  invoicesView: "procurement.invoices.view",
  invoicesApprove: "procurement.invoices.approve",
  invoicesPay: "procurement.invoices.pay",
  /** Using the optional AI layer to read documents (§29). Whether AI is on, and for whom, is an organisation setting on top of this. */
  aiUse: "procurement.ai.use",
  /** Approving an invoice over open three-way match exceptions, with a recorded reason (§24). */
  invoicesOverrideMatch: "procurement.invoices.override_match",

  vendorsView: "procurement.vendors.view",
  vendorsManage: "procurement.vendors.manage",
  /** Approving self-registrations, blacklisting and reinstating. */
  vendorsApprove: "procurement.vendors.approve",
  vendorBanksView: "procurement.vendors.banks.view",
  vendorBanksManage: "procurement.vendors.banks.manage",

  intakeView: "procurement.intake.view",
  intakeManage: "procurement.intake.manage",

  /** The procurement audit trail: who did what to which requisition, RFQ, order, receipt or invoice. */
  auditView: "procurement.audit.view",

  /** Annual procurement plans and their lines; approving a plan is separate from drafting one. */
  plansView: "procurement.plans.view",
  plansManage: "procurement.plans.manage",
  plansApprove: "procurement.plans.approve",

  /** Contracts register: agreements that follow an award. */
  contractsView: "procurement.contracts.view",
  contractsManage: "procurement.contracts.manage",

  /** Procurement document vault: tender packs, contracts, vendor submissions, evidence. */
  documentsView: "procurement.documents.view",
  documentsManage: "procurement.documents.manage",

  /** The procurement reports (§37) and their PDF / CSV / XLSX exports; exporting is granted separately from reading. */
  reportsView: "procurement.reports.view",
  reportsExport: "procurement.reports.export",
  /** The executive dashboard (§35): organisation-wide spend, concentration and exceptions. */
  dashboardExecutive: "procurement.dashboard.executive",
} as const

export type ProcurementPermission =
  (typeof PROCUREMENT_PERMISSIONS)[keyof typeof PROCUREMENT_PERMISSIONS]

export const ALL_PROCUREMENT_PERMISSIONS: string[] = Object.values(PROCUREMENT_PERMISSIONS)

const P = PROCUREMENT_PERMISSIONS

/** Read access to every register. Bank details are excluded; they are granted by name. */
const ALL_VIEW: string[] = ALL_PROCUREMENT_PERMISSIONS.filter(
  (n) => n.endsWith(".view") && n !== P.vendorBanksView,
)

/**
 * Default grants per role NAME (matched case-insensitively against `Role.name`). Roles
 * absent from this map are left untouched by the migration, so hand-tuned grants elsewhere
 * are never clobbered.
 */
export const PROCUREMENT_ROLE_GRANTS: Record<string, string[]> = {
  "System Administrator": ALL_PROCUREMENT_PERMISSIONS,
  admin: ALL_PROCUREMENT_PERMISSIONS,

  // Owns sourcing end to end, including award; drafts the plan but does not approve it; does not pay invoices.
  "Procurement Manager": [
    P.dashboardView,
    P.requisitionsViewAll,
    P.rfqView, P.rfqManage, P.rfqAward,
    P.quotationsView, P.quotationsManage, P.quotationsCapture, P.bidsOpen,
    P.ordersView, P.ordersManage, P.ordersSend,
    P.receivingView, P.receivingManage, P.receivingApprove,
    P.invoicesView, P.aiUse,
    P.vendorsView, P.vendorsManage, P.vendorsApprove, P.vendorBanksView,
    P.intakeView,
    P.auditView,
    P.plansView, P.plansManage,
    P.contractsView, P.contractsManage,
    P.documentsView, P.documentsManage,
    P.reportsView, P.reportsExport,
  ],

  // Runs RFQs and raises and sends POs; cannot award or approve receipts.
  "Procurement Officer": [
    P.dashboardView,
    P.requisitionsViewAll,
    P.rfqView, P.rfqManage,
    P.quotationsView, P.quotationsManage, P.quotationsCapture,
    P.ordersView, P.ordersManage, P.ordersSend,
    P.receivingView, P.receivingManage,
    P.invoicesView, P.aiUse,
    P.vendorsView, P.vendorsManage,
    P.intakeView,
    P.plansView, P.plansManage,
    P.contractsView, P.contractsManage,
    P.documentsView, P.documentsManage,
    P.reportsView,
  ],

  Buyer: [
    P.dashboardView,
    P.requisitionsViewAll,
    P.rfqView, P.rfqManage,
    P.quotationsView, P.quotationsManage, P.quotationsCapture,
    P.ordersView,
    P.receivingView, P.receivingManage,
    P.invoicesView,
    P.vendorsView,
    P.plansView,
    P.contractsView,
    P.documentsView, P.documentsManage,
  ],

  "Procurement Coordinator": [
    P.dashboardView,
    P.requisitionsViewAll,
    P.rfqView,
    P.quotationsView,
    P.ordersView,
    P.receivingView, P.receivingManage,
    P.invoicesView,
    P.vendorsView,
    P.plansView,
    P.contractsView,
    P.documentsView, P.documentsManage,
  ],

  "Procurement Member": [P.dashboardView, P.rfqView, P.ordersView, P.receivingView, P.vendorsView, P.plansView, P.documentsView],

  // Accounts payable: capture and pay; cannot approve what it pays.
  Accountant: [
    P.dashboardView,
    P.ordersView, P.receivingView,
    P.invoicesView, P.invoicesPay, P.aiUse,
    P.vendorsView, P.vendorBanksView,
    P.intakeView, P.intakeManage,
    P.contractsView,
    P.documentsView,
  ],
  "Finance Officer": [
    P.dashboardView,
    P.ordersView, P.receivingView,
    P.invoicesView, P.invoicesPay, P.aiUse,
    P.vendorsView, P.vendorBanksView,
    P.intakeView, P.intakeManage,
    P.contractsView,
    P.documentsView,
  ],

  // Approves invoices and the procurement plan's budget, and owns vendor bank details; does not pay.
  "Finance Manager": [...ALL_VIEW, P.reportsExport, P.aiUse, P.invoicesApprove, P.invoicesOverrideMatch, P.vendorsApprove, P.vendorBanksView, P.vendorBanksManage, P.plansApprove],
  "Chief Financial Officer": [...ALL_VIEW, P.reportsExport, P.dashboardExecutive, P.aiUse, P.invoicesApprove, P.invoicesOverrideMatch, P.rfqAward, P.vendorsApprove, P.vendorBanksView, P.plansApprove],
  CEO: [...ALL_VIEW, P.reportsExport, P.dashboardExecutive, P.rfqAward, P.plansApprove],
  // The board reads the executive picture and the reports; it does not browse registers or the audit trail.
  "Board Chairman": [P.dashboardView, P.reportsView, P.dashboardExecutive],
  "Board Member": [P.dashboardView, P.reportsView, P.dashboardExecutive],

  "Internal Auditor": [...ALL_VIEW, P.reportsExport, P.vendorBanksView],
}
