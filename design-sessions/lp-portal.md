# Limited Partner Portal — frontend design session

This document is for **product and frontend implementation**. It describes **what Limited Partners and GP operators should see and do** in the Arcus **LP Portal**: consolidated dashboard, capital account ledger, document vault, performance reports, colleague access, and MFA. It intentionally **does not** list API routes or request bodies; wire screens to the backend contract in [`docs/lp-portal-backend-requirements.md`](../docs/lp-portal-backend-requirements.md).

**Related:** [Fund Performance Reporting](fund-performance-reporting.md) (GP compiles and emails reports; LP Portal consumes them).

---

## How to use this document

- Use in a **design session** with the frontend developer before or alongside backend implementation.
- **Backend alignment notes** separate LP Portal (this module) from Fund Performance Reporting (GP console).
- Acceptance criteria traceability: see [Section 10](#10-acceptance-criteria--frontend-mapping).

---

## 1. Purpose and audience

### What this module is

The **Arcus Limited Partner (LP) Portal** is the investor-facing window into capital balances, distributions, tax files, and performance metrics. It follows the Carta/Juniper Square model: **backend computes and caches snapshots**; the frontend renders dashboards instantly from cached data.

All backend APIs live under one Swagger module: **LP Portal**. Base path `/api/lp-portal/*`. See [Section 14](#14-api-contract-summary-frontend-handoff).

### Who uses it

| Role | Typical tasks |
|------|----------------|
| LP Viewer | Dashboard, ledger, vault download, performance reports — read-only |
| LP Institutional Manager | Above + invite/revoke colleague viewers for the organization |
| GP Fund Operations Manager | Publish vault documents, manage LP memberships, revoke access |
| System Administrator | MFA policy, full audit, platform configuration |

### Permission matrix (UI guards)

| Functional resource | LP Viewer | LP Manager | GP Ops | SysAdmin |
|-------------------|:---------:|:----------:|:------:|:--------:|
| View consolidated dashboard | Yes | Yes | Yes | Yes |
| Download shared reports/PDFs | Yes | Yes | Yes | Yes |
| Manage shared colleague access | — | Yes | — | Yes |
| Publish new statements/files | — | — | Yes | Yes |
| Revoke LP access keys | — | — | Yes | Yes |
| Configure global MFA policies | — | — | — | Yes |

---

## 2. Design tokens

| Token | Value | Usage |
|-------|-------|-------|
| Font (body) | **Noto Sans** | Labels, narrative copy |
| Font (numeric) | **JetBrains Mono** | Commitments, TVPI, ledger amounts |
| Workspace background | `#0B0F19` | App shell |
| Card panels | `#151F32` | Metrics cards, ledger, vault |
| Accent | `#6366F1` | Primary actions, active fund tab |
| Borders | `#1E293B` | Table dividers |

**Density:** High-density institutional layout — virtualized ledger when thousands of rows.

---

## 3. Information architecture

| Area | Route suggestion |
|------|------------------|
| Dashboard | `/lp-portal` |
| Capital ledger | `/lp-portal/ledger` |
| Document vault | `/lp-portal/vault` |
| Performance reports | `/lp-portal/reports` |
| Colleagues (manager) | `/lp-portal/colleagues` |
| MFA enrollment | `/lp-portal/settings/security` |

GP admin (internal): `/lp-portal/admin/*` screens or Finance → LP Administration.

---

## 4. Consolidated dashboard workspace

```text
+------------------------------------------------------------------------+
|  ARCUS CAPITAL    Active: Fund II Alpha (USD / ZIG)     [Currency toggle] |
+------------------------------------------------------------------------+
|  Total Commitment  | Total Paid-In   | Total Distributed              |
|  ZIG 1,280,000     | ZIG 960,000     | ZIG 320,000                    |
|  (USD 40k)         | (USD 30k)       | (USD 10k)                      |
+------------------------------------------------------------------------+
|  Net IRR: 18.4%    | TVPI: 1.45x     | DPI: 0.33x                     |
+------------------------------------------------------------------------+
```

- Fund selector when LP has multiple commitments.
- Currency toggle (USD / ZIG) triggers CSS fade on numeric cells — no full page reload.

---

## 5. Ledger and vault (split layout)

**Left — Capital account ledger**

- Columns: date, type (Call / Distribution), fund, currency, amount, base equivalent on transaction date.
- Row click → modal with bank confirmation + PDF download link.

**Right — Document vault**

- Categories: TAX, AUDIT, PERFORMANCE_REPORT, CALL_NOTICE, MANUAL.
- Search + filter; SHA-256 integrity tooltip on hover.

---

## 6. MFA UX

1. Login with email/password → if MFA required, show TOTP screen (pending token).
2. Enrollment: QR code + backup codes on first LP login when policy requires MFA.
3. On revocation: next API returns 401 → clear storage → login screen.

---

## 7. Backend alignment

| Data | Source |
|------|--------|
| Metrics (TVPI, DPI, IRR) | `lp_portal_metric_snapshots` + `LpFundMetricsService` |
| Ledger rows | Capital calls, allocation payments, distributions |
| Performance PDFs | Auto-synced from Fund Performance Reporting runs into vault |
| Tax/audit uploads | GP `POST /lp-portal/admin/documents` |
| Access | `lp_user_relations` (not raw `Client.userId` alone) |

---

## 10. Acceptance criteria — frontend mapping

| Story | UI element |
|-------|------------|
| Dashboard multi-currency | USD/ZIG toggle on metrics |
| Ledger US-3.2 | Filterable table + transaction modal |
| Vault US-3.3 | Searchable vault + SHA-256 badge |
| Colleague access | Manager-only colleagues screen |
| Revocation | 401 → forced logout |

---

## 14. API contract summary (frontend handoff)

| Item | Value |
|------|-------|
| **Swagger tag** | `LP Portal` |
| **Base path** | `/api/lp-portal/*` |
| **Auth** | Bearer JWT after MFA; LP Viewer / LP Manager roles |
| **MFA** | `POST /auth/mfa/verify` after login when required |

See [`docs/lp-portal-backend-requirements.md`](../docs/lp-portal-backend-requirements.md).
