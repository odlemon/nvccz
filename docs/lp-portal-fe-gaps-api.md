# LP Portal — FE gaps API (2026-07-21)

**Base URL:** `/api/lp-portal`  
**Seed (DEV nts):** `npm run db:seed:lp-portal-srd`  
**Migration:** `npm run db:migrate:lp-portal-fe-gaps`  
**UAT:** `npm run uat:lp-portal:fe-gaps`  
**Realtime:** [`lp-portal-realtime-api.md`](./lp-portal-realtime-api.md) · `npm run uat:lp-portal:realtime`

Closes the 27 backend gaps wired by the LP Portal frontend (`lib/api/lp-portal-api.ts`).

---

## Realtime (WebSocket)

Notices, requests, and message threads push live updates via **Socket.IO**. See **[`lp-portal-realtime-api.md`](./lp-portal-realtime-api.md)** for connection setup, room subscriptions, event names, and FE hook guidance.

| REST action | Socket event |
|-------------|--------------|
| Notice open / acknowledge | `lp_notice_updated` |
| Create request | `lp_request_created` |
| Reply on request | `lp_request_message` |
| Reply on message thread | `lp_thread_message` |
| Mark thread read | `lp_thread_read` |
| Topbar invalidation | `lp_notification` (per user) |

Contract: `GET /api/lp-portal/realtime`

---

## Summary of changes

| # | Gap | Endpoint(s) | Status |
|---|-----|-------------|--------|
| 1 | Notice category/kind + fundName | `GET /notices`, `GET /notices/{id}` | **DONE** |
| 2 | Request attachments on create | `POST /requests/attachments`, `POST /requests` | **DONE** |
| 3 | Request list priority/submitter/attachments | `GET /requests`, `GET /requests/{reference}` | **DONE** |
| 4 | Thread participants + reply attachments | `GET /messages/{id}`, reply endpoints | **DONE** |
| 5 | In-app notification prefs | `GET/PATCH /settings` | **DONE** |
| 6 | Digest, display currency, as-of default | `PATCH /settings/notifications`, `PATCH /settings/display` | **DONE** |
| 7 | MFA manage / password | `GET /settings/mfa` → `manageUrls` | **DONE** (deep-link to `/api/auth/*`) |
| 8 | Colleague MFA + last active | `GET /organisation`, `GET /colleagues` | **DONE** |
| 9 | Bank instruction changes | `GET/POST /bank-instructions/changes` | **DONE** |
| 10 | Colleague invite role/fund | `POST /colleagues` | **Already done** |
| 11 | Notification dropdown feed | `GET /notifications?limit=5` | **DONE** |
| 12 | Dashboard open-ended NAV history | `GET /dashboard` → `openEndedHistory.points[]` | **DONE** |
| 13 | Dashboard action amount/fundName/label | `GET /dashboard/actions` | **DONE** |
| 14 | Capital activity KPI summary | `GET /capital-calls/summary` | **DONE** |
| 15 | Benchmark selector + open-ended metrics | `GET /performance`, `GET /performance/benchmarks?benchmarkId=` | **DONE** |
| 16 | Performance by fund structure | `GET /performance/by-fund` | **DONE** |
| 17 | Dealing fundName on list | `GET /dealing/requests` | **DONE** |
| 18 | Dealing shareClass on list | `GET /dealing/requests` | **DONE** |
| 19 | Subscriptions history export | `GET /dealing/requests/export?format=csv` | **DONE** |
| 20 | Account activity structure | `GET /account-activity` | **DONE** |
| 21 | Ledger linked documents | `GET /ledger/{entryId}` → `documents[]` | **DONE** |
| 22 | Account activity date range | `GET /account-activity?from=&to=` | **Already done** |
| 23 | Document per-category counts | `GET /documents/summary` | **DONE** |
| 24 | Document centre KPI strip | `GET /documents/summary` | **DONE** |
| 25 | Document file metadata | `GET /documents`, `GET /documents/{id}` | **DONE** |
| 26 | Document preview | `GET /documents/{id}/preview` | **DONE** (415 for unsupported mime) |
| 27 | Estimate snapshot TTL on submit | `POST /dealing/subscriptions`, `POST /dealing/redemptions` | **DONE** |

---

## New / extended endpoints

### `POST /api/lp-portal/requests/attachments`

Multipart upload. Returns `{ id, name, size, mimeType, downloadUrl }` for use in `attachmentIds` on create/reply.

### `GET /api/lp-portal/notifications?limit=5`

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "notif_notice_ntc_001",
        "type": "NOTICE",
        "title": "Capital Call #7 Issued",
        "fundName": "Arcus Growth Fund V, L.P.",
        "href": "/lp-portal/notices?id=ntc_001",
        "createdAt": "2026-07-01T12:00:00.000Z"
      }
    ]
  }
}
```

### `GET /api/lp-portal/documents/summary`

```json
{
  "success": true,
  "data": {
    "total": 42,
    "newThisWeek": 3,
    "requiresSignature": 0,
    "secureDownloadsYtd": 18,
    "byCategory": [
      { "category": "PERFORMANCE_REPORT", "count": 12 },
      { "category": "LEGAL", "count": 8 }
    ]
  }
}
```

### `GET /api/lp-portal/dealing/requests/export?fundId=&type=&format=csv`

Returns CSV blob with columns: `id,fundName,shareClass,requestType,status,amount,units,createdAt`.

### `GET/POST /api/lp-portal/bank-instructions/changes`

List/create bank instruction change requests. POST is MFA-gated when `requireMfaForLp` policy is on.

### `PATCH /api/lp-portal/settings/display`

```json
{
  "presentationCurrency": "USD",
  "defaultAsOfPreference": "LATEST"
}
```

### Extended notice shape

```json
{
  "id": "n-1",
  "title": "Capital Call #7 Issued",
  "category": "CAPITAL_CALL",
  "kind": "CAPITAL_CALL",
  "fundId": "gf-v",
  "fundName": "Arcus Growth Fund V, L.P.",
  "requiresAcknowledgement": true
}
```

### Estimate snapshot validation

- Estimates persist to `lp_dealing_estimate_snapshots` (15-minute TTL).
- Submit requires valid `estimateSnapshotId`; expired/missing → `409 LP_ESTIMATE_EXPIRED` with `fieldErrors.estimateSnapshotId`.

---

## Acceptance checklist

1. Notices list/detail show `category` + `fundName`; acknowledge works.
2. Upload attachment → create request with `attachmentIds` → list shows attachments + priority.
3. Thread detail includes `participants[]`; replies accept `attachmentIds`.
4. Settings GET/PATCH persist email + in-app toggles, digest, currency, as-of preference.
5. Organisation colleagues show `mfaEnabled`, `lastActiveAt`.
6. Bank instruction list/create returns data; POST blocked without MFA when policy requires it.
7. Topbar notification feed from `GET /notifications`.
8. Dashboard includes `openEndedHistory.points[]`; actions include `amount`, `fundName`, `label`.
9. Capital summary includes `paidCallCount`, `dueSoonCount`, `upcomingDistributionNotices`.
10. Performance benchmarks accept `benchmarkId`; by-fund rows include `structure`/`operatingModel`.
11. Dealing history shows `fundName`, `shareClass`; export CSV downloads.
12. Account activity rows include `structure`; ledger detail includes `documents[]`.
13. Document summary powers KPI strip + category badges; list/detail include file metadata.
14. PDF preview inline; non-PDF returns `415 LP_UNSUPPORTED_MEDIA`.
15. Subscription/redemption submit validates estimate snapshot TTL.
