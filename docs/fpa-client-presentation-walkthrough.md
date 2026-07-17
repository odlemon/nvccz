# FP&A Client Presentation Walkthrough

## Presentation environment

- Database: DEV `nts`
- Primary model: Arcus Group FY2026 Integrated Plan
- Currency: USD
- Planning horizon: January to December 2026
- Actuals cutoff: June 2026
- Forecast period: July to December 2026

The dataset uses existing professional users, departments, forecast entities, and accounting masters. Shared accounting and company records were preserved during the reset.

## Recommended presentation flow

1. Open FP&A Home and select **Arcus Group FY2026 Integrated Plan**.
2. Show the 12 month revenue and expense trend, KPI cards, workflow progress, recent activity, and upcoming tasks.
3. Open Model Planning and compare:
   - Management Base Case
   - Accelerated Growth
   - Market Resilience
   - Strategic Investment
4. Move through Revenue, Workforce, Operating Expenses, and Cash. Change the entity filter to demonstrate distinct server-calculated values.
5. Open Variance Analysis. Show January to June actuals, material variances, management commentary, corrective actions, and threaded finance responses.
6. Open Rolling Forecast. Explain that June is the actuals cutoff and July begins the driver-based forecast.
7. Open Model Planning Cycles and show the complete lifecycle:
   - Draft
   - Open
   - Submitted
   - Under review
   - Returned for correction
   - Approved
   - Locked
8. Open Budget Planning and show open input, returned correction, CFO review, and locked history.
9. Open Settings. Show the 5 percent commentary threshold, approval workflow controls, connected finance sources, and disconnected NetSuite source.
10. Open Exports and download the Board Pack, Management Report, Financial Statements, and Department Expenses workbooks.

## Presentation narrative

Arcus Group is managing its FY2026 operating plan across multiple entities and departments. Revenue is driven by client mandates, recurring advisory fees, and project activity. Workforce and operating costs respond to the selected scenario. Finance has loaded six months of actuals, reviewed material variances, and prepared a driver-based outlook for the remaining six months.

The lifecycle examples are separate records, so every workflow state is visible without changing presentation data during the meeting. The locked cycle also demonstrates that approved planning data cannot be edited.

## Data coverage

- 10 planning versions
- 4 scenarios
- 2 forecast entities
- 4 departments
- 20,160 planning cells
- 288 actual snapshots
- 60 driver records
- 36 variance results
- 7 Model Planning lifecycle cycles
- 4 Budget lifecycle cycles
- 4 downloadable XLSX exports

## Verification

Run:

```powershell
npm run verify:fpa:presentation
```

The final DEV verification passed 25 of 25 checks. It covers authentication, model and dimensional coverage, Home, all domain tabs, entity filters, sensitivity, variance, rolling forecast, settings, exports, locked write rejection, professional visible text, and preservation of shared master data.
