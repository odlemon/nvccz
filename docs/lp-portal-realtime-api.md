# LP Portal — Realtime (WebSocket) API

**Transport:** [Socket.IO](https://socket.io/) v4 (same server as REST API)  
**Contract endpoint:** `GET /api/lp-portal/realtime`  
**Auth:** JWT in handshake — `auth: { token: "<jwt>" }` or `Authorization: Bearer <jwt>` header  
**Last updated:** 2026-07-21

The LP Portal uses **Socket.IO** (not raw WebSockets) for live updates on **notices**, **service requests**, and **message threads**. This matches the pattern used elsewhere in NVCCZ (task board, deal collaboration).

---

## Connection (frontend)

```typescript
import { io, Socket } from "socket.io-client";

const API_ORIGIN = "http://localhost:3009"; // no /api suffix
const token = "<jwt from login>";

export function connectLpPortalSocket(): Socket {
  return io(API_ORIGIN, {
    path: "/socket.io",
    auth: { token },
    transports: ["websocket", "polling"],
  });
}
```

On connect, the server automatically joins:

| Room | Scope |
|------|--------|
| `user:{userId}` | Per-user events (topbar `lp_notification`) |
| `lp_portal:{clientId}` | All active LP users on the same investor organisation |

Optional detail-room subscriptions (emit after navigation):

```typescript
socket.emit("join_lp_request", { reference: "SR-ABC123" });
socket.emit("join_lp_thread", { threadId: "thread_cuid" });

// On leave:
socket.emit("leave_lp_request", { reference: "SR-ABC123" });
socket.emit("leave_lp_thread", { threadId: "thread_cuid" });
```

After reconnect, emit `join_lp_portal` (no body) to re-assert org room membership.

---

## Events

### Notices

| Event | Rooms | When | FE action |
|-------|-------|------|-----------|
| `lp_notice_updated` | `lp_portal:{clientId}` | Notice opened or acknowledged | Refetch `GET /notices` or patch row status; refresh topbar via `lp_notification` |

**Payload example:**

```json
{
  "type": "NOTICE",
  "noticeId": "ntc_001",
  "title": "Capital Call #7 Issued",
  "status": "ACKNOWLEDGED",
  "fundId": "fund_arcus_growth_v",
  "fundName": "Arcus Growth Fund V",
  "href": "/lp-portal/notices?id=ntc_001",
  "at": "2026-07-21T12:00:00.000Z"
}
```

Status values: `OPENED`, `ACKNOWLEDGED`, `PUBLISHED`.

---

### Service requests

| Event | Rooms | When | FE action |
|-------|-------|------|-----------|
| `lp_request_created` | `lp_portal:{clientId}`, `lp_request:{reference}` | `POST /requests` | Prepend to requests table; open detail if on create flow |
| `lp_request_updated` | same | Status change, new activity | Patch list row / detail panel |
| `lp_request_message` | `lp_request:{reference}` | `POST /requests/{reference}/messages` | Append message in thread panel |

**`lp_request_created` payload** includes full `request` object plus routing fields (`reference`, `href`, `priority`, etc.).

**`lp_request_message` payload:**

```json
{
  "type": "REQUEST_MESSAGE",
  "reference": "SR-ABC123",
  "message": {
    "id": "msg_…",
    "authorType": "INVESTOR",
    "body": "Following up…",
    "attachments": [],
    "createdAt": "2026-07-21T12:00:00.000Z"
  },
  "href": "/lp-portal/requests?ref=SR-ABC123",
  "at": "2026-07-21T12:00:00.000Z"
}
```

---

### Message threads

| Event | Rooms | When | FE action |
|-------|-------|------|-----------|
| `lp_thread_message` | `lp_thread:{id}`, `lp_portal:{clientId}` | `POST /messages/{id}/replies` | Append message; update preview in thread list |
| `lp_thread_read` | `lp_thread:{id}`, `lp_portal:{clientId}` | `POST /messages/{id}/read` | Clear unread badge on thread row |
| `lp_thread_updated` | `lp_portal:{clientId}` | Thread activity summary | Refetch thread list or patch `lastMessageAt` |

---

### Topbar notification feed

| Event | Room | When | FE action |
|-------|------|------|-----------|
| `lp_notification` | `user:{userId}` | Notice/request/message activity (excludes actor) | Prepend to dropdown or refetch `GET /notifications?limit=5`; bump session `unreadCounts` |

**Payload** (compatible with notification dropdown mapper):

```json
{
  "type": "REQUEST",
  "title": "New message on request SR-ABC123",
  "href": "/lp-portal/requests?ref=SR-ABC123",
  "reference": "SR-ABC123",
  "at": "2026-07-21T12:00:00.000Z"
}
```

Types: `NOTICE`, `REQUEST`, `REQUEST_MESSAGE`, `MESSAGE`, `THREAD_MESSAGE`.

---

## Recommended FE hooks

| Screen | Subscribe | Listen |
|--------|-----------|--------|
| `lp-portal-context` / topbar | connect on login | `lp_notification` → invalidate notifications query |
| `lp-notices-screen` | org room (auto) | `lp_notice_updated` |
| `lp-requests-messages-screen` | `join_lp_request`, `join_lp_thread` on selection | `lp_request_*`, `lp_thread_*` |
| Requests list | org room (auto) | `lp_request_created`, `lp_request_updated` |

Use React Query / SWR pattern:

```typescript
socket.on("lp_request_created", () => {
  queryClient.invalidateQueries({ queryKey: ["lp-requests"] });
});

socket.on("lp_notification", (item) => {
  queryClient.setQueryData(["lp-notifications"], (old) => prependItem(old, item));
});
```

---

## REST triggers (backend)

Realtime emits are fired from:

- `GET /notices/{id}` — first open → `lp_notice_updated` (`OPENED`)
- `POST /notices/{id}/acknowledge` → `lp_notice_updated` (`ACKNOWLEDGED`)
- `POST /requests` → `lp_request_created` + `lp_notification`
- `POST /requests/{reference}/messages` → `lp_request_message` + `lp_notification`
- `POST /messages/{id}/replies` → `lp_thread_message` + `lp_notification`
- `POST /messages/{id}/read` → `lp_thread_read`

---

## UAT

```powershell
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
npm run uat:lp-portal:realtime
```

Verifies (8 checks): contract endpoint, signatory + viewer connect, `lp_request_created`, `lp_request_message`, `lp_notification` (viewer, excludes actor), `lp_thread_message`, and notice open when an unacked notice exists.

---

## Related docs

- [`lp-portal-fe-gaps-api.md`](./lp-portal-fe-gaps-api.md) — REST gap closure
- [`lp-portal-api.md`](./lp-portal-api.md) — full REST catalogue
