# Fundraising LP Pipeline — backend requirements

Design session: [`design-sessions/fundraising-lp-pipeline.md`](../design-sessions/fundraising-lp-pipeline.md)

**Status:** Phase 2 Section 3.9 — GP fundraising CRM with Kanban, mailers, agreement upload, LP auto-provision on WON.

| Item | Value |
|------|-------|
| Swagger tag | `Fundraising LP Pipeline` |
| Base path | `/api/fundraising/*` |

---

## 1. Architectural pillars

1. **Transaction-aware progression** — stage moves validate checklist + agreement gates.
2. **Multi-currency aggregation** — USD/ZIG via stored FX + exchange-rate display.
3. **Automated continuity** — WON provisions `Client`, `InvestmentCommitment`, LP portal, GL.

---

## 2. Functional requirements

### US-3.9.1 — Campaign setup

- Required: `fundId`, target capital, primary currency (USD/ZIG), start/close dates, region tags.
- Auto-seed 5 stages: Prospect → Engaged → Due Diligence → Term Sheet Issued → Won/Signed.
- Status `ACTIVE` on create.

### US-3.9.2 — Kanban

- Columns show deal count + aggregated value.
- `PATCH …/deals/:id/stage` — 400 if gates fail.
- Per-deal checklist from stage templates.

### US-3.9.3 — Mailers & interactions

- Batch email via `EmailNotificationService`; log to `pipeline_interactions`.
- Quick log: call, meeting, note.

### US-3.9.4 — Agreement & close

- Upload signed subscription (multipart, term-sheet pattern).
- `SIGNED` → promote to WON → `FundraisingCloseService`.

---

## 3. Formulas

- **WPV:** \(W = \sum V_i \times P_{stage(i)}\)
- **Completion:** \(C_\% = (\sum V_{won} / T_c) \times 100\%\)
- **Gap:** \(G_{rem} = T_c - \sum V_{won}\)
- **Days left:** \(D_{left} = t_{closing} - t_{current}\)

---

## 4. Data model

| Table | Purpose |
|-------|---------|
| `fundraising_campaigns` | Campaign header |
| `fundraising_pipeline_stages` | Stages + win probability |
| `fundraising_stage_checklist_templates` | Stage checklist templates |
| `fundraising_pipeline_deals` | Kanban cards |
| `fundraising_deal_checklist_items` | Per-deal checklist |
| `fundraising_deal_agreements` | Subscription docs |
| `pipeline_interactions` | Activity log |
| `fundraising_campaign_gl_mappings` | COA codes |

Migration: `npm run db:migrate:fundraising-lp-pipeline`

COA seed: `1125` AR LP Commitments, `3010` Partners Capital Committed.

---

## 5. API specification

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/fundraising/campaigns` | List / create |
| GET/PATCH | `/fundraising/campaigns/:campaignId` | Detail / update |
| GET | `/fundraising/campaigns/:campaignId/board` | Kanban |
| GET | `/fundraising/campaigns/:campaignId/dashboard` | Metrics summary |
| GET | `/fundraising/campaigns/:campaignId/metrics` | WPV, C%, gap, days |
| POST | `/fundraising/campaigns/:campaignId/deals` | Create deal |
| GET/PATCH | `/fundraising/deals/:dealId` | Deal detail |
| PATCH | `/fundraising/deals/:dealId/stage` | Move (gated) |
| GET/PATCH | `/fundraising/deals/:dealId/checklist` | Checklist |
| GET/POST | `/fundraising/deals/:dealId/interactions` | History / log |
| POST | `/fundraising/campaigns/:campaignId/mailer/send` | Batch outreach |
| POST | `/fundraising/deals/:dealId/agreement/upload` | Signed doc |
| GET | `/fundraising/deals/:dealId/agreement` | Agreement meta |
| POST | `/fundraising/deals/:dealId/close` | Manual close trigger |

---

## 6. RBAC

| Action | Roles |
|--------|-------|
| View board/metrics | admin, fund_manager, IR signals |
| Edit campaigns/deals | admin, fund_manager, IR |
| Mailer send | admin, fund_manager |
| Agreement upload / close | admin, CCO/compliance signals |

---

## 7. Integrations

| Module | On WON |
|--------|--------|
| `Client` + `InvestmentCommitment` | Create ACTIVE commitment |
| LP Portal | `lp_user_relations` if user email matches |
| GL | Dr 1125 / Cr 3010 via `JournalEntryService` |
| LP snapshots | `LpPortalSnapshotCronService` refresh |

**E-sign:** v1 upload only (no DocuSign). Webhook stub documented for future.

---

## 8. Testing and UAT

- `npm run uat:fundraising:core`
- `npm run uat:fundraising:rbac`
- `npm run uat:fundraising:close`
- `npm run test:fundraising`
