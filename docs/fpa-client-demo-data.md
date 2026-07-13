# FP&A client demo data (`nts` + `demo_env`)

Wipe and reseed **planning_*** tables only with a coherent Arcus Holdings FY2026 story for client walkthroughs.

| Env | Action |
|-----|--------|
| `nts` (dev-api) | Wipe + reseed |
| `demo_env` | Wipe + reseed |
| `client1_db` | **Never touched** |

Users, departments, funds, and COA are preserved.

## Re-run

```bash
# Local / any DATABASE_URL (refuses client1_db unless ALLOW_CLIENT1_FPA_WIPE/SEED=1)
npm run db:reset:fpa-demo

# Or separately
npm run db:clear:fpa
npm run db:seed:fpa-demo

# VPS: nts then demo_env only
python scripts/reset-fpa-demo-nts-demo-env-vps.py
```

## Demo story

- **Company:** Arcus Holdings (USD, monthly Jan–Dec 2026)
- **Owner:** `admin@nts.com` (or first ADMIN/CFO/SYSADMIN user)

### Models

| Model | Status | Use in UI |
|-------|--------|-----------|
| **FY2026 Operating P&L** | `PUBLISHED` | Primary: Model Builder, Detailed, Planning, Budgeting |
| **FY2026 Board Pack Model** | `ARCHIVED` | Secondary / archived path |
| **FY2027 Draft Structure** | `DRAFT` | In-progress builder |

Primary model includes:

- Modules: Revenue, COGS & Margin, Workforce, Operating Expenses, Cash
- Formulas: `LINE('CODE')` expressions (gross/net revenue, GP, salaries, EBITDA)
- Versions: **LOCKED** published + **DRAFT** working copy
- Scenarios: **BASE** (official), **UPSIDE** (+10% units / +2% price), **DOWNSIDE** (−10% units / −15% marketing)
- Grid: seasonal Jan–Dec cells (not flat random)
- Drivers: HEADCOUNT, PRICE
- Data mappings: NetSuite GL ~90% mapped; **DISCOUNTS** and **GA** left `UNMAPPED` for Exceptions
- Audit: create / module / cell-edit / publish samples

### Budget cycles (on primary model)

| Cycle | Status | Walkthrough |
|-------|--------|-------------|
| FY2025 Annual Budget (Closed) | `LOCKED` | Historical closed book |
| FY2026 Annual Budget — Open | `OPEN_FOR_INPUT` | Live owner worksheets |
| FY2026 Mid-Year — Returned | `RETURNED_FOR_CORRECTION` | Rejection / return path |
| FY2026 Board Review | `PENDING_CFO_REVIEW` | Approval queue |

Owners/tasks mix `PENDING` / `SUBMITTED` / `RETURNED` / `APPROVED` with comments and approval history.

## FE click path (suggested)

1. **Model Builder** → open **FY2026 Operating P&L** → modules / formulas / publish state; peek at **FY2027 Draft** and archived Board Pack.
2. **Detailed workspace** → grid by module (use **working** version for edits); Data mappings + Exceptions (unmapped DISCOUNTS/GA); Audit; Sensitivity on HEADCOUNT/PRICE.
3. **Model Planning** → switch BASE / UPSIDE / DOWNSIDE on the published model.
4. **Budgeting** → filter cycles by status (Open / Returned / Pending CFO / Locked).

## Safety

- Clear/seed scripts refuse `client1_db` unless `ALLOW_CLIENT1_FPA_WIPE=1` / `ALLOW_CLIENT1_FPA_SEED=1`.
- VPS helper only lists `nts` and `demo_env` URLs.
