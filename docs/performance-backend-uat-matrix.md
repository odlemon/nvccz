# Performance Backend UAT Matrix

This matrix audits the attached `Performance Management UAT Script.docx` against the backend-only scope that was requested for the performance module.

Status legend:
- `Implemented`: backend logic is present in the performance module.
- `Out of Scope`: frontend, Firestore, browser UX, infrastructure, or shared-auth concern outside this backend closure scope.
- `Blocked`: backend code is in place, but the environment prevents final enforcement.

## A-Series

| UAT | Status | Backend evidence |
|---|---|---|
| A.01 Hardcoded BSC pillars | Implemented | Fixed pillars and exact-100 validation in `src/services/performanceBackendSupport.ts` and `src/services/PerformanceConfigService.ts` |
| A.02 Strategy PDF upload | Implemented | Stored strategy PDF path via `POST /api/performance/config/strategies/:id/document` in `src/services/PerformanceConfigService.ts` |
| A.03 Goal-to-pillar mapping | Implemented | Goal scorecard config updates in `src/services/PerformanceConfigService.ts` |
| A.04 Multi-year strategy support | Implemented | Strategy period validation allows multi-year ranges in `src/services/PerformanceConfigService.ts` |
| A.05 Pillar weighting totals | Implemented | `validateFixedPillarSet` in `src/services/performanceBackendSupport.ts` |
| A.06 Goal weighting within pillar totals | Implemented | Goal-weight validation in `src/services/PerformanceConfigService.ts` |
| A.07 Vision statement display data | Implemented | Strategy/contract vision returned through org BSC in `src/services/PerformanceScorecardService.ts` |
| A.08 Strategic theme tagging | Implemented | Theme CRUD plus goal tagging in `src/services/PerformanceConfigService.ts` |
| A.09 Long-form objective description | Implemented | Goal description persistence exists in `src/routes/performanceGoalRoutes.ts` and `src/services/PerformanceGoalService.ts` |
| A.10 Archive old strategies | Implemented | Strategy archive and read-only enforcement in `src/services/PerformanceConfigService.ts` |

## B-Series

| UAT | Status | Backend evidence |
|---|---|---|
| B.01 Manual sync via bearer token | Implemented | `src/services/PerformanceIntegrationService.ts` |
| B.02 IRR precision fetch | Implemented | 6-decimal normalization and precision fields in `src/services/PerformanceIntegrationService.ts` |
| B.03 Background worker update path | Implemented | Goal tracking check/schedule endpoints in `src/routes/enhancedGoalTrackingRoutes.ts` execute `checkGoalStatus` and persist goal values |
| B.04 Internal source path `/v1/` enforcement | Implemented | Guard in `src/services/PerformanceIntegrationService.ts` validates the request body's internal sync target, not the public API route |
| B.05 Exponential backoff | Implemented | Retry schedule in `src/services/performanceBackendSupport.ts` and `src/services/PerformanceIntegrationService.ts` |
| B.06 Sync error logging | Implemented | `performance_sync_jobs` plus structured error persistence |
| B.07 Currency/integer to decimal transform | Implemented | `normaliseSyncedDecimal` and precise goal fields |
| B.08 Manager-only override with comment | Implemented | Override enforcement in `src/services/PerformanceIntegrationService.ts` |
| B.09 Bulk KPI import | Implemented | XLSX/CSV import path in `POST /api/performance/integration/import` |
| B.10 JWT token expiry refresh | Out of Scope | Shared authentication/session flow, not performance-module backend logic |
| B.11 IRR fetch from internal modules | Implemented | Same sync pipeline as B.01/B.02 |
| B.12 AUM sync into PM KPI | Implemented | `POST /api/performance/integration/sync-pe-portfolio-aum` + `PerformanceIntegrationService.runPePortfolioAumSync` reads `DataIntegrationService.calculateAUM()` (fund `totalAmount` sum); UAT: `npm run test:uat:performance-b12-aum-realtime-sync` |
| B.15 Turnover-rate source integration | Implemented | `POST /api/performance/integration/sync-payroll-turnover-rate` + `DataIntegrationService.calculatePayrollEmployeeTurnoverMetrics()` (`Employee.isActive`); UAT: `npm run test:uat:performance-b15-payroll-turnover` |
| B.17 Project completion rate integration | Implemented | Linked tasks (`goalId`) roll up via `TaskService.updateLinkedGoalProgress` / `recalculateGoalProgressFromTasks` on `PUT /api/tasks/:id/stage` and `PUT /api/tasks/bulk/stage`; `isPerformanceTask` defaults true when a goal is linked on create |
| B.18 Exponential backoff on internal APIs | Implemented | Same retry pipeline as B.05 |

## C-Series

| UAT | Status | Backend evidence |
|---|---|---|
| C.01 Individual to department roll-up | Implemented | `src/services/PerformanceScorecardService.ts`, `src/services/TaskService.ts`, `src/services/RollupCalculationService.ts` |
| C.02 Department to org roll-up | Implemented | `src/services/PerformanceScorecardService.ts` |
| C.03 Weighted math validation | Implemented | Weighted helpers in `src/services/performanceScorecardSupport.ts` and `src/services/performanceBackendSupport.ts` |
| C.04 High-stakes approval exclusion | Implemented | Pending-approval sync logic in `src/services/PerformanceIntegrationService.ts` and scorecard exclusion in `src/services/PerformanceScorecardService.ts` |
| C.05 Amber zone trigger | Implemented | Status escalation in `src/services/performanceScorecardSupport.ts` and org BSC rendering |
| C.06 Red zone trigger | Implemented | Red-zone escalation path in scorecard/goal-status logic |
| C.07 Null handling without NaN | Implemented | Safe numeric helpers in `src/services/performanceScorecardSupport.ts` |
| C.08 Multi-parent roll-up | Implemented | KPI-linked parent propagation already supported in performance goal roll-up paths |
| C.09 Cap >100 unless stretch enabled | Implemented | `computeGoalProgress` in `src/services/performanceScorecardSupport.ts` |
| C.10 Reverse KPI logic | Implemented | `computeGoalProgress` and `computeRawRating` in `src/services/performanceScorecardSupport.ts` |

## D-Series

| UAT | Status | Backend evidence |
|---|---|---|
| D.01 State persistence after refresh | Implemented | Task stage is persisted in the `tasks` table and returned by `src/services/TaskService.ts` |
| D.02 Unlinked tasks allowed with no scorecard effect | Implemented | Task create/update accepts null goal link; roll-ups only fire for linked goals |
| D.03 Drag-and-drop UX | Out of Scope | Frontend UX |
| D.04 Task assignment notification | Implemented | Notification creation in `src/services/TaskService.ts` |
| D.05 Bulk status update recalculates once | Implemented | `bulkUpdateTaskStage` in `src/services/TaskService.ts` |
| D.06 Historical deadlines and red-zone flagging | Implemented | Existing task overdue fields plus performance status escalation |
| D.07 Linked task deletion recalculates parent goal | Implemented | `bulkTrashTasks` in `src/services/TaskService.ts` |
| D.08 Supported task status list | Implemented | `GET /api/tasks/status-options` via `src/services/TaskCollaborationService.ts` |
| D.09 Description editing persistence | Implemented | Task description updates are persisted via `src/services/TaskService.ts` |
| D.10 Attachment upload support | Implemented | `POST /api/tasks/:id/attachments` via `src/services/TaskCollaborationService.ts` |

## E-Series

| UAT | Status | Backend evidence |
|---|---|---|
| E.01 Mention suggestions | Implemented | `GET /api/tasks/:id/mention-suggestions` in `src/services/TaskCollaborationService.ts` |
| E.02 Mention notification entry | Implemented | Mention notifications written to `notifications` in `src/services/TaskCollaborationService.ts` |
| E.03 Task chat persistence | Implemented | Task comments/system messages persisted in `activity_logs` through `src/services/TaskCollaborationService.ts` |
| E.04 Shared task conversation backend | Implemented | Comment read/write endpoints in `src/services/TaskCollaborationService.ts`; client transport is outside backend scope |
| E.05 Notification queue persistence | Implemented | Multiple notification records can be created and read through `src/controllers/HomepageController.ts` |
| E.06 Notification mark-as-read | Implemented | Existing notification read/update endpoints in `src/controllers/HomepageController.ts` |
| E.07 Red-zone task email/notification | Implemented | Red-zone alert creation in `src/services/TaskCollaborationService.ts` and task stage hooks in `src/services/TaskService.ts` |
| E.08 Comment deletion | Implemented | Comment soft-delete flow in `src/services/TaskCollaborationService.ts` |
| E.09 System messages on task status changes | Implemented | Automatic system messages from `src/services/TaskService.ts` via `src/services/TaskCollaborationService.ts` |
| E.10 Notification deep-link payload | Implemented | Task deep-link data stored on notifications in `src/services/TaskCollaborationService.ts` |

## F-Series

| UAT | Status | Backend evidence |
|---|---|---|
| F.03 Integer-only manager scale | Implemented | `validateManagerRatings` and review payload validation |
| F.04 Final sign-off PDF | Implemented | PDF generation and review locking in `src/services/PerformanceReviewService.ts` and `src/services/performanceDocumentRenderer.ts` |
| F.05 Review cycle trigger (remind reviewees) | Implemented | `initiateCycleForAllEmployees`: emails reviewees with manager-created reviews in cycle window who have not started self-assessment; links `cycleId` when null. No bulk review/task creation. |
| F.06 Quantitative auto-populate | Implemented | `autopopulateQuantitativeSnapshot` in `src/services/PerformanceReviewService.ts` |
| F.07 Qualitative minimum length | Implemented | `validateQualitativeFeedbackMinimum` enforcement |
| F.08 Status progression | Implemented | `resolveReviewWorkflowStatus` and review service updates |
| F.09 Historical PDF access | Implemented | `GET /api/performance-reviews/:id/document` |
| F.10 Rating distribution report | Implemented | `getDepartmentRatingDistribution` in `src/services/PerformanceReviewService.ts` |

## G-Series

| UAT | Status | Backend evidence |
|---|---|---|
| G.01 Employee redirect to personal scorecard | Out of Scope | Frontend routing |
| G.02 Firestore cross-dept rule enforcement | Out of Scope | Firestore/shared auth rules |
| G.03 AES-256 at rest | Out of Scope | Infrastructure/storage |
| G.04 PII masking in peer list UI | Out of Scope | Frontend/view-model concern |
| G.05 JWT tampering returns 401 | Implemented | `src/middleware/authenticate.ts` |
| G.06 SysAdmin MFA | Out of Scope | Shared auth/infrastructure |
| G.07 Session timeout | Out of Scope | Shared auth/session layer |
| G.08 Password complexity | Out of Scope | Shared auth/user module |
| G.09 Role-change audit logging | Out of Scope | Shared user/role module, not performance backend |
| G.10 Review document permission | Implemented | `assertPerformanceReviewAccess`: reviewee always; reviewer / line manager only if same department as reviewee (FK or name/userDepartment). CEO / HR / sysadmin / role admin bypass. Applies to get/update/delete/complete-stage/autopopulate/finalize/document; create enforces reviewer–reviewee dept unless bypass. |

## H-Series

| UAT | Status | Backend evidence |
|---|---|---|
| H.01 1-second modal interaction | Out of Scope | Frontend performance |
| H.02 50k-user load test | Out of Scope | Non-functional infrastructure/load testing |
| H.03 KPI target change log with reason | Implemented | Goal config update audit in `src/services/PerformanceConfigService.ts` |
| H.04 Immutable audit log via DB trigger | Blocked | Trigger script exists in `scripts/run-performance-uat-backend-migration.ts`, but the current MySQL user lacks privilege to create triggers |
| H.06 99.9% uptime | Out of Scope | Infrastructure/SRE |
| H.07 Database failover | Out of Scope | Infrastructure/SRE |
| H.08 `/docs` auto-generated docs | Implemented | Swagger docs are exposed from both `/api-docs` and `/docs` in `src/app.ts` |
| H.09 Multi-currency math before roll-up | Implemented | Precise sync normalization and goal precision fields |
| H.10 Restore from backup | Out of Scope | Infrastructure/operations |
