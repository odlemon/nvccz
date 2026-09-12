# Investment Memo Editing — frontend design session

This document is for **product and frontend implementation**. It describes the **structured Investment Memo editor** within the Portfolio deal workflow: section-based editing, validation, version history, CIO approval, and the gate before Call to Vote. Wire screens to [`docs/investment-memo-editing-backend-requirements.md`](../docs/investment-memo-editing-backend-requirements.md).

**Related:** Board review voting remains on `/api/board-reviews/*`; memo editing is **`/api/investment-memos/*`** (Swagger tag **Investment Memo Editing**).

---

## 1. Purpose and audience

### What this module is

At **`UNDER_BOARD_REVIEW`** stage (after term sheet signed), deal teams compose a **structured investment memorandum** in-app. Edits are workflow-controlled: draft → validate → submit → **CIO approve** → Call to Vote unlocks.

### Who uses it

| Role | Tasks |
|------|-------|
| Assigned analyst | Draft sections, save, submit for approval |
| Fund Manager | Same as analyst |
| CIO | Approve or reject submissions; unlocks Call to Vote |
| Board members | Read-only view of approved memo before voting |
| Admin | Full visibility |

### Permission matrix

| Action | Analyst / Fund Mgr | CIO | Board voter | Admin |
|--------|:------------------:|:---:|:-----------:|:-----:|
| View memo & versions | Yes | Yes | Yes | Yes |
| Edit draft | Yes | Yes | No | Yes |
| Submit for approval | Yes | Yes | No | No |
| Approve / reject | No | Yes | No | No |
| Call to Vote (separate screen) | — | Yes | — | Yes |

---

## 2. Design tokens

Reuse Portfolio / deal workflow shell: Noto Sans body, JetBrains Mono for amounts/scores, card panels `#151F32`, accent `#6366F1`.

---

## 3. Information architecture

| Area | Route suggestion |
|------|------------------|
| Memo editor | `/portfolio/applications/:id/memo` |
| Version history | `/portfolio/applications/:id/memo/versions` |
| Approval history | Side panel or tab on memo editor |

Call to Vote stays on existing board review application detail.

---

## 4. Memo editor workspace

```text
+------------------------------------------------------------------+
| Deal: VST-2026-000042  |  Stage: Board Review  |  Memo: v3 DRAFT |
+------------------------------------------------------------------+
| Sections          |  Executive summary                          |
| [x] Executive     |  [ rich text editor ]                       |
| [ ] Thesis        |                                             |
| [ ] Market        |  Validation (on Submit):                    |
| ...               |  [!] Financial analysis required            |
+------------------------------------------------------------------+
| [Save draft]  [Validate]  [Submit for CIO approval]              |
+------------------------------------------------------------------+
```

CIO view when `SUBMITTED`: Approve / Reject bar with comment field.

---

## 5. Version timeline

Immutable versions v1, v2, v3… with status badge (DRAFT / SUBMITTED / APPROVED / LOCKED). Compare read-only; no edit on locked versions.

---

## 6. Workflow UX

1. Analyst completes sections → **Submit** (validation must pass).
2. CIO **Approves** → status `APPROVED`; Call to Vote button enables on board review screen.
3. CIO **Rejects** → returns to `DRAFT` with comment; analyst edits and resubmits.
4. After Call to Vote → memo `LOCKED` (read-only).

---

## 7. Backend alignment

- Prefill `dealTerms` from signed term sheet when memo is provisioned.
- Optional PDF attachment per version (supplement to structured sections).
- Legacy `POST /board-reviews/.../investment-memorandum` deprecated — use this module.

---

## 14. API contract summary (frontend handoff)

| Item | Value |
|------|-------|
| **Swagger tag** | `Investment Memo Editing` |
| **Base path** | `/api/investment-memos/*` |
