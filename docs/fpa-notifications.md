# FP&A module — user notifications

All **user-facing** notifications in `/api/v1/fpa` today. Each sends:

1. **In-app** `notification` row (`type` below)
2. **Email** (dedicated template or lifecycle template)
3. **Realtime** socket event `notification_created` (where recipients were collected)

Actor who triggered the action is usually **excluded** (`excludeUserId`).

There are **no** user notifications for model setup, worksheet cell edits, drivers, formulas, variance, or exports — those are audit-only.

---

## Delivery channels

| Channel | How |
|---------|-----|
| In-app | `prisma.notification.create` |
| Email | `EmailNotificationService.sendBudgetOwnerAssignedEmail` or `sendFpaBudgetLifecycleEmail` |
| Realtime | `emitToUsers(..., "notification_created", { type, cycleId, path })` |

Deep link path: `/fpa/budgeting/{cycleId}` (via `FRONTEND_URL`).

---

## 1. Owner assignment

| `type` | Trigger | Recipients | Title / gist |
|--------|---------|------------|--------------|
| `BUDGET_OWNER_ASSIGNED` | `POST …/open` · `PUT …/owners` · create with owners that notify on assign | Each owner with `assigneeId` (per department) | “Budget owner assignment” — you were assigned for cycle (+ department) |

Email: **`sendBudgetOwnerAssignedEmail`** (cycle name, FY, department, task title, due date).

---

## 2. Cycle workflow (submit → approve → lock → board pack)

| `type` | Trigger | Recipients | Title / gist |
|--------|---------|------------|--------------|
| `BUDGET_SUBMITTED_FOR_REVIEW` | `POST …/submit-fpa` | FP&A managers + CFO | “Budget submitted for review” |
| `BUDGET_PENDING_CFO_REVIEW` | `POST …/fpa-accept` | CFO users | “Budget awaiting CFO approval” |
| `BUDGET_RETURNED_FOR_CORRECTION` | `POST …/fpa-return` · `POST …/cfo-return` | Affected budget owners (all or selected departments) | “Budget returned for correction” + feedback comment |
| `BUDGET_CFO_APPROVED` | `POST …/cfo-approve` | Owners + FP&A managers + cycle creator | “Budget approved by CFO” |
| `BUDGET_CYCLE_LOCKED` | `POST …/lock` | Owners + cycle creator | “Budget cycle locked” |
| `BUDGET_BOARD_PACK_READY` | `POST …/board-pack` (success) | Owners + CFO + cycle creator | “Board pack ready” (+ download URL when present) |

Email: **`sendFpaBudgetLifecycleEmail`** for all of the above.

---

## 3. Planning tasks (owner sheet)

Mapped from workflow task events → budget notification types:

| Internal event | `type` (stored) | Trigger | Recipients | Title / gist |
|----------------|-----------------|---------|------------|--------------|
| `TASK_SUBMITTED` | `BUDGET_TASK_SUBMITTED` | `POST /tasks/{id}/submit` | FP&A managers + CFO | “Budget task submitted” |
| `TASK_REASSIGNED` | `BUDGET_TASK_ASSIGNED` | `POST /tasks/{id}/reassign` | New assignee | “Budget task assigned” |
| `TASK_RETURNED` | `BUDGET_TASK_RETURNED` | `POST /tasks/{id}/return` | Task assignee | “Budget task returned” |
| `TASK_APPROVED` | `BUDGET_TASK_APPROVED` | `POST /tasks/{id}/approve` | Task assignee | “Budget task approved” |

Email: **`sendFpaBudgetLifecycleEmail`**.

---

## By audience (groups)

### Budget owners (department assignees)

- `BUDGET_OWNER_ASSIGNED`
- `BUDGET_RETURNED_FOR_CORRECTION`
- `BUDGET_CFO_APPROVED`
- `BUDGET_CYCLE_LOCKED`
- `BUDGET_BOARD_PACK_READY`
- `BUDGET_TASK_ASSIGNED`
- `BUDGET_TASK_RETURNED`
- `BUDGET_TASK_APPROVED`

### FP&A managers

- `BUDGET_SUBMITTED_FOR_REVIEW`
- `BUDGET_CFO_APPROVED`
- `BUDGET_TASK_SUBMITTED`

### CFO

- `BUDGET_SUBMITTED_FOR_REVIEW`
- `BUDGET_PENDING_CFO_REVIEW`
- `BUDGET_BOARD_PACK_READY`
- `BUDGET_TASK_SUBMITTED`

### Cycle creator

- `BUDGET_CFO_APPROVED`
- `BUDGET_CYCLE_LOCKED`
- `BUDGET_BOARD_PACK_READY`

---

## Quick count

| Group | Distinct `type` codes |
|-------|------------------------|
| Owner assignment | 1 |
| Cycle lifecycle | 6 |
| Task lifecycle | 4 |
| **Total** | **11** |

---

## Source files

- [`src/services/fpa/FpaBudgetCycleService.ts`](../src/services/fpa/FpaBudgetCycleService.ts) — `notifyOwnersAssigned`, `notifyUsers`, cycle lifecycle helpers
- [`src/services/fpa/FpaWorkflowService.ts`](../src/services/fpa/FpaWorkflowService.ts) — `notifyTaskEvent`
- [`src/services/EmailNotificationService.ts`](../src/services/EmailNotificationService.ts) — `sendBudgetOwnerAssignedEmail`, `sendFpaBudgetLifecycleEmail`
