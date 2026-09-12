# Short-term investments — new instrument form (field labels for users)

Use this to **rename labels** and **helper text** so non-accountants know what to enter. Wording below is **suggested copy** for the frontend only.

---

## Screen 1 — “New investment instrument” (details & timeline)

| # | Label on the form (today) | Suggested label (rename to) | What the user is really providing |
|---|---------------------------|-----------------------------|-------------------------------------|
| 1 | Instrument name | **Investment name** | A short name you’ll recognize on reports (e.g. fund or note name). |
| 2 | Category | **Type of investment** | What kind of product it is (e.g. money market, commercial paper). |
| 3 | Broker / Financial institution | **Who holds or sold the investment** | Bank, fund manager, or broker name. |
| 4 | Principal amount | **Amount invested** | How much money is placed in this instrument (in the currency below). |
| 5 | Currency | **Investment currency** | The currency this investment is denominated in. |
| 6 | Functional currency (if multi-currency) | **Reporting currency (optional)** | Only if you report results in a **different** currency than the investment; otherwise leave as same as investment currency or empty. |
| 7 | Annual percentage yield (APY) | **Expected yearly return (APY)** | Annual rate. Say clearly in helper: e.g. “Enter **5** for 5%, or **0.05** for 5% — whichever your org uses.” |
| 8 | Compounding method | **How interest builds up** | Simple = interest on principal only; compound = interest can earn interest (pick the option that matches the product). |
| 9 | Day count convention | **Interest day-count rule** | Technical rule for how days in a year are counted (e.g. Actual/365). Default to what your product uses if unsure. |
| 10 | Start date | **Investment start date** | First day this investment is on the books / interest starts. |
| 11 | Maturity date | **End / maturity date** | When the investment matures or is due (last day of the term). |

**Button:** “Next: GL mappings” → consider renaming to **“Next: accounting setup”** or **“Next: where to record in the books”** so users aren’t scared by “GL.”

---

## Screen 2 — “GL account mappings”

| # | Label on the form (today) | Suggested label (rename to) | What the user is really choosing |
|---|---------------------------|-----------------------------|-----------------------------------|
| 1 | Settlement cash account | **Bank or cash account that receives principal & pays out** | The **bank account** in Arcus used for this investment’s cash movements (not an abstract “settlement” term). |
| 2 | Principal asset account | **Balance sheet account for the money invested** | Where the **face amount** of the investment sits on the balance sheet until repaid. |
| 3 | Accrued interest receivable | **Interest earned but not yet received** | Account that holds **accrued interest** you’ve earned but haven’t been paid yet. |
| 4 | Interest income account | **Profit & loss account for interest income** | Where **interest revenue** is recognized in the income statement. |
| 5 | Negative yield expense account | **Expense if the investment loses value / charges fees** | Used when yield is **negative** or principal can be eroded — charges hit this expense account. |
| 6 | Unrealized FX gain/loss account | **Unrealized foreign-exchange gains or losses (optional)** | Only when you report in another currency: **paper** FX movements before cash is taken. |
| 7 | Realized FX gain/loss account | **Realized foreign-exchange gains or losses (optional)** | Only when you report in another currency: FX when positions are **closed or settled** in cash. |

**Screen title:** “GL account mappings” → consider **“Where should this investment appear in your accounts?”** or **“Accounting accounts (recommended presets if available).”**

**Subtitle:** “Map the instrument to the correct general ledger accounts” → consider **“Pick the accounts Arcus should use when recording cash, interest, and FX for this investment.”**

---

## Optional one-line helpers (under fields)

- **APY:** “This is the annual rate used to calculate interest accruals.”
- **Principal asset vs settlement bank:** “**Bank** = where cash moves; **principal asset** = where the investment balance is held on the balance sheet.”
- **FX rows:** “Only needed if **reporting currency** differs from **investment currency**.”
