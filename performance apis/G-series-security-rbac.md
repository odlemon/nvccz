# G-Series: Security, RBAC & Privacy

## Scope

This section documents backend access-control behavior for performance data.

## UAT Coverage

| UAT | Backend Status | Endpoints |
|---|---|---|
| G.01 Employee admin redirect | Frontend routing concern | not a performance backend route |
| G.02 Cross-department access blocking | Implemented | scorecard, task collaboration, and review document endpoints |
| G.03 Data-at-rest encryption | Infrastructure concern | outside module code |
| G.04 PII masking in peer list UI | UI concern | outside module API surface |
| G.05 Token tampering returns 401 | Implemented | all authenticated performance endpoints |
| G.06 SysAdmin MFA | Shared auth concern | outside performance module |
| G.07 Session timeout | Shared auth concern | outside performance module |
| G.08 Password complexity | Shared auth concern | outside performance module |
| G.09 Role-change audit logging | shared user/role concern | outside performance module |
| G.10 Review document permission | Implemented | `GET /api/performance-reviews/:id/document` |

## Endpoint Notes

- `GET /api/performance/scorecards/employee/:employeeId`
  - Restricted to the employee, direct manager, CEO, and HR.
- `GET /api/performance/scorecards/department/:department`
  - Restricted to department manager, CEO, HR, M&E head, and compliance head.
- `GET /api/performance-reviews/:id/document`
  - Restricted to owner, reviewer/direct manager, HR, and CEO.
- `GET /api/tasks/:id/comments`
  - Denies access for users outside the task scope.

## Postman Test Flow

1. Call employee scorecard endpoints as the owner and as an unrelated user.
2. Call department scorecard endpoints as the correct and incorrect department manager.
3. Attempt to fetch another user’s review document.
4. Attempt to read task comments on a task outside your scope.

## Expected Results

- Unauthorized actors receive access denied / forbidden responses.
- Valid actors can access only their allowed slice of performance data.
