# Performance reviews — frontend UX guide (narrative)

This document is for **product and frontend implementation**. It describes **what users should see and do** in the Performance module’s **Reviews** area: navigation, roles, review lifecycle, forms, cycles, reports, and validation. It intentionally **does not** list API routes or request bodies; developers should wire screens to the backend contracts separately.

---

## How to use this document

- Each section mixes **user stories** with **UI expectations** and **roles**.
- **Backend alignment notes** explain where today’s server behaviour matches, differs, or extends the UX so labels and guards stay honest.
- **Numeric ratings** in the product are **whole numbers from 1 through 5** (not 1–6). If stakeholders say “six-point scale,” that is a **product decision** to change the backend rules first, then the UI.

---

## Product intent — strengths and corrections

**What works well in the target design**

- Clear **chain of accountability**: employee → independent input → HR moderation → line manager sign-off.
- **Review cycles** tied to a period (e.g. year-ending) with deadlines.
- **Read-only performance context** on the form so scores reflect real task/goal progress, not free typing.
- **Minimum length** on written feedback so submissions are substantive.
- **Visible lifecycle status** so everyone knows what happens next.
- **Distribution reporting** so HR can spot bias before mass finalization.

**Corrections to common assumptions**

| Assumption | Actual direction (align UX copy here) |
|------------|--------------------------------------|
| PDF is built in the browser | The **server** generates the signed-off PDF and stores it; the UI **downloads or previews** the file after finalization. |
| “Trigger cycle” creates every employee review | Cycle initiation **targets existing reviews** that fit eligibility rules and **notifies** people; bulk creation of reviews is a separate admin/manager action unless product adds it. |
| Org-wide rating chart is one obvious call | **Organization-wide** aggregation is available when the product asks for it explicitly (server-side: **HR / exec / admin** roles only); **per-department** remains the default slice for drill-down. |
| Four human roles = four identical database labels | The UI should show **friendly statuses**; the API uses **`status` and `stage`** strings. Use the mapping table below so badges stay consistent. |

---

## Information architecture

**Placement**

- Under **Performance** in the sidebar, add (or emphasise) **Reviews** as a first-class section—not buried only inside goals or scorecards.

**Suggested sub-areas (tabs or nested routes)**

1. **My reviews** — I am the **reviewee** (employee).
2. **Reviews to complete** — I am **reviewer**, **external evaluator**, **HR moderator**, or **line manager**, depending on role and assignment.
3. **Cycles** (HR admin) — create and manage **review cycles** (period, deadlines, active flag).
4. **Reports** (HR admin / HR lead) — **rating distribution** before finalization push.

Optional: a single **Review detail** route opened from lists (deep link from notifications).

---

## Roles and what each role sees

Use these as **RBAC + layout** guidelines. Exact permission names in your auth system may differ; map them to these behaviours.

### Employee (reviewee)

**Stories**

- As an employee, I open **My reviews** and see reviews where **I am the subject** for the active or selected cycle.
- I complete **self-assessment / self-review**: strengths, development areas, narrative feedback, and any self-ratings the form defines.
- I see **automated performance context** (e.g. goal/task completion or progress %) that is **read-only** so I cannot edit the underlying performance data from this screen.
- I see a **status badge** that tells me whether I still owe input, whether an external evaluator is next, or whether the process is waiting on HR or my manager.

**UI**

- List: title, period, **status**, due date.
- Detail: collapsible “Performance snapshot” (read-only), then editable self sections.
- Primary action: **Save draft** / **Submit self-review** (wording should match when the backend advances the workflow stage).

### External evaluator / consultant (system user)

**Stories**

- As an external evaluator, I log in with an account that is **purpose-limited**: I only see **Reviews** (or a dashboard that lists **reviews where I am the assigned reviewer**).
- I open an assigned review, see the employee context I am allowed to see (policy: often summary + self-review content, not necessarily full HR notes—product should confirm).
- I enter **qualitative feedback** and any **ratings** the process allows for my step.
- I cannot see unrelated modules (payroll, portfolio, etc.) if the organisation adopts a restricted shell.

**UI**

- Minimal chrome: logo, sign-out, **Assigned reviews** list.
- Detail: clear label “Independent / external evaluation” so it is not confused with manager sign-off.

**Backend alignment**

- Assignment is modeled by being the **review’s reviewer** (or future dedicated role). **Cross-department reviewers** must be able to open their assigned reviews without sharing the employee’s department.

### HR moderator / HR business partner

**Stories**

- As HR, I see **self-review** and **external** inputs for reviews in scope (typically whole organisation or my HR scope).
- I record **moderation**: reconciled ratings, HR narrative, or “final HR weighting” fields the product defines.
- I advance the process when HR input is complete so the **line manager** step can run.

**UI**

- Filters: cycle, department, status.
- Detail: side-by-side or stacked blocks—**Employee**, **External**, **HR**—with clear timestamps and authors.

**Backend alignment**

- Users who **bypass department gates** (HR leadership, CEO, configured admins) see reviews outside their own department.

### Line manager

**Stories**

- As a line manager, I open reviews for **my direct reports** when the workflow reaches **manager / final content** stages.
- I see **HR-moderated** outcomes and employee + external material **according to policy** (your narrative: manager may focus on HR-consolidated scores; the UI should hide fields policy says they must not see).
- I enter **manager ratings (1–5)** and **manager feedback** where required.
- I perform **final sign-off**: an explicit **Finalize** action that **locks** the review and makes the **official PDF** available.

**UI**

- Warning modal on finalize: irreversible, generates official record.
- After finalize: show **Download PDF** (and optionally “Regenerate” only if product allows—default is no).

**Backend alignment**

- **Finalize** is restricted to **line manager of the reviewee** or **HR / exec / admin bypass** roles—not every same-department reviewer.

### HR admin (cycle configuration)

**Stories**

- As HR admin, I create a **review cycle**: title, period window, deadlines (self, peer/external, manager), rating scale label, active flag.
- I **trigger** (or **remind**) for a cycle so eligible employees (and, where implemented, reviewers / stakeholders) are **notified**.
- I use **rating distribution** reports across the organisation or by department before asking managers to mass-finalize.

---

## Review form UX

### Read-only quantitative / snapshot block

- Label clearly: “From performance module (read-only)”.
- Populate from server **auto-population** of quantitative snapshot; disable inputs; show last updated time if available.

### Qualitative fields

- Enforce **at least 50 characters** (trimmed) for any non-empty narrative feedback fields the backend validates (self, manager, peer, stakeholder-type text).
- Show a live counter: “43 / 50 minimum”.

### Ratings

- **Manager scale**: integers **1–5** only; reject decimals in the client before submit.
- Use consistent control: five-point radio or select; optional tooltips per point if HR provides definitions.

### Status on the form

- Always show **pipeline position**: e.g. “You are here” in a horizontal stepper: Self → External → HR → Manager → Finalized.

---

## Lifecycle — user-visible statuses vs system stages

Friendly labels (what users read) should map to **`stage` / `status`** from the API as follows.

### When an **external stakeholder** is linked on the review (`stakeholder` present)

| User-facing label (suggested) | Typical `stage` (system) | Notes |
|------------------------------|---------------------------|--------|
| Draft / not started | `SELF_ASSESSMENT` or early `SELF_REVIEW` | Employee has not finished self step. |
| Self-review complete | `PEER_REVIEW` | **External** step is next (API stage name is peer-style; UX label should say “External evaluation”). |
| External complete | `HR_REVIEW` | HR moderation step (dedicated stage). |
| HR complete | `MANAGER_REVIEW` | Line manager / HR consolidation before final narrative. |
| Manager content complete | `FINAL_REVIEW` | Ready for **Finalize** action. |
| Finalized | `FINALIZED` | Locked; PDF available. |

### When **no** external stakeholder is linked (shorter path)

| User-facing label | Typical `stage` |
|-------------------|-----------------|
| Self-review | `SELF_REVIEW` |
| Manager / HR combined step | `MANAGER_REVIEW` | Organisation may still use HR bypass separately. |
| Ready to finalize | `FINAL_REVIEW` |
| Finalized | `FINALIZED` |

The UI should **derive** the friendly label from **`stage` + `stakeholder` presence + `isLocked`**, not from a single free-text field, unless the API later adds a dedicated `displayStatus`.

---

## Review cycles (HR admin)

**Stories**

- As HR admin, I create **Year ending 2026** (example) with clear deadlines.
- I mark which **review types** apply for the cycle (labels only in this doc).
- I activate the cycle and run **Trigger / reminders** near the start date.

**What participants experience (aligned with current server behaviour)**

- **Employees** who already have a manager-created review in scope and have **not started** self-assessment receive a **reminder email** and their review may be **linked** to the cycle.
- **Managers / reviewers** and **external stakeholders** may receive **awareness** notifications when the cycle is triggered, where the email integration is enabled (copy should say “prepare for independent evaluation” for externals).

**UX honesty**

- If no pre-created review exists for an employee, **triggering the cycle alone will not magically create** their review—the UI should steer HR/managers to **create or import** reviews first, or the product must add automatic creation later.

---

## Reports — rating distribution (HR)

**Stories**

- As HR, I open **Reports → Rating distribution** for a selected **review period** (and optionally **department**).
- I switch to **Organisation-wide** view to see the **histogram** of manager `ratingValue` (1–5) counts before finalization.
- I drill into a **department** to compare distributions and spot **bias** or clustering.

**Charts**

- Simple bar chart: rating 1–5 vs count; table export optional later.

---

## Manager sign-off and PDF

**Stories**

- As a line manager, after HR and prior steps are done, I click **Finalize**.
- The system **locks** the review and I can **download** the official PDF (employee, self, external, HR, manager content as configured in the document template).

**UX**

- Disable editing everywhere when `isLocked` / finalized.
- Show **Finalized on** date and **Finalized by** name if the API exposes them.

---

## Notifications (high level)

- **Cycle trigger**: employees receive self-assessment reminders; reviewers and external contacts may receive parallel notices when configured.
- **Stage changes**: optional future enhancement—daily digest or instant “your turn” when previous stage completes.

---

## Accessibility and quality bar

- Stepper and status badges must be readable with colour-blind-safe patterns (not colour alone).
- Long forms: sticky footer with primary action.
- Errors from the server (validation, forbidden finalize) should surface as inline alerts and toasts.

---

## Summary checklist for frontend

- [ ] Performance → **Reviews** navigation and role-based sub-areas.
- [ ] **My reviews** vs **Reviews to complete** vs **Cycles** vs **Reports**.
- [ ] Read-only **performance snapshot** block.
- [ ] **≥ 50 characters** on validated text fields with counter.
- [ ] **1–5** integer manager ratings.
- [ ] **Status stepper** mapped from `stage` / stakeholder / locked state.
- [ ] **Finalize** only for allowed roles; then **download PDF**.
- [ ] **Cycles** UI explains prerequisites (existing reviews).
- [ ] **Distribution** chart: department and organisation-wide modes for HR.

This guide should stay **narrative**; pair it with API documentation for field-level binding.
