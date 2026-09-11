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

  // Owns sourcing end to end, including award; does not pay invoices.
  "Procurement Manager": [
    P.dashboardView,
    P.requisitionsViewAll,
    P.rfqView, P.rfqManage, P.rfqAward,
    P.quotationsView, P.quotationsManage,
    P.ordersView, P.ordersManage, P.ordersSend,
    P.receivingView, P.receivingManage, P.receivingApprove,
    P.invoicesView,
    P.vendorsView, P.vendorsManage, P.vendorsApprove, P.vendorBanksView,
    P.intakeView,
    P.auditView,
  ],

  // Runs RFQs and raises and sends POs; cannot award or approve receipts.
  "Procurement Officer": [
    P.dashboardView,
    P.requisitionsViewAll,
    P.rfqView, P.rfqManage,
    P.quotationsView, P.quotationsManage,
    P.ordersView, P.ordersManage, P.ordersSend,
    P.receivingView, P.receivingManage,
    P.invoicesView,
    P.vendorsView, P.vendorsManage,
    P.intakeView,
  ],

  Buyer: [
    P.dashboardView,
    P.requisitionsViewAll,
    P.rfqView, P.rfqManage,
    P.quotationsView, P.quotationsManage,
    P.ordersView,
    P.receivingView, P.receivingManage,
    P.invoicesView,
    P.vendorsView,
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
  ],

  "Procurement Member": [P.dashboardView, P.rfqView, P.ordersView, P.receivingView, P.vendorsView],

  // Accounts payable: capture and pay; cannot approve what it pays.
  Accountant: [
    P.dashboardView,
    P.ordersView, P.receivingView,
    P.invoicesView, P.invoicesPay,
    P.vendorsView, P.vendorBanksView,
    P.intakeView, P.intakeManage,
  ],
  "Finance Officer": [
    P.dashboardView,
    P.ordersView, P.receivingView,
    P.invoicesView, P.invoicesPay,
    P.vendorsView, P.vendorBanksView,
    P.intakeView, P.intakeManage,
  ],

  // Approves invoices and owns vendor bank details; does not pay.
  "Finance Manager": [...ALL_VIEW, P.invoicesApprove, P.vendorsApprove, P.vendorBanksView, P.vendorBanksManage],
  "Chief Financial Officer": [...ALL_VIEW, P.invoicesApprove, P.rfqAward, P.vendorsApprove, P.vendorBanksView],
  CEO: [...ALL_VIEW, P.rfqAward],

  "Internal Auditor": [...ALL_VIEW, P.vendorBanksView],
}
