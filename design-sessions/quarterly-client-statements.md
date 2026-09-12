# Quarterly Client Statements — frontend design session

Wire screens to [`docs/quarterly-client-statements-backend-requirements.md`](../docs/quarterly-client-statements-backend-requirements.md).

**API:** `/api/quarterly-statements/*` — Swagger tag **Quarterly Client Statements**.

**Related:** [LP Portal](lp-portal.md), [Fund Performance Reporting](fund-performance-reporting.md).

---

## 1. Purpose

GP workspace to compile, review, approve, and publish institutional quarterly LP statements with dual-currency metrics and tamper-evident PDFs.

### Who uses it

| Role | Tasks |
|------|-------|
| Investor Relations | Initiate batch, compile, submit for review |
| Fund Accountant | Verify ratios, recompute selected LP |
| Executive Partner / CFO | Checker approve & publish to LP Portal |
| LP (read-only) | Vault download via LP Portal |

---

## 2. Design tokens

| Token | Value |
|-------|-------|
| Body | **Noto Sans** |
| Numeric columns | **JetBrains Mono** |
| Panel background | `#0B0F19` |
| Card panels | `#151F32` |
| Completed | `#10B981` |
| Review | `#F59E0B` |

---

## 3. Workspace wireframe

```text
+------------------------------------------------------------------------+
| [ARCUS REPORTING] Batch: Q1-2026 (Seed Fund II) | Status: REVIEW       |
+------------------------------------------------------------------------+
| Total Commitment: $15.0M | Total Called: $11.25M | Reconciled: YES     |
+------------------------------------------------------------------------+
| [Left: LP list]              | [Right: Statement preview]               |
| LP-0912 Old Mutual  0.3333   | Total Committed: $1,500,000.00           |
| LP-0913 IFC Africa  0.2500   | Net IRR: 14.82% | TVPI: 1.3500x         |
+------------------------------------------------------------------------+
| [Approve & Publish Batch] | [Download Zip]                              |
+------------------------------------------------------------------------+
```

**Dual-currency hover:** USD value tooltip shows ZiG at historical tx rates.

---

## 4. API handoff

| Item | Value |
|------|-------|
| Swagger tag | `Quarterly Client Statements` |
| Init run | `POST /quarterly-statements/runs` |
| Compile | `POST /quarterly-statements/runs/:runId/compile` |
| Approve | `POST /quarterly-statements/runs/:runId/approve` |
