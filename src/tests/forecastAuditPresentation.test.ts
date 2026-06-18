import {
  buildAuditPresentationSync,
  formatAuditMoney,
  formatAuditPeriod,
  FORECAST_AUDIT_ACTION_LABELS
} from "../utils/forecastAuditPresentation";

describe("forecastAuditPresentation", () => {
  test("formatAuditMoney", () => {
    expect(formatAuditMoney(250000, "USD")).toBe("250,000 USD");
    expect(formatAuditMoney(null)).toBeNull();
  });

  test("formatAuditPeriod", () => {
    expect(formatAuditPeriod("2026-11")).toBe("Nov 2026");
    expect(formatAuditPeriod("2026-11-30")).toBe("Nov 2026");
  });

  test("PORTFOLIO_DISPATCH with full payload", () => {
    const p = buildAuditPresentationSync("PORTFOLIO_DISPATCH", {
      portfolio_company_name: "Test Company",
      period_key: "2026-11",
      total_revenue: 250000,
      net_profit: 42000,
      report_title: "December 2026 Operational KPIs",
      tx_currency: "USD"
    });
    expect(p.action_label).toBe(FORECAST_AUDIT_ACTION_LABELS.PORTFOLIO_DISPATCH);
    expect(p.summary).toContain("Test Company");
    expect(p.summary).toContain("Nov 2026");
    expect(p.summary).toContain("250,000 USD");
    expect(p.actor_label).toBe("System");
  });

  test("PORTFOLIO_DISPATCH legacy payload falls back", () => {
    const p = buildAuditPresentationSync("PORTFOLIO_DISPATCH", {
      report_id: "r1",
      portfolio_company_id: "pc1"
    });
    expect(p.summary).toContain("Portfolio company");
  });

  test("CELL_EDIT before and after", () => {
    const p = buildAuditPresentationSync(
      "CELL_EDIT",
      {
        account_no: "4000",
        account_name: "Management Fees Income",
        period_key: "2026-12",
        before_value: 275000,
        after_value: 600000,
        tx_currency: "USD",
        is_manual_override: true
      },
      "Admin User"
    );
    expect(p.summary).toContain("4000 Management Fees Income");
    expect(p.summary).toContain("275,000 USD → 600,000 USD");
    expect(p.summary).toContain("manual override");
  });

  test("DRIVER_UPDATE CAGR driver", () => {
    const p = buildAuditPresentationSync("DRIVER_UPDATE", {
      driver_count: 1,
      drivers: [
        {
          driver_type: "CAGR_DRIVEN",
          target_account_range_start: 4000,
          target_account_range_end: 4999,
          parameters: { cagr_scalar: 0.08, historical_base: 250000, tx_currency: "USD" }
        }
      ]
    });
    expect(p.summary).toContain("CAGR growth");
    expect(p.summary).toContain("4000–4999");
    expect(p.summary).toContain("8.0%");
  });

  test("COMPUTE summaries", () => {
    const driver = buildAuditPresentationSync("COMPUTE", {
      edit_type: "DRIVER",
      affected_cell_count: 70
    });
    expect(driver.summary).toContain("70 forecast cells recalculated after driver change");

    const zeroCell = buildAuditPresentationSync("COMPUTE", {
      edit_type: "CELL",
      affected_cell_count: 0
    });
    expect(zeroCell.summary).toContain("no other cells changed");
    expect(zeroCell.summary).not.toContain("ms");
  });

  test("SCENARIO_PROMOTE", () => {
    const p = buildAuditPresentationSync("SCENARIO_PROMOTE", {
      from: "DRAFT",
      to: "ACTIVE"
    });
    expect(p.summary).toBe("Scenario activated: status DRAFT → ACTIVE");
  });
});
