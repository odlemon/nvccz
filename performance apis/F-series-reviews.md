# F-Series: 360-Degree Reviews

## Scope

This section covers review cycle initiation, quantitative auto-population, validation rules, finalization, archived document access, and rating distribution.

## UAT Coverage

| UAT | Backend Status | Endpoints |
|---|---|---|
| F.03 Integer-only review rating scale (1–6, BSC-aligned) | Implemented | `PUT /api/performance-reviews/:id` |
| F.04 Final sign-off PDF | Implemented | `POST /api/performance-reviews/:id/finalize`, `GET /api/performance-reviews/:id/document` |
| F.05 Review cycle trigger | Implemented | `POST /api/performance-reviews/cycles/:cycleId/initiate` |
| F.06 Quantitative auto-populate | Implemented | `POST /api/performance-reviews/:id/autopopulate` |
| F.07 Qualitative min-length | Implemented | create/update performance review endpoints |
| F.08 Status progression | Implemented | create/update/finalize review endpoints |
| F.09 Historical PDF access | Implemented | `GET /api/performance-reviews/:id/document` |
| F.10 Rating distribution | Implemented | `GET /api/performance-reviews/reports/rating-distribution` |

## Endpoint Notes

- **`GET .../reports/rating-distribution`** — Registered before `GET /:id` so the path is not treated as a review id. Use query params as required by the controller (e.g. `departmentName`, `reviewPeriod`).
- `POST /api/performance-reviews/cycles/:cycleId/initiate`
  - Creates reviews and `Review Pending` tasks for employees.
- `POST /api/performance-reviews/:id/autopopulate`
  - Builds the quantitative snapshot from goals and task data.
- `POST /api/performance-reviews/:id/finalize`
  - Locks the review and generates document output.
- `GET /api/performance-reviews/:id/document`
  - Enforces document access rules and returns the saved review document.

## Request and Response Reference

- `PUT /api/performance-reviews/:id`
  - Request body:
  ```json
  {
    "managerFeedback": "Solid delivery across the cycle.",
    "scores": [
      {
        "criterion": "Results Delivery",
        "rating": 4
      }
    ]
  }
  ```
  - Success response after finalization:
  ```json
  {
    "success": true,
    "message": "Performance review finalised successfully",
    "data": {
      "id": "review-id",
      "status": "COMPLETED",
      "isLocked": true
    },
    "timestamp": "2026-03-31T08:00:00.000Z"
  }
  ```

## Postman Test Flow

1. Create or use an existing review cycle.
2. Call `POST /api/performance-reviews/cycles/:cycleId/initiate`.
3. Confirm that review tasks were created.
4. Call `POST /api/performance-reviews/:id/autopopulate`.
5. Try updating the review with invalid decimal ratings or values outside 1–6.
6. Finalize the review and fetch the document.
7. Fetch department rating distribution.

## Expected Results

- Review tasks are created for employees.
- Quantitative data is filled from goals/tasks.
- Decimal manager scores are rejected.
- Finalized reviews become locked and document retrieval works.
