# Investment Memo Editing — backend requirements

Design session: [`design-sessions/investment-memo-editing.md`](../design-sessions/investment-memo-editing.md)

**Status:** New module at `UNDER_BOARD_REVIEW` stage; integrates with board review Call to Vote.

---

## 1. Executive summary

Structured, versioned investment memos with validation, CIO approval, and audit history. Replaces one-shot IM file upload as the primary memo path.

| Item | Value |
|------|-------|
| Swagger tag | `Investment Memo Editing` |
| Base path | `/api/investment-memos/*` |

---

## 2. Workflow states

`DRAFT` → `SUBMITTED` → `APPROVED` | reject → `DRAFT` → `LOCKED` (on Call to Vote / board complete)

---

## 3. Required sections (validation on submit)

`executiveSummary`, `investmentThesis`, `marketOpportunity`, `companyOverview`, `financialAnalysis`, `risksAndMitigants`, `dealTerms`, `recommendation`

Optional: `overallScore`, `additionalInformation`

---

## 4. RBAC

| Action | Allowed |
|--------|---------|
| View | CIO, Fund Manager, assigned analyst, board voting roles, admin |
| Edit / submit | CIO, Fund Manager, assigned analyst |
| Approve / reject | CIO only |

---

## 5. Data model

- `investment_memos`
- `investment_memo_versions`
- `investment_memo_approval_events`

Migration: `npm run db:migrate:investment-memo-editing`

---

## 6. API specification

See design session §14. Board review `callToVote` requires memo `APPROVED`.

---

## 7. Integration

- [`BoardReviewService.callToVote`](../src/services/BoardReviewService.ts) gated on approved memo
- Legacy IM upload returns 409 with pointer to new module
- On approve: sync `board_reviews.recommendationReport`, `overallScore`

---

## 8. Testing

- `npm run uat:investment-memo:core`
- `npm run uat:investment-memo:rbac`
- `npm run uat:investment-memo:versions`
