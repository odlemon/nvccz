# NVCCZ backend agent playbook

**Audience:** Another Cursor agent (or engineer) opening this repo on a **different branch / window**, especially when working a module other than the one currently in flight.  
**Purpose:** How we ship backend features here — migrations, UAT, FE handoffs, and a short map of **FP&A** so you do not invent a parallel workflow.

Cursor rules that encode the same habits (always on):

- `.cursor/rules/nvccz-database-no-prisma-migrate.mdc`
- `.cursor/rules/nvccz-fpa-deliver-pipeline.mdc`
- `.cursor/rules/nvccz-uat-scripts-self-sufficient.mdc`

---

## 1. Product / repo snapshot

| Item | Value |
|------|--------|
| Stack | Node + Express + TypeScript, Prisma client, MySQL |
| API prefix | `/api` (FP&A under `/api/v1/fpa`) |
| Local server | `npm run dev` → typically port **3009** |
| Schema source of truth | `prisma/schema.prisma` (types) + **real MySQL** (DDL applied by scripts) |
| Shared DBs | `nts` (main/dev), `client1_db`, `demo_env` |

**Git / deploy:** Do **not** commit, push, or VPS-deploy unless the user explicitly asks in that turn.

---

## 2. How we ship a feature (delivery pipeline)

When the user asks to **implement** a backend feature from FE/API requirements, finish this in the **same turn** (unless they say “no migrate”):

1. **Code** — routes → controller → service; match existing patterns in that module.
2. **Schema** — update `prisma/schema.prisma` if needed.
3. **Idempotent migration script** — `scripts/run-*-migration.ts` + `package.json` entry `db:migrate:…`.
4. **Dedicated API docs** — `docs/<module>-*-api.md` (endpoints, examples, enums, error codes, acceptance checklist).
5. **Migrate all three DBs** — `nts`, `client1_db`, `demo_env` (override `DATABASE_URL`).
6. **UAT with client-demo fixtures** — HTTP script under `scripts/uat-*.ts`, self-sufficient data, print IDs/names for walkthroughs.
7. **FE handoff** (when FE is waiting) — short `docs/*-fe-handoff.md` or section in the API doc: what to call, what to stop waiting on, toast codes.

| User says | Do |
|-----------|-----|
| “push and deploy” / “commit and push” | Then commit / push / deploy as asked |
| “no migrate” | Skip 3-DB migrate |

Do **not** stop with “say if you want deploy” — migrations + docs + UAT are the default finish line; push/deploy are opt-in.

---

## 3. Database migrations (critical — do not use Prisma Migrate)

### Never

- `prisma migrate dev` / `prisma migrate deploy`
- `prisma db push` as the normal way to sync shared/prod DBs

### Always

1. Write an **idempotent** TS script in `scripts/` using `PrismaClient` + `$executeRawUnsafe` / `$queryRawUnsafe` (or `mysql2`).
2. Check `information_schema` before `CREATE TABLE` / `ALTER TABLE` / `CREATE INDEX` — log `[ok]` / `[skip]`.
3. Keep `prisma/schema.prisma` aligned with the DDL.
4. Add npm script: `"db:migrate:<name>": "ts-node --transpile-only -r dotenv/config scripts/run-….ts"`.
5. After schema changes: `npx prisma generate` (on Windows, stop `npm run dev` if you hit **EPERM** on `query_engine-windows.dll.node`).

### Agent sequence after a new migration

1. Run migrate once → `prisma generate`  
2. Re-run migrate (must skip / no errors) → `prisma generate` again  
3. Run UAT  

### Apply to all three DBs

```bash
# Pattern (PowerShell / bash — set DATABASE_URL per DB)
DATABASE_URL="mysql://…/nts"        npm run db:migrate:<name>
DATABASE_URL="mysql://…/client1_db" npm run db:migrate:<name>
DATABASE_URL="mysql://…/demo_env"   npm run db:migrate:<name>
```

Some features have `scripts/run-*-all-dbs-vps.py`; VPS SSH can flake — local remote URLs with `DATABASE_URL` override are fine.

**Example scripts:** `scripts/run-model-planning-cycle-owners-migration.ts`, `scripts/run-fpa-grid-scope-index-migration.ts`, invoice lifecycle migrations.

---

## 4. Code layout (backend)

```text
src/routes/          → mount paths (e.g. fpaRoutes.ts)
src/controllers/     → thin HTTP (parse req, call service, res.json)
src/services/<area>/ → business logic
src/config/*-swagger-paths.ts → OpenAPI fragments for Swagger UI
prisma/schema.prisma
scripts/             → migrations, seeds, UAT
docs/                → API + FE handoff markdown
```

**FP&A services live under** `src/services/fpa/` (e.g. `FpaGridService`, `FpaModelPlanningCycleService`, `FpaBudgetCycleService`).

**Response shape (common):**

```json
{ "success": true, "data": { … } }
```

Errors often: `{ "success": false, "code": "SOME_CODE", "message": "…" }` — FE toasts on `code`. Prefer stable, documented codes.

---

## 5. Communicating with the frontend

### How work usually arrives

1. FE (or product) drops an **“Backend asks”** markdown: endpoints, payload shapes, error codes, verify steps, FE files already wired.
2. BE implements against that contract (do not force FE onto a different entity if they said e.g. Model Planning ≠ budget-cycle).
3. BE writes:
   - **API doc** — `docs/fpa-*-api.md` (or module-equivalent)
   - **FE handoff** — what is ready, exact paths, toast codes, demo logins, “stop waiting on …”
4. FE wires `lib/api/*` + hooks; worksheet/modals already may call the paths.

### Conventions FE expects

| Topic | Convention |
|-------|------------|
| Base | `/api/v1/<module>/…` |
| Auth | Bearer token from `/api/auth/login` |
| Enums / status | Document allowed values; validate server-side |
| Error toasts | Stable `code` strings (`UNKNOWN_DEPARTMENT`, `DEPARTMENT_SCOPE_LOCKED`, …) |
| Aliases | Sometimes both snake + camel (`cycle_name` + `name`) for FE comfort — document both |
| Distinct entities | Do **not** reuse budget-cycle URLs for Model Planning cycle IDs (and vice versa) |

### Handoff doc checklist

- Endpoints + method + body/query  
- Example JSON (create + list/get)  
- Error table (code → HTTP → when)  
- How to verify (BE UAT command + FE walkthrough)  
- Demo fixture block (IDs, emails, passwords for client demo)  
- Out of scope / later  

Examples: `docs/fpa-model-planning-owners-fe-handoff.md`, `docs/fpa-model-planning-tasks-api.md`.

---

## 6. UAT and demo data

### UAT scripts

- Prefer HTTP against running API: `scripts/uat-*-http.ts` + `npm run uat:…`
- **Self-sufficient:** create missing users/depts/fixtures; do not fail with “create manually”
- Idempotent markers / reuse existing demo entities
- Print a clear **CLIENT DEMO FIXTURE** JSON (ids + names + logins)

### FP&A demo seed

- `npm run db:seed:fpa-demo` / `db:reset:fpa-demo` — Arcus-style story data  
- Details: `docs/fpa-client-demo-data.md`  
- Typical login: `admin@nts.com` / `admin123`  
- Owner demo often: `ada.owner@nts.com` / `OwnerDemo123!`  
- Prefer **Finance / Sales** departments already in `nts`

### Performance / Kanban tasks

Cross-module pattern: many product areas surface work on **Performance Management** `Task` (`/api/tasks`, `/api/tasks/my`) with `category` + `taskMetadata.sourceModule`. Prefer **one task store** long-term; avoid permanent dual-write of two full task entities when designing new modules (FP&A currently still has `PlanningTask` + PM mirror for Model Planning — treat that as transitional unless product says otherwise).

---

## 7. FP&A module — brief map

Think **three related surfaces**, not one:

```text
Model Builder  →  Publish (LOCKED version)  →  Model Planning (operate)
                                              ↘ Budget cycles / Workflow (annual process)
```

| Surface | Job | Main routes / services |
|---------|-----|-------------------------|
| **Model Builder** | Design model: modules, line items, formulas, mappings, publish | `FpaModelService`, builder/setup services; versions LOCKED = published |
| **Model Planning** | Operate a published model via **Model Planning Cycle** (distinct from budget cycle) | `/v1/fpa/model-planning/cycles/*`, `FpaModelPlanningCycleService`, owners, tasks, grid `?cycleId=` |
| **Budgeting / Workflow** | Annual budget execution: open, owners, submit, FPA/CFO approve, lock | `/v1/fpa/budget-cycles/*`, `FpaBudgetCycleService`, `FpaWorkflowService` |

### Shared planning primitives

| Concept | Table / model (approx.) | Notes |
|---------|-------------------------|--------|
| Model / version / scenario | `PlanningModel`, `PlanningVersion`, `PlanningScenario` | Planning cycles bind to a **published** version |
| Grid cells | `PlanningCell` | Scoped by model/version/scenario/department/period |
| Grid API | `GET/POST …/models/{id}/grid`, `…/cells/update` | Pass `cycleId` for cut-over + dept scope + published-version edit |
| Workflow tasks (FP&A) | `PlanningTask` + `PlanningWorkflow` | Owner slice submit, approvals |
| Comments / activity | `PlanningComment`, `PlanningApproval` | Prefer entity-native routes (MPC vs budget) |

### Model Planning (recent product rules)

1. Create cycle with `owners[]` ≥ 1 → persist owners, owner tasks, materialise dept cells.  
2. Grid: owners only edit their department; FP&A/approvers full edit; `DEPARTMENT_SCOPE_LOCKED`.  
3. Actuals cut-over: `ACTUAL_PERIOD_LOCKED` for periods on/before cutoff.  
4. Slice submit: `POST /v1/fpa/tasks/{taskId}/submit` (not whole-cycle submit).  
5. Ad-hoc tasks: `GET/POST /model-planning/cycles/{id}/tasks` — distinct from owner “Dept plan” tasks.  
6. Owner workspace: `GET …/model-planning/cycles/{id}/owner-workspace` (not budget `owner-workspace`).

### Key FP&A docs (start here)

| Doc | Use |
|-----|-----|
| [fpa-model-planning-vs-builder.md](./fpa-model-planning-vs-builder.md) | Builder vs Planning vs Budgeting |
| [fpa-model-planning-api-status.md](./fpa-model-planning-api-status.md) | Scoreboard of shipped vs missing |
| [fpa-model-planning-cycle-api.md](./fpa-model-planning-cycle-api.md) | Cycle CRUD / workspace |
| [fpa-model-planning-owners-api.md](./fpa-model-planning-owners-api.md) | Owners + slice submit |
| [fpa-model-planning-owners-fe-handoff.md](./fpa-model-planning-owners-fe-handoff.md) | FE wiring for owners/grid |
| [fpa-model-planning-tasks-api.md](./fpa-model-planning-tasks-api.md) | Ad-hoc tasks + PM mirror |
| [fpa-model-planning-actuals-cutoff-api.md](./fpa-model-planning-actuals-cutoff-api.md) | Cut-over banding |
| [fpa-budgeting-api.md](./fpa-budgeting-api.md) | Budget cycles |
| [fpa-client-demo-data.md](./fpa-client-demo-data.md) | Demo seed story |

### Useful npm scripts (FP&A)

```bash
npm run db:migrate:model-planning-cycle
npm run db:migrate:model-planning-cycle-owners
npm run db:migrate:fpa-grid-scope-index
npm run db:seed:fpa-demo
npm run uat:fpa:model-planning-cycle
npm run uat:fpa:model-builder
npm run uat:fpa
```

---

## 8. Design / engineering habits (this team)

- **Match existing code** in the module — naming, error class (`FpaError`), controller thinness.  
- **No drive-by refactors** outside the ask.  
- **Performance:** avoid loading entire cell tables into Node; prefer SQL aggregates / indexes; do not block HTTP on SMTP (notify in-app first, email async).  
- **Cross-module tasks:** prefer Performance `Task` as the user-visible work queue when product wants “see it in Performance.”  
- **Swagger:** add paths in `src/config/*-swagger-paths.ts` when you add routes.  
- **Windows:** kill stale `node` / free port 3009 if `EADDRINUSE`; stop `dev` before `prisma generate` on EPERM.

---

## 9. Quick start for a new agent on another branch

1. Read this playbook + the cursor rules above.  
2. Identify your module’s existing `docs/*-api.md` and `src/services/<area>/`.  
3. Implement → migrate script → docs → 3 DBs → UAT → FE handoff.  
4. Do not touch unrelated modules or force FE onto the wrong entity.  
5. Do not commit/push/deploy unless asked.

If you are **not** working FP&A, still follow §§2–6 (pipeline, migrations, FE handoff, UAT). Use §7 only as an example of how a large module is structured and documented here.
