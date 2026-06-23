# LP Portal — Ubuntu cron setup

Nightly metric snapshot refresh for responsive LP dashboards.

## Endpoint

```bash
POST /api/cron/lp-portal/snapshot-refresh
```

No auth in v1 — restrict by firewall or reverse-proxy IP allowlist (same pattern as fund reporting cron).

## Crontab example

```cron
0 2 * * * curl -sS -X POST http://127.0.0.1:3009/api/cron/lp-portal/snapshot-refresh >> /var/log/arcus/lp-portal-snapshot.log 2>&1
```

## npm

- Migration: `npm run db:migrate:lp-portal`
- UAT: `npm run uat:lp-portal:core`
