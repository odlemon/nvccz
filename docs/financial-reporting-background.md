# Financial Reporting Background Notes

## Core Perspective
- When the VC Fund invests in a portfolio company, it records the investment as an **Asset** on its own books.
- Portfolio companies upload their internal management accounts so the VC fund can assess performance; they do **not** write to our accounting system directly.
- The VC fund updates the **fair value** of the investment asset (and related unrealized gains/losses) based on the portfolio company’s reported results and KPI performance.

## Accounting Concepts to Respect
- **Accounting Period**: Every financial data point (KPI, revenue, valuation) must be stamped with the correct reporting period (month/quarter/etc.) to preserve historical accuracy.
- **Accrual Basis**: Management accounts are accrual-based. Revenue and expenses are recorded when earned/incurred, not when cash moves.
- **Valuation (Fair Value)**: Represents the estimated market price of the fund’s investment asset. Changes when performance or KPI data indicate a different valuation.
- **AUM (Assets Under Management)**: Sum of the fair values of all investments. Used on CIO dashboards; calculated per portfolio company.

## Portfolio Company vs. VC Fund Actions
- **Portfolio Company uploads**: PDFs, Excel data, KPI metrics—informational only.
- **VC Fund records**: Journal entries reflecting fair value changes of the investment asset.
- Fair value changes are typically recorded quarterly or annually, after the CIO/Analyst approves a new valuation document inside the PMS.

## Accounting Rules Reference
| Account Type | Represents | Increase With | Decrease With |
|--------------|------------|---------------|---------------|
| Asset        | Things the company owns (cash, property, investments) | Debit  | Credit |
| Expense      | Costs incurred (rent, salaries, marketing)            | Debit  | Credit |
| Liability    | Things the company owes (loans, bills payable)        | Credit | Debit  |
| Revenue      | Money earned from operations (sales, fees)            | Credit | Debit  |
| Equity       | Owner’s stake / retained earnings                     | Credit | Debit  |

- **Rule 1 – Balance Rule**: Total debits must equal total credits in every transaction.
- **Rule 2 – Account Type Rule**: Use the table above to determine how each account type behaves (debit vs. credit to increase/decrease balances).

## Journal Entry Patterns for Fair Value Changes
- **Investment value increases (gain)**
  - Debit: `1502 - Investment Asset`
  - Credit: `4050 - Unrealized Gain on Investment`
- **Investment value decreases (loss)**
  - Debit: `6050 - Unrealized Loss on Investment`
  - Credit: `1502 - Investment Asset`

Remember: these entries are triggered by fund-side approval of a valuation change, not merely by the data upload from the portfolio company.
