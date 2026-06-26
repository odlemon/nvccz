# Street Exchange Rate Display — frontend design session

Wire screens to [`docs/street-exchange-rate-display-backend-requirements.md`](../docs/street-exchange-rate-display-backend-requirements.md).

**API:** `/api/exchange-rate-display/*` — Swagger tag **Street Exchange Rate Display**.

---

## 1. Purpose

Configurable FX widget showing **street (parallel) USD/ZWG** alongside **official** Zimrate, with bid/ask, spread, % change, and historical chart. Display-only — accounting conversions remain on official/manual paths.

### Who uses it

| Role | Tasks |
|------|-------|
| Fund manager / analyst | View street vs official on portfolio dashboard |
| CFO / finance | Configure contexts, refresh rates, review history |
| LP viewer | See presentation-rate context when ZIG selected |
| Admin | Manage display configs and manual overrides |

---

## 2. Widget tile (dashboard embed)

```text
+------------------------------------------+
| USD / ZWG          As of 17 Jun 2026     |
| Street rate        32.50 ZiG per 1 USD   |
| Official           30.00                 |
| Spread             +2.50 (+8.3%)         |
| Bid / Ask          32.40 / 32.60         |
+------------------------------------------+
```

Stale indicator when last fetch exceeds threshold.

---

## 3. Compare view

Side-by-side official vs street for selected date; sparkline from history API.

---

## 4. Admin — display configs

Table of contexts (`DASHBOARD_ACCOUNTING`, `DASHBOARD_PORTFOLIO`, `LP_PORTAL`, etc.) with primary/comparison source and format JSON.

---

## 5. API handoff

| Item | Value |
|------|-------|
| Swagger tag | `Street Exchange Rate Display` |
| Base path | `/api/exchange-rate-display/*` |
| Main widget | `GET /widget?context=DASHBOARD_ACCOUNTING` |
