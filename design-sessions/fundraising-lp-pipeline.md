# Fundraising LP Pipeline — frontend design session

Wire screens to [`docs/fundraising-lp-pipeline-backend-requirements.md`](../docs/fundraising-lp-pipeline-backend-requirements.md).

**API:** `/api/fundraising/*` — Swagger tag **Fundraising LP Pipeline**.

**Related:** [LP Portal](lp-portal.md) (post-close investor UX), [Fund Performance Reporting](fund-performance-reporting.md).

---

## 1. Purpose

GP-facing **fundraising command center**: campaigns, Kanban LP pipeline, outreach mailers, interaction history, subscription agreement upload (term-sheet style), and automated LP provisioning on close.

### Who uses it

| Role | Tasks |
|------|-------|
| Managing Partner | Create campaigns, set targets |
| Investor Relations | Kanban, mailers, interaction logs |
| Fundraising Associate | Log calls/meetings, move deals |
| CCO / Compliance | Verify KYC checklist, agreement upload |
| Admin | Full access |

---

## 2. Design tokens

| Token | Value |
|-------|-------|
| Body | **Noto Sans** |
| Numeric rows | **Roboto Mono** / JetBrains Mono |
| Board background | `#0D1117` |
| Column containers | `#161B22` |
| Deal cards | `#21262D` |
| Accent | `#6366F1` |
| High priority border | `#EF4444` |

---

## 3. Kanban wireframe

```text
+------------------------------------------------------------------------+
| [ARCUS] Campaign: African Tech Fund III (Target: $5,000,000 USD)       |
| Progress: [          ] 24% | Won: $1.2M | Remaining: $3.8M | 45d Left |
+------------------------------------------------------------------------+
| [Prospect]     | [Engaged]      | [Due Diligence] | [Won/Signed]      |
| Count: 5 $1M   | Count: 3 $1M   | Count: 2 $750k  | Count: 2          |
| Old Mutual     | Standard Ch.   | Delta Corp      | IFC Africa        |
| [Checklist 2/4]| [Checklist 1/3]| [Checklist 5/5] | [Signed]          |
+------------------------------------------------------------------------+
```

**Currency toggle:** converts card values USD ↔ ZIG using synced rate (smooth fade).

**Checklist hover:** tooltip with pending items; toggle complete inline.

---

## 4. API handoff

| Item | Value |
|------|-------|
| Swagger tag | `Fundraising LP Pipeline` |
| Base path | `/api/fundraising/*` |
| Board | `GET /fundraising/campaigns/:campaignId/board` |
| Move deal | `PATCH /fundraising/deals/:dealId/stage` |
| Metrics | `GET /fundraising/campaigns/:campaignId/metrics?presentationCurrency=USD` |
