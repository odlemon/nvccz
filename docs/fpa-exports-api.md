# FP&A Exports / Reports API

**Date:** 2026-07-16  
**Status:** Implemented  

## Create

```http
POST /api/v1/fpa/exports/board-pack
```

```json
{
  "modelId": "mdl_…",
  "versionId": "ver_…",
  "exportType": "BOARD_PACK",
  "period": "2026-Q2"
}
```

### Supported `exportType`

| Type | Notes |
|------|--------|
| `BOARD_PACK` | Full cell workbook |
| `MANAGEMENT_REPORT` | Same generator, labeled |
| `FINANCIAL_STATEMENTS` | Filtered to key statement lines |
| `DEPT_EXPENSES` | Dept-scoped expense lines |

Unknown → `400` `UNSUPPORTED_EXPORT_TYPE`.

## Capabilities

```http
GET /api/v1/fpa/exports/capabilities
```

Returns all four canonical export codes and their `enabled` state.

## List recent jobs

```http
GET /api/v1/fpa/exports?modelId=&limit=20
```

Status `COMPLETED` is returned as `READY` for FE.

## Download

```http
GET /api/v1/fpa/exports/{exportId}
GET /api/v1/fpa/exports/{exportId}/download
```

| Code | When |
|------|------|
| `UNSUPPORTED_EXPORT_TYPE` | Bad type |
| `EXPORT_NOT_READY` | Job not completed |
| 404 | Unknown job |

**UAT:** `npm run uat:fpa:exports`
