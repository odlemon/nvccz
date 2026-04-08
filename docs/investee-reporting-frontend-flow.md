# Investee Reporting (Frontend user story)

This doc is a **frontend user story** for the investee reporting flow. It tells the frontend **what screen/action happens next** and **which endpoint to call**.

Request/response schemas (and example payloads) live in **Swagger**. Do not duplicate request bodies here.

## Actors

- **Investee (Applicant)**: uploads reporting documents and submits a reporting period for review.
- **Investor/Admin (NVCCZ staff)**: reviews submitted reports.

## Conventions

- API base like `http://localhost:3009/api`
- JWT: `Authorization: Bearer <JWT>`

## Step 0 — Admin opens a reporting period (prerequisite)

- **POST** `/api/portfolio-companies/reporting/requests`

## Step 1 — Investee sees what’s due (open requests)

- **GET** `/api/applicant/reporting/requests`

## Step 2 — Investee uploads documents for the period

- **POST** `/api/applicant/financial-reports`

Optional (templates):

- **GET** `/api/applicant/financial-reports/template/:reportType`

## Step 3 — Investee views “My reports”

- **GET** `/api/applicant/financial-reports?page=1&limit=50`

## Step 4 — Investee submits the reporting period for review

Any one uploaded report can be used as the submit “anchor”. Supported submit endpoints:

- **POST** `/api/applicant/financial-reports/submit`
- **POST** `/api/applicant/financial-reports/submit/:reportId`
- **POST** `/api/applicant/financial-reports/:reportId/submit`

## Step 5 — Investor/Admin lists company submissions

- **GET** `/api/portfolio-companies/:portfolioCompanyId/financial-reports?page=1&limit=50`

## Step 6 — Investor/Admin reviews a submitted report

- **POST** `/api/portfolio-companies/:portfolioCompanyId/financial-reports/:reportId/review`

## Step 7 — Investor/Admin views portfolio dashboard (optional)

- **GET** `/api/portfolio/dashboard`

