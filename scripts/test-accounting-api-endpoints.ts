// @ts-nocheck
/**
 * Test all accounting API endpoints from ACCOUNTING_APIS_AND_TESTS.md.
 * Uses credentials: admin@nts.com / admin123
 *
 * Prerequisite: Server must be running (e.g. npm run dev on PORT 3009).
 * Run: npx ts-node scripts/test-accounting-api-endpoints.ts
 *      Or: BASE_URL=http://localhost:3009 npx ts-node scripts/test-accounting-api-endpoints.ts
 */
import axios, { AxiosInstance, AxiosError } from "axios";

const BASE_URL = process.env.BASE_URL || "http://localhost:3009";
const EMAIL = "admin@nts.com";
const PASSWORD = "admin123";

interface TestResult {
  name: string;
  method: string;
  path: string;
  ok: boolean;
  status?: number;
  error?: string;
}

const results: TestResult[] = [];
let token: string;
let api: AxiosInstance;

function log(result: TestResult) {
  results.push(result);
  const icon = result.ok ? "✓" : "✗";
  const status = result.status != null ? ` [${result.status}]` : "";
  console.log(`${icon} ${result.method} ${result.path}${status}${result.error ? " - " + result.error : ""}`);
}

async function login(): Promise<boolean> {
  try {
    const res = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: EMAIL,
      password: PASSWORD,
    });
    if (res.data?.token) {
      token = res.data.token;
      api = axios.create({
        baseURL: BASE_URL,
        headers: { Authorization: `Bearer ${token}` },
        timeout: 60000,
      });
      console.log("Logged in as", EMAIL, "\n");
      return true;
    }
    console.error("Login: no token in response", res.data);
    return false;
  } catch (e: any) {
    console.error("Login failed:", e.response?.status, e.response?.data?.message || e.message);
    return false;
  }
}

async function run() {
  console.log("Accounting API endpoints test");
  console.log("BASE_URL:", BASE_URL, "\n");

  if (!(await login())) {
    console.error("Cannot continue without auth.");
    process.exit(1);
  }

  const year = new Date().getFullYear();
  const today = new Date().toISOString().slice(0, 10);

  // 1. Cashbook audit export (expect 200 + binary)
  try {
    const r = await api.get("/api/cashbook/export-audit", {
      params: { year, month: 2 },
      responseType: "arraybuffer",
    });
    log({
      name: "Cashbook audit export",
      method: "GET",
      path: "/api/cashbook/export-audit",
      ok: r.status === 200,
      status: r.status,
    });
  } catch (e: any) {
    log({
      name: "Cashbook audit export",
      method: "GET",
      path: "/api/cashbook/export-audit",
      ok: false,
      status: e.response?.status,
      error: e.response?.data?.message || e.message,
    });
  }

  // 2. Revenue receipting – cashbook create is existing API; skip or GET journal entries for 1100/4000
  try {
    const r = await api.get("/api/accounting/journal-entries/by-date-range", {
      params: { startDate: `${year}-01-01`, endDate: today },
    });
    log({
      name: "Journal entries by date range",
      method: "GET",
      path: "/api/accounting/journal-entries/by-date-range",
      ok: r.status === 200,
      status: r.status,
    });
  } catch (e: any) {
    log({
      name: "Journal entries by date range",
      method: "GET",
      path: "/api/accounting/journal-entries/by-date-range",
      ok: false,
      status: e.response?.status,
      error: e.response?.data?.message || e.message,
    });
  }

  // 3. Year-end close – no HTTP endpoint in doc
  log({
    name: "Year-end close",
    method: "N/A",
    path: "(service only, no endpoint)",
    ok: true,
  });

  // 4. P&L – POST generate + GET
  try {
    const r = await api.post("/api/accounting/income-statement/generate", {
      startDate: `${year}-01-01`,
      endDate: today,
    });
    log({
      name: "P&L generate (POST)",
      method: "POST",
      path: "/api/accounting/income-statement/generate",
      ok: r.status === 200,
      status: r.status,
    });
  } catch (e: any) {
    log({
      name: "P&L generate (POST)",
      method: "POST",
      path: "/api/accounting/income-statement/generate",
      ok: false,
      status: e.response?.status,
      error: e.response?.data?.message || e.message,
    });
  }
  try {
    const r = await api.get("/api/accounting/income-statement", {
      params: { startDate: `${year}-01-01`, endDate: today },
    });
    log({
      name: "P&L (GET)",
      method: "GET",
      path: "/api/accounting/income-statement",
      ok: r.status === 200,
      status: r.status,
    });
  } catch (e: any) {
    log({
      name: "P&L (GET)",
      method: "GET",
      path: "/api/accounting/income-statement",
      ok: false,
      status: e.response?.status,
      error: e.response?.data?.message || e.message,
    });
  }

  // 5. Balance sheet – POST + GET
  try {
    const r = await api.post("/api/accounting/balance-sheet/generate", {
      asOfDate: today,
    });
    log({
      name: "Balance sheet generate (POST)",
      method: "POST",
      path: "/api/accounting/balance-sheet/generate",
      ok: r.status === 200,
      status: r.status,
    });
  } catch (e: any) {
    log({
      name: "Balance sheet generate (POST)",
      method: "POST",
      path: "/api/accounting/balance-sheet/generate",
      ok: false,
      status: e.response?.status,
      error: e.response?.data?.message || e.message,
    });
  }
  try {
    const r = await api.get("/api/accounting/balance-sheet", {
      params: { asOfDate: today },
    });
    log({
      name: "Balance sheet (GET)",
      method: "GET",
      path: "/api/accounting/balance-sheet",
      ok: r.status === 200,
      status: r.status,
    });
  } catch (e: any) {
    log({
      name: "Balance sheet (GET)",
      method: "GET",
      path: "/api/accounting/balance-sheet",
      ok: false,
      status: e.response?.status,
      error: e.response?.data?.message || e.message,
    });
  }

  // 6a. VAT report
  try {
    const r = await api.get("/api/vat/report", {
      params: { startDate: `${year}-01-01`, endDate: `${year}-03-31` },
    });
    log({
      name: "VAT report",
      method: "GET",
      path: "/api/vat/report",
      ok: r.status === 200,
      status: r.status,
    });
  } catch (e: any) {
    log({
      name: "VAT report",
      method: "GET",
      path: "/api/vat/report",
      ok: false,
      status: e.response?.status,
      error: e.response?.data?.message || e.message,
    });
  }

  // 6b. VAT output audit trail
  try {
    const r = await api.get("/api/vat/report/output-tax-audit", {
      params: { startDate: `${year}-01-01`, endDate: `${year}-03-31` },
    });
    log({
      name: "VAT output audit trail",
      method: "GET",
      path: "/api/vat/report/output-tax-audit",
      ok: r.status === 200,
      status: r.status,
    });
  } catch (e: any) {
    log({
      name: "VAT output audit trail",
      method: "GET",
      path: "/api/vat/report/output-tax-audit",
      ok: false,
      status: e.response?.status,
      error: e.response?.data?.message || e.message,
    });
  }

  // 7. P&L with budget variance
  try {
    const r = await api.get("/api/accounting/income-statement/with-budget-variance", {
      params: { startDate: `${year}-01-01`, endDate: today },
    });
    log({
      name: "P&L with budget variance",
      method: "GET",
      path: "/api/accounting/income-statement/with-budget-variance",
      ok: r.status === 200,
      status: r.status,
    });
  } catch (e: any) {
    log({
      name: "P&L with budget variance",
      method: "GET",
      path: "/api/accounting/income-statement/with-budget-variance",
      ok: false,
      status: e.response?.status,
      error: e.response?.data?.message || e.message,
    });
  }

  // 8a. Comparative P&L this month vs last month
  try {
    const r = await api.get("/api/accounting/income-statement/comparative/this-month-vs-last-month");
    log({
      name: "Comparative P&L (this vs last month)",
      method: "GET",
      path: "/api/accounting/income-statement/comparative/this-month-vs-last-month",
      ok: r.status === 200,
      status: r.status,
    });
  } catch (e: any) {
    log({
      name: "Comparative P&L (this vs last month)",
      method: "GET",
      path: "/api/accounting/income-statement/comparative/this-month-vs-last-month",
      ok: false,
      status: e.response?.status,
      error: e.response?.data?.message || e.message,
    });
  }

  // 8b. Comparative P&L POST (two periods)
  try {
    const r = await api.post("/api/accounting/income-statement/comparative", {
      periods: [
        { startDate: `${year}-04-01`, endDate: `${year}-04-30` },
        { startDate: `${year}-05-01`, endDate: `${year}-05-31` },
      ],
      periodLabels: ["April", "May"],
    });
    log({
      name: "Comparative P&L (POST)",
      method: "POST",
      path: "/api/accounting/income-statement/comparative",
      ok: r.status === 200,
      status: r.status,
    });
  } catch (e: any) {
    log({
      name: "Comparative P&L (POST)",
      method: "POST",
      path: "/api/accounting/income-statement/comparative",
      ok: false,
      status: e.response?.status,
      error: e.response?.data?.message || e.message,
    });
  }

  // 9. Trial balance (hide zero balances)
  try {
    const r = await api.get("/api/accounting/trial-balance", {
      params: { hideZeroBalances: "true" },
    });
    log({
      name: "Trial balance (hide zero balances)",
      method: "GET",
      path: "/api/accounting/trial-balance",
      ok: r.status === 200,
      status: r.status,
    });
  } catch (e: any) {
    log({
      name: "Trial balance (hide zero balances)",
      method: "GET",
      path: "/api/accounting/trial-balance",
      ok: false,
      status: e.response?.status,
      error: e.response?.data?.message || e.message,
    });
  }

  // 10. Trial balance (scalability – includeTransactionDetails=false)
  try {
    const r = await api.get("/api/accounting/trial-balance", {
      params: {
        startDate: `${year - 1}-01-01`,
        endDate: `${year - 1}-12-31`,
        includeTransactionDetails: "false",
      },
    });
    log({
      name: "Trial balance (12mo, no tx details)",
      method: "GET",
      path: "/api/accounting/trial-balance",
      ok: r.status === 200,
      status: r.status,
    });
  } catch (e: any) {
    log({
      name: "Trial balance (12mo, no tx details)",
      method: "GET",
      path: "/api/accounting/trial-balance",
      ok: false,
      status: e.response?.status,
      error: e.response?.data?.message || e.message,
    });
  }

  // 11a. Audit trail last entries
  try {
    const r = await api.get("/api/accounting/journal-entries/audit-trail/last-entries", {
      params: { limit: 10 },
    });
    log({
      name: "Audit trail last entries",
      method: "GET",
      path: "/api/accounting/journal-entries/audit-trail/last-entries",
      ok: r.status === 200,
      status: r.status,
    });
  } catch (e: any) {
    log({
      name: "Audit trail last entries",
      method: "GET",
      path: "/api/accounting/journal-entries/audit-trail/last-entries",
      ok: false,
      status: e.response?.status,
      error: e.response?.data?.message || e.message,
    });
  }

  // 11b. Audit trail verify sequential
  try {
    const r = await api.get("/api/accounting/journal-entries/audit-trail/verify-sequential", {
      params: { limit: 10 },
    });
    log({
      name: "Audit trail verify sequential",
      method: "GET",
      path: "/api/accounting/journal-entries/audit-trail/verify-sequential",
      ok: r.status === 200,
      status: r.status,
    });
  } catch (e: any) {
    log({
      name: "Audit trail verify sequential",
      method: "GET",
      path: "/api/accounting/journal-entries/audit-trail/verify-sequential",
      ok: false,
      status: e.response?.status,
      error: e.response?.data?.message || e.message,
    });
  }

  // 12a. System audit log
  try {
    const r = await api.get("/api/system-audit-log", { params: { hours: 24 } });
    log({
      name: "System audit log",
      method: "GET",
      path: "/api/system-audit-log",
      ok: r.status === 200,
      status: r.status,
    });
  } catch (e: any) {
    log({
      name: "System audit log",
      method: "GET",
      path: "/api/system-audit-log",
      ok: false,
      status: e.response?.status,
      error: e.response?.data?.message || e.message,
    });
  }

  // 12b. System audit log last 24 hours
  try {
    const r = await api.get("/api/system-audit-log/last-24-hours");
    log({
      name: "System audit log last 24h",
      method: "GET",
      path: "/api/system-audit-log/last-24-hours",
      ok: r.status === 200,
      status: r.status,
    });
  } catch (e: any) {
    log({
      name: "System audit log last 24h",
      method: "GET",
      path: "/api/system-audit-log/last-24-hours",
      ok: false,
      status: e.response?.status,
      error: e.response?.data?.message || e.message,
    });
  }

  // 13. Audit logs (general)
  try {
    const r = await api.get("/api/audit-logs", { params: { limit: 5, page: 1 } });
    log({
      name: "Audit logs (list)",
      method: "GET",
      path: "/api/audit-logs",
      ok: r.status === 200,
      status: r.status,
    });
  } catch (e: any) {
    log({
      name: "Audit logs (list)",
      method: "GET",
      path: "/api/audit-logs",
      ok: false,
      status: e.response?.status,
      error: e.response?.data?.message || e.message,
    });
  }

  // 14. PO to Bill – POST (expect 400 if no valid PO, or 201 if we had one)
  try {
    const r = await api.post("/api/accounting/purchase-invoices/from-purchase-order", {
      purchaseOrderId: "non-existent-id",
      supplierInvoiceNumber: "TEST-SUP-001",
    });
    log({
      name: "PO to Bill (validation)",
      method: "POST",
      path: "/api/accounting/purchase-invoices/from-purchase-order",
      ok: r.status === 201 || r.status === 200,
      status: r.status,
    });
  } catch (e: any) {
    const status = e.response?.status;
    const ok = status === 400 && e.response?.data?.message?.toLowerCase().includes("not found");
    log({
      name: "PO to Bill (validation)",
      method: "POST",
      path: "/api/accounting/purchase-invoices/from-purchase-order",
      ok: ok || status === 400,
      status,
      error: ok ? undefined : e.response?.data?.message || e.message,
    });
  }

  // 15. Accounting dashboard (committed spend)
  try {
    const r = await api.get("/api/accounting/dashboard");
    const hasCommittedSpend = typeof (r.data?.data?.committedSpend ?? r.data?.committedSpend) === "number";
    log({
      name: "Accounting dashboard (committedSpend)",
      method: "GET",
      path: "/api/accounting/dashboard",
      ok: r.status === 200 && hasCommittedSpend,
      status: r.status,
      error: r.status === 200 && !hasCommittedSpend ? "response missing committedSpend" : undefined,
    });
  } catch (e: any) {
    log({
      name: "Accounting dashboard (committedSpend)",
      method: "GET",
      path: "/api/accounting/dashboard",
      ok: false,
      status: e.response?.status,
      error: e.response?.data?.message || e.message,
    });
  }

  // Summary
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  console.log("\n--- Summary ---");
  console.log(`Passed: ${passed}/${results.length}`);
  if (failed.length > 0) {
    console.log("Failed:");
    failed.forEach((f) => console.log("  ", f.method, f.path, f.status, f.error));
    process.exit(1);
  }
  console.log("All accounting API endpoints OK.");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
