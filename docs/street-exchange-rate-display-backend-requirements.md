# Street Exchange Rate Display — backend requirements

Design session: [`design-sessions/street-exchange-rate-display.md`](../design-sessions/street-exchange-rate-display.md)

**Status:** New module — parallel/street USD/ZWG display alongside official Zimrate.

| Item | Value |
|------|-------|
| Swagger tag | `Street Exchange Rate Display` |
| Base path | `/api/exchange-rate-display/*` |

---

## 1. Sources

| `sourceCode` | Type | Role |
|--------------|------|------|
| `ZIMRATE_STREET` | STREET | Parallel market from zimrate.com |
| `ZIMRATE_OFFICIAL` | OFFICIAL | Official rate (compare widgets) |
| `MANUAL` | MANUAL | Bridge from `exchange_rates` table |
| `INTERNAL` | INTERNAL | Company override via admin API |

**Non-goal:** Do not change `UsdZwgRateResolver` or GL conversion paths.

---

## 2. Data model

- `exchange_rate_display_sources`
- `exchange_rate_quotes` — daily time series
- `exchange_rate_display_configs` — per context widget config

Migration: `npm run db:migrate:street-exchange-rate-display`

---

## 3. API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/widget` | Widget payload by `context`, optional `from`/`to`/`asOfDate` |
| GET | `/rates/compare` | Street vs official + spread |
| GET | `/rates/history` | Historical quotes |
| GET/POST/PUT | `/configs` | Admin display configuration |
| POST | `/ingest/run` | Manual refresh |
| POST | `/quotes/manual` | Internal override |

Cron (ops): `POST /api/cron/exchange-rate-display/snapshot-refresh`

---

## 4. RBAC

| Action | Allowed |
|--------|---------|
| View widget / compare / history | Authenticated users |
| Config / ingest / manual quotes | CFO, FIN_MGR, admin |

---

## 5. Testing

- `npm run uat:exchange-rate-display:core`
- `npm run uat:exchange-rate-display:history`
- `npm run test:exchange-rate-display`
