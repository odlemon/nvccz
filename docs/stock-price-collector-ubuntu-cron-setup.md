# Stock Price Collector — Ubuntu cron setup

Operations guide for scheduling domestic scrape and retry jobs against the Arcus Stock Price Collector APIs.

## Required environment variables

Add to the application `.env` on the server:

| Variable | Purpose |
|----------|---------|
| `MARKET_DATA_CRON_SECRET` | Authenticates `POST /api/investments/market-data/cron/*` |
| `TRADE_ROUTER_CRON_SECRET` | Authenticates `POST /api/investments/trades/cron/retry-failed-routing` |
| `MARKET_DATA_WEBHOOK_SECRET` | HMAC verification for `POST /api/investments/market-data/webhooks/:providerCode` |
| `LISTED_EQUITY_AUTO_CONFIRM_STAKEHOLDER` | Optional `true` in dev/UAT only — auto-confirms broker/custodian hops |
| `LISTED_EQUITY_CUSTODIAN_ENABLED` | Set `true` when custodian PDF/email/SFTP dispatch is ready. **Default off** — internal settlement auto-completes bank + GL on execute |
| `MANSA_API_KEY` | **Required for live ZSE prices.** Without it, ZSE ingest falls back to last approved prices (`sourceStatus: FALLBACK`). |
| `MANSA_API_BASE_URL` | Optional override (default `https://mansaapi.com`) |
| `ZSE_PRICE_URL` / `VFEX_PRICE_URL` / `SECZIM_PRICE_URL` | Optional legacy scrape URLs when Mansa is not mapped for that source |
| Mansa API (ZSE) | `MansaMarketDataClient.ts` — `ZSE` uses `GET /api/v1/markets/exchanges/ZIMBABWE/stocks` |
| VFEX scrape | `VfexMarketDataClient.ts` — reads the public price sheet API used by [vfex.exchange](https://www.vfex.exchange/) (`ds88jcmqc11je.cloudfront.net/api/fetch/price-sheet?exchange=VFEX`) |
| NASDAQ scrape | [FastBull](https://www.fastbull.com/) IXIC composite + Yahoo chart API for equities (`DELAYED_15M`) |
| NYSE scrape | [Yahoo Finance](https://finance.yahoo.com/quote/%5ENYA/) `^NYA` composite + Yahoo chart for NYSE equities |
| USD/ZWG FX | Official rate scraped from [zimrate.com](https://zimrate.com/) (Statotec API fallback) |

Fallback: `CRON_SECRET` is accepted if the module-specific secret is unset.

## Timezone

Domestic market windows use **Africa/Harare (CAT)** — 09:00 open and 16:00 close.

## Crontab example

```bash
# /etc/cron.d/arcus-listed-equity

SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

MARKET_SECRET=your-market-data-cron-secret
TRADE_SECRET=your-trade-router-cron-secret
API=https://your-arcus-host/api

# 09:00 CAT domestic scrape (adjust UTC offset if server is UTC)
0 7 * * 1-5 root curl -fsS -X POST "$API/investments/market-data/cron/scrape-domestic" \
  -H "X-Market-Data-Cron-Secret: $MARKET_SECRET" >> /var/log/arcus-market-scrape.log 2>&1

# 16:00 CAT close scrape
0 14 * * 1-5 root curl -fsS -X POST "$API/investments/market-data/cron/scrape-domestic" \
  -H "X-Market-Data-Cron-Secret: $MARKET_SECRET" >> /var/log/arcus-market-scrape.log 2>&1

# Retry failed ingest every 15 minutes
*/15 * * * * root curl -fsS -X POST "$API/investments/market-data/cron/retry-failed-ingest" \
  -H "X-Market-Data-Cron-Secret: $MARKET_SECRET" >> /var/log/arcus-market-retry.log 2>&1

# Retry failed trade routing every 15 minutes
*/15 * * * * root curl -fsS -X POST "$API/investments/trades/cron/retry-failed-routing" \
  -H "X-Trade-Router-Cron-Secret: $TRADE_SECRET" >> /var/log/arcus-trade-retry.log 2>&1
```

> **Note:** Cron hours above assume the server runs in **UTC** (CAT = UTC+2). Adjust minute/hour fields if the host timezone is already `Africa/Harare`.

## systemd timer alternative

`/etc/systemd/system/arcus-market-scrape.service`:

```ini
[Unit]
Description=Arcus domestic market data scrape

[Service]
Type=oneshot
Environment=MARKET_DATA_CRON_SECRET=your-secret
ExecStart=/usr/bin/curl -fsS -X POST https://your-arcus-host/api/investments/market-data/cron/scrape-domestic \
  -H "X-Market-Data-Cron-Secret=${MARKET_DATA_CRON_SECRET}"
```

`/etc/systemd/system/arcus-market-scrape.timer`:

```ini
[Unit]
Description=Arcus market scrape 09:00 and 16:00 CAT (weekdays)

[Timer]
OnCalendar=Mon..Fri 07:00
OnCalendar=Mon..Fri 14:00
Persistent=true

[Install]
WantedBy=timers.target
```

Enable: `systemctl enable --now arcus-market-scrape.timer`

## Reverse proxy / Nginx

- Cron endpoints use **secret headers only** (no JWT). Restrict by firewall or allow only cron host IPs at the proxy if possible.
- Do not cache `POST` cron routes.

## Verify last run

```bash
curl -s -H "Authorization: Bearer $ADMIN_JWT" \
  "https://your-arcus-host/api/investments/market-data/ingest/batches" | jq '.data[0]'
```

Check `sha256Checksum`, `sourceStatus`, and `createdAt`.

## Log rotation

```bash
/var/log/arcus-market-scrape.log
/var/log/arcus-market-retry.log
/var/log/arcus-trade-retry.log
```

Use `logrotate` with weekly rotation and 52-week retention for compliance (7-year archival can be forwarded to your log aggregator).

## Database migration

On deploy:

```bash
npm run db:migrate:listed-equity-market-terminal
npx prisma generate
```

Re-run the migration script to confirm idempotency (all `[skip]` lines).
