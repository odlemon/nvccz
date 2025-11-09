# Performance KPI Data Sources Mapping

This document expands the SRD KPI catalogue for the performance module and maps each hardcoded KPI to the source module or dataset that should provide real values. Use it as the single source of truth when wiring automated updates, ETL jobs, or manual backfills.

## Legend
- **Module** – Primary system or service responsible for calculating or storing the KPI.
- **Example Source Field** – Representative field or calculation to query inside the module.
- **Type** – Expected data type or format when ingesting into performance goals or scorecards.
- **Context** – Business rationale for the KPI (from the SRD).

## KPI → Source Module Matrix

| KPI (Hardcoded Code) | Context | Module (Source of Truth) | Example Source Field / Calculation | Expected Type |
| --- | --- | --- | --- | --- |
| `REVENUE_GROWTH_PCT` | VC/Asset Management: Track growth in management fees or carry income. | **Accounting** | `IncomeStatement.managementFees` – compare current vs. prior period | Number (percentage) |
| `OPERATING_EXPENSES` | Asset manager efficiency; usually monitored against a cap. | **Accounting** | `IncomeStatement.operatingCosts.total` | Currency |
| `AUM_TOTAL` | Core fund size measure for asset management. | **Portfolio Management** | `Fund.currentAUM` | Currency |
| `PORTFOLIO_IRR_PCT` | Flagship VC metric; annualized return on portfolio investments. | **Portfolio Management** | `Investment.internalRateOfReturn` | Number (percentage) |
| `TIME_TO_HIRE_DAYS` | Hiring cycle efficiency. | **Task Management** | Difference between requisition “Open” and employment contract “Signed” tasks | Integer (days) |
| `INVOICE_PROCESS_TIME_DAYS` | Procurement/AP process efficiency. | **Procurement / Accounting** | `Invoice.paidDate - Invoice.receivedDate` | Integer (days) |
| `TRAINING_COMPLETION_RATE_PCT` | Compliance / HR goal. | **Task Management** | Ratio of completed tasks tagged `TrainingModule` | Number (percentage) |
| `EVENT_RSVP_RATE_PCT` | Marketing & investor relations effectiveness. | **Events** | `Event.totalRSVP / Event.totalInvited` | Number (percentage) |
| `CONTRACT_APPROVAL_TIME_HOURS` | Procurement / Legal workflow speed. | **Procurement / Task Management** | Time delta from document status “Pending Approval” to “Approved” | Integer (hours) |
| `USER_ONBOARDING_COMPLETE_PCT` | SysAdmin / IT onboarding completion. | **Task Management** | Completed tasks tagged `OnboardingChecklist` / total onboarding tasks | Number (percentage) |
| `COSTS_VS_BUDGET` | Finance control across departments. | **Accounting** | Line-by-line comparison between actual GL postings and budget allocations | Currency |
| `CUSTOMER_SATISFACTION_SCORE` | Client service quality; typically survey-based. | **Manual / Events** | Imported survey averages (`SurveyResponses.score` or post-event CSAT) | Number (0–100 or 1–5 scale) |

> **Note:** KPI codes above are suggested canonical identifiers to add to `src/config/hardcodedKPIs.ts`. Align them with the SRD naming so downstream automation can detect the right data source.

## Implementation Checklist

1. **Update hardcoded KPI config**  
   Add `moduleSource`, `dataField`, and `dataType` metadata to each KPI in `src/config/hardcodedKPIs.ts`, using the matrix above.

2. **Persist metadata in Prisma**  
   Extend the `KPI` model (if needed) with fields for `moduleSource` and `dataField`. Regenerate the Prisma client once schema changes are applied.

3. **Backfill KPI records**  
   Write a migration script to populate existing KPI rows with the new metadata so the performance module can resolve sources automatically.

4. **Wire data fetchers**  
   - Accounting metrics → reuse income-statement services (e.g., `IncomeStatementService.generateIncomeStatement`).  
   - Portfolio metrics → leverage portfolio services (`FundService`, `InvestmentImplementationService`).  
   - Task-based metrics → query `task` / `performanceGoal` relations with relevant tags.  
   - Events & surveys → hook into events module or survey uploads.

5. **Validate end-to-end**  
   - Create sample goals per KPI.  
   - Run data sync to ensure values appear in performance dashboards.  
   - Confirm accounting-linked KPIs still produce journal entries where applicable.

## References
- Hardcoded configuration: `src/config/hardcodedKPIs.ts`
- Performance goal service: `src/services/PerformanceGoalService.ts`
- Task-to-KPI accounting hook: `src/services/TaskService.ts` (`triggerAccountingIntegration`)
- Accounting reporting services: `src/services/IncomeStatementService.ts`, `src/services/AutomatedReportingService.ts`

