# Tax Return Pack — frontend design session

Wire screens to [`docs/tax-return-pack-backend-requirements.md`](../docs/tax-return-pack-backend-requirements.md).

**API:** `/api/tax-return-packs/*` — Swagger tag **Tax Return Pack**.

**Related:** [Forecasting Engine](forecasting-engine.md) (`ForecastEntity`), [LP Portal](lp-portal.md), Accounting GL.

---

## 1. Purpose

ZIMRA corporate tax compliance workspace: ITF 12C income reconciliation, CGT indexation schedules, dual-currency splits, maker-checker sign-off, SHA-256 PDF locking, GL accrual, LP portal publish.

### Who uses it

| Role | Tasks |
|------|-------|
| Operations Tax Manager | Initialize pack, force GL sync |
| Institutional Tax Accountant | Review adjustments, reclassify tax codes |
| CFO (Checker) | Final sign-off, lock pack |
| Compliance | Audit trail review |

---

## 2. Design tokens (SRD §6.1)

| Token | Value |
|-------|-------|
| Numeric columns | **JetBrains Mono** |
| Panel background | `#0B0F19` |
| Card panels | `#151F32` |
| Approved / Signed | `#10B981` |
| Pending / Review | `#F59E0B` |

---

## 3. Desktop tax workspace (§6.2)

```text
+---------------------------------------------------------------------------------+
| [ARCUS TAX]   Company: Alpha Software Ltd | Period: ANNUAL 2025 | USD/ZiG       |
+---------------------------------------------------------------------------------+
| Status: DRAFT_REVIEW | Compiled: T. Ndlovu | Approved: Pending                  |
+---------------------------------------------------------------------------------+
| [Left: Taxable Income Reconciliation] | [Right: Net CGT Schedules]            |
| Account Line          GL Bal   Tax Adjust  | Asset    Sale Price  Cost basis Tax|
| Net Income (Book)     $1.2M    --          | SharesA  $500,000    $350,000  20% |
| Entertainment Ex      $45,000  +$45,000    | Property $250,000    $120,000  20% |
+---------------------------------------------------------------------------------+
| [Approve & Lock Tax Pack] | [Download Draft PDF] | [Force GL Sync]                |
+---------------------------------------------------------------------------------+
```

---

## 4. Micro-interactions

- **Adjustment drilldown:** Hover shows underlying GL refs; double-click opens tax category override (`PATCH …/reconciliation/:lineId`).
- **Real-time recalc:** Override triggers liability + ETR refresh on dashboard.
