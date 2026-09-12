# Departments API

`GET /api/departments` — list org departments for pickers (FP&A budget owners, etc.).

| | |
|---|---|
| **Base** | `{host}/api` |
| **Auth** | `Authorization: Bearer {token}` |

---

## List — `GET /departments` → **200**

Query: `includeInactive=true` to include inactive rows (default: active only).

```json
{
  "success": true,
  "data": [
    {
      "id": "cm…",
      "name": "Finance",
      "description": "Finance Department",
      "branch": null,
      "isActive": true
    }
  ],
  "count": 9
}
```

Use `data[].id` as `owners[].departmentId` on `POST /v1/fpa/budget-cycles`.  
Do not pass a display name (`"Finance"`) as `departmentId` — that returns `UNKNOWN_DEPARTMENT`.

If the `departments` table is empty, the first call seeds the standard catalog (Finance, Sales, Operations, Procurement, Human Resources, Marketing, Legal, IT, Investments).

---

## Get one — `GET /departments/{id}` → **200**

```json
{ "success": true, "data": { "id": "cm…", "name": "Finance", "…" } }
```

**404** if missing.

---

## Related

- Budgeting: [fpa-budgeting-api.md](./fpa-budgeting-api.md)
- Note: `GET /api/hardcoded-roles/departments` returns name/code only (no DB ids) — use this endpoint for cuid ids.
