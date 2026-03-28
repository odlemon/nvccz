# Chart of accounts + payroll (spec from COA images)

This document maps your **accounting spec** (payroll P&L + liabilities, revenue 4010/4020, OpEx/depreciation) to **this codebase**, and how to **seed missing accounts** on **dev** and **production**.

## 1. Accounts to have in `chart_of_accounts`

| Code | Name (as seeded) | Type | Natural balance | Payroll / module |
|------|------------------|------|-----------------|------------------|
| **5010** | Payroll Expense (Gross Pay) | Expense | DEBIT | **DR gross pay** on payroll posting (preferred) |
| **5030** | Salaries and Wages | Expense | DEBIT | **DR gross pay** if 5010 absent (legacy) |
| **2150** | PAYE Payable | Current Liability | CREDIT | **CR** PAYE on payroll posting |
| **2160** | NSSA / Pension Payable | Current Liability | CREDIT | **CR** NSSA + pension deductions |
| **2250** | Net Wages Payable | Current Liability | CREDIT | **CR** net pay; **DR** when paying staff (clearing) |
| **4010** | Management Fee Revenue | Revenue | CREDIT | Portfolio / fee income (integration) |
| **4020** | Performance Fee Revenue | Revenue | CREDIT | Performance / carry (integration) |
| **5130** | Depreciation Expense | Expense | DEBIT | Fixed assets / `runDepreciationRun` |
| **5200** / **5090** | General / Other Operating Expense | Expense | DEBIT | Vendor bills, OpEx-style costs |

**Realized FX** on payment: codebase uses **6000** / related FX expense accounts and payment logic in `MultiCurrencyService` / `recordPayment` flows — already listed in `ensure-standard-chart-of-accounts.ts`.

## 2. Seed missing accounts (idempotent)

Script: **`scripts/ensure-standard-chart-of-accounts.ts`**  
Command: **`npm run db:ensure:chart-of-accounts`**

- For each standard row: if `accountNo` **does not exist**, it **creates** it; if it exists, it **skips** (no overwrite).
- Uses **`DATABASE_URL`** from the environment (typically `.env`).

### Development

```bash
npm run db:ensure:chart-of-accounts
```

### Production

Use the **production** connection string only when you intend to touch prod:

```bash
# Windows PowerShell example
$env:DATABASE_URL="mysql://USER:PASS@PROD_HOST:3306/PROD_DB"
npm run db:ensure:chart-of-accounts
```

Do **not** use Prisma Migrate for this project’s DDL workflow; this script is the intended pattern.

## 3. Payroll → accounting logic (verified in code)

**File:** `src/services/PayrollService.ts` — `createPayrollJournalEntry`

1. **Debit** total **gross pay** to the account resolved by **`resolveSalariesAndWagesExpenseAccount`** (`src/services/payrollGlAccountResolver.ts`):
   - Prefers **5010**, then **5030**, then name-based fallbacks; will not pick arbitrary “Office Supplies”-style expenses.
2. **Credit** **2150** for categorized **PAYE** deductions (when &gt; 0).
3. **Credit** **2160** for **NSSA** + **pension** deductions (when &gt; 0).
4. **Credit** **2250** for **net pay** (adjusted if PAYE/NSSA/pension lines do not yet sum to gross).

If **2150 / 2160 / 2250** are missing, the service **attempts to create** them with **`naturalBalance: CREDIT`** (and `financialStatement: 'Balance Sheet'`).

**Paying employees:** same service uses **DR 2250**, **CR bank** (e.g. 1100) when recording wage payments — see `PayrollService` methods around Net Wages Payable / bank.

## 4. What the images implied vs this repo

| Spec (image) | In repo |
|--------------|---------|
| Gross → DR payroll expense **5010** | **5010** added to ensure script; resolver **prefers 5010** over **5030** |
| Net → CR **2250** | Implemented |
| PAYE → **2150**, NSSA/pension → **2160** | Implemented |
| Management / performance fee revenue **4010 / 4020** | Added to ensure script; portfolio modules can post to these when wired |
| OpEx (rent, salaries, utilities) via vendor bills | Salaries go through **payroll**; other OpEx via **expense / vendor** flows and GL category mapping (**5200**, **5090**, etc.) |
| Depreciation | **5130** in ensure script; asset depreciation runs use configured expense accounts |

## 4b. If `5010` is already “Office Supplies” (or other non-payroll)

Some databases created **5010** as **Office Supplies** before this spec. The payroll resolver **does not** use that row: it applies the same **Office / Suppl / Stationery** exclusion on **5010** and falls back to **5030** (or name-based payroll expense).

To align the chart with the spec long term:

1. Rename or renumber the supplies account in **Chart of Accounts** (admin / SQL), **or**
2. Create a dedicated **Payroll Expense (Gross Pay)** on a **free** expense code and keep **5030** as the primary payroll debit until **5010** is corrected.

**4010 / 4020:** If those codes already exist with different names (e.g. “Investment Gains”), the ensure script **does not overwrite** them. Add or rename accounts in COA to match **Management Fee Revenue** / **Performance Fee Revenue** if your product requires those labels on exactly **4010** / **4020**.

## 5. Quick verification queries (MySQL)

After running the ensure script:

```sql
SELECT account_no, account_name, account_type, natural_balance
FROM chart_of_accounts
WHERE account_no IN ('5010','5030','2150','2160','2250','4010','4020','5130')
ORDER BY account_no;
```

You should see all rows with **`is_active` = 1** (or equivalent).

---

**Summary:** Run **`npm run db:ensure:chart-of-accounts`** on **dev** and again with **production `DATABASE_URL`** on **prod**. Payroll posting already matches **DR gross / CR 2150+2160+2250**; gross expense now aligns with spec by preferring **5010**.
