# Fund Performance Reporting — Ubuntu cron setup

Ops-only schedule tick for **US-3.5.1**. Not exposed in Swagger.

## Endpoint

```http
POST /api/cron/fund-reporting/schedule-tick
```

## Authentication

Set `FUND_REPORTING_CRON_SECRET` (or reuse `REPORTING_REMINDERS_CRON_SECRET`) and send:

```http
X-Fund-Reporting-Cron-Secret: <secret>
```

If unset, only loopback (`127.0.0.1`) may call the route.

## Example crontab (quarterly check daily at 07:55)

```cron
55 7 * * * curl -sS -X POST "https://your-api.example.com/api/cron/fund-reporting/schedule-tick" \
  -H "X-Fund-Reporting-Cron-Secret: $FUND_REPORTING_CRON_SECRET" \
  -H "Content-Type: application/json"
```

Schedules with `nextRunAt <= now` create report runs automatically.

## Related env vars

| Variable | Purpose |
|----------|---------|
| `FUND_REPORTING_CRON_SECRET` | Cron auth |
| `FUND_REPORT_ATTACH_MAX_BYTES` | Default 10485760 (10MB) |
| `FUND_REPORT_LINK_TTL_DAYS` | Secure link expiry (default 7) |
| `FUND_REPORT_EMAIL_CONCURRENCY` | Parallel recipient processing (default 10) |
| `FUND_REPORTING_WEBHOOK_SECRET` | Optional email webhook auth |
