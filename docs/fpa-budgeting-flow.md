# FP&A Budgeting — Annual budget cycle (requirements)

Purpose: allow the organisation to set the **formal financial plan for the year**. Budgets allocate resources, control spending, and measure performance.

**Budget inputs shall include:** revenue, cost of sales, payroll, operating expenses, departmental costs, project budgets, capex, tax, cash movement assumptions, and funding assumptions.

This doc is the **user/process contract** from the SRD.  
**API contracts:** [fpa-budgeting-api.md](./fpa-budgeting-api.md) (`/v1/fpa/budget-cycles/*`).

Related: [fpa-user-flow.md](./fpa-user-flow.md) · [fpa-model-setup-api.md](./fpa-model-setup-api.md) · [fpa-api-reference.md](./fpa-api-reference.md)

---

## 1. Annual Budget Cycle (SRD flow)

```text
FP&A creates annual budget cycle
  → Load prior-year actuals
  → Load baseline assumptions
  → Assign tasks to budget owners
  → Budget owners input budget
  → Validate completeness
       ├─ No  → Return for correction → (back to owner input)
       └─ Yes → Submit to FP&A review
  → FP&A reviews and consolidates
       ├─ No  → Return for correction → (back to owner input)
       └─ Yes → CFO reviews
  → CFO approves?
       ├─ No  → Return for correction → (back to owner input)
       └─ Yes → Lock approved budget version
                 → Generate dashboards and board pack
```

---

## 2. Budget Owner Sequence (SRD §14.1)

| Step | Actor | System / product action |
|------|--------|-------------------------|
| 1 | FP&A Manager | Creates budget cycle and assigns owners |
| 2 | Arcus | Creates task list; loads prior actuals and baseline assumptions |
| 3 | Department Head | Inputs budget lines and commentary |
| 4 | Arcus | Validates required fields and totals |
| 5 | Department Head | Submits budget |
| 6 | FP&A Manager | Reviews, approves or returns for correction |
| 7 | CFO | Reviews consolidated budget and approves |
| 8 | Arcus | Locks approved version and generates dashboards / board pack |

### Roles

| Role | Responsibility in this cycle |
|------|------------------------------|
| **FP&A Manager** | Open cycle, assign owners, first review / consolidate, return or pass to CFO |
| **Department Head (budget owner)** | Enter budget lines + commentary; fix after return; submit |
| **CFO** | Final approval of consolidated budget |
| **Arcus** | Auto task list, load actuals/assumptions, validate completeness, lock + pack after approval |

---

## 3. What “budget input” means (content)

Owners and FP&A enter (via worksheet / domain views / drivers as designed by FE):

| Area | Examples |
|------|----------|
| Revenue | Top-line by dept / product / entity |
| Cost of sales | COGS / direct costs |
| Payroll | Salaries, headcount-driven cost |
| Operating expenses | Rent, marketing, G&A |
| Departmental costs | Scoped by department |
| Project budgets | Project / initiative lines |
| Capex | Capital spend |
| Tax | Tax assumptions / lines |
| Cash movement | Opening/closing cash, timing |
| Funding | Funding / financing assumptions |

Numbers live on the **planning model** (budget version + BASE or budget scenario). Governance is the **workflow / tasks** cycle above.

---

## 4. Backend mapping (implemented)

| SRD step | API |
|----------|-----|
| Create cycle + assign owners | `POST /budget-cycles` |
| Load prior actuals / baseline | On create flags, or `…/load-actuals`, `…/load-baseline` |
| Owner input | Grid + `POST /tasks/{id}/submit` |
| Validate completeness | `POST /budget-cycles/{id}/validate` |
| Submit → FP&A | `POST /budget-cycles/{id}/submit-fpa` |
| FP&A accept / return | `…/fpa-accept` · `…/fpa-return` |
| CFO approve / return | `…/cfo-approve` · `…/cfo-return` |
| Lock + board pack | `…/lock` · `…/board-pack` |
| List / detail | `GET /budget-cycles` · `GET /budget-cycles/{id}` |

Full contracts: [fpa-budgeting-api.md](./fpa-budgeting-api.md).

---

## 5. API status

Live under `/v1/fpa/budget-cycles`. Fallback: `POST/GET /workflows` with `workflowType: "BUDGET"`.
