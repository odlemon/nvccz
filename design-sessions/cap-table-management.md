# Cap Table Management — frontend design session

Wire screens to [`docs/cap-table-management-backend-requirements.md`](../docs/cap-table-management-backend-requirements.md).

**API:** `/api/cap-table/*` — Swagger tag **Cap Table Management**.

**Related:** Deal Execution Pack (Section 3.11) — integration is a **placeholder** until that module ships; cap table will auto-ingest SPA metadata when `CLOSED_EXECUTED`.

---

## 1. Purpose

The **Arcus Capitalisation Table** is the legal ownership register for portfolio investees: share classes, ESOP pools, convertible notes, immutable transaction ledger, dilution sandbox, and exit waterfall modeling. Executed issuances post to the Accounting GL and generate tamper-evident stock certificates.

### Who uses it

| Role | Tasks |
|------|-------|
| Corporate Secretary | Draft/submit issuances and transfers |
| Legal Counsel / Admin | Configure share classes, ESOP, authorized shares |
| Fund Manager / CIO | View register, run dilution sandbox, approve transactions |
| CFO | Approve/execute transactions; verify GL postings |
| Investee CEO (read-only) | View own company register |
| Board viewers | Read-only consolidated ownership |

### Permission matrix

| Action | Fund Mgr / Analyst | Legal / Admin | Corp Secretary | CIO / CFO | Investee |
|--------|:------------------:|:-------------:|:--------------:|:---------:|:--------:|
| View register & simulator | Yes | Yes | Yes | Yes | Own co. |
| Configure share classes | — | Yes | — | — | — |
| Create/submit transactions | — | Yes | Yes | — | — |
| Approve / execute | — | Admin | — | Yes | — |
| Waterfall evaluate | Yes | Yes | Yes | Yes | — |

---

## 2. Design tokens

| Token | Value | Usage |
|-------|-------|-------|
| Font (body) | **Noto Sans** | Labels, stakeholder names |
| Font (numeric) | **JetBrains Mono** | Share counts, % FD, proceeds |
| Workspace background | `#0B0F19` | App shell |
| Card panels | `#151F32` | Register table, simulator |
| Accent | `#6366F1` | Primary actions, active class row |
| Positive delta | `#10B981` | Dilution improvement badges |

---

## 3. Information architecture

| Area | Route suggestion |
|------|------------------|
| Cap table workspace | `/portfolio/companies/:portfolioCompanyId/cap-table` |
| Share class config | `…/cap-table/classes` |
| Transaction ledger | `…/cap-table/transactions` |
| Dilution simulator | `…/cap-table/simulator` (right pane) |
| Waterfall tool | `…/cap-table/waterfall` |
| Certificate download | From transaction detail drawer |

---

## 4. Desktop workspace wireframe

```text
+----------------------------------------------------------------------+
| [ARCUS CAP TABLE]    Alpha Software Ltd   | Cur: USD | FD: 11.5M   |
+----------------------------------------------------------------------+
| [Consolidated Cap Table Register]                                    |
| Class                | Authorized | Issued     | Diluted % | Status |
| Series Seed Pref.    | 3,000,000  | 2,500,000  | 21.74%    | ACTIVE |
| Common Stock         | 10,000,000 | 7,500,000  | 65.22%    | ACTIVE |
| 2025 ESOP Pool       | 2,000,000  | 1,500,000  | 13.04%    | ACTIVE |
+----------------------------------------------------------------------+
| [Stakeholder Ownership]          | [Dilution Simulator — sandbox]   |
| Name           | Shares | % FD  | Pre-Money: [ $10,000,000 ]         |
| Old Mutual     | 2.5M   | 21.74%| Round Size: [ $2,500,000  ]        |
| Founders       | 5.0M   | 43.48%| ESOP Top-up: [ 10% ]               |
| Employees      | 1.5M   | 13.04%| [Run Dilution Sandbox]             |
+----------------------------------------------------------------------+
```

---

## 5. Micro-interactions

- **Dilution slider:** Adjusting pre-money or round size updates stakeholder % FD in real time (client calls `POST /simulator/run`; no DB writes).
- **Certificate checksum hover:** Transaction badge tooltip shows SHA-256; click downloads PDF.
- **Insufficient transfer:** Seller row highlights red when transfer quantity exceeds balance.

---

## 6. API handoff

| Item | Value |
|------|-------|
| Swagger tag | `Cap Table Management` |
| Base path | `/api/cap-table/*` |
| Bootstrap | `POST /cap-table/registries` with `portfolioCompanyId` |
| Register | `GET /cap-table/registries/:portfolioCompanyId/register` |
| Simulator | `POST /cap-table/registries/:portfolioCompanyId/simulator/run` |

See backend requirements for full endpoint list and RBAC.
