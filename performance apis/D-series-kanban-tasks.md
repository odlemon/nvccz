# D-Series: Kanban & Task Management

## Scope

This section covers backend task creation, stage persistence, linked-goal recalculation, attachments, and supported status values.

## UAT Coverage

| UAT | Backend Status | Endpoints |
|---|---|---|
| D.01 State persistence | Implemented | `POST /api/tasks`, `PUT /api/tasks/:id/stage`, `GET /api/tasks/:id` |
| D.02 Task without goal link | Implemented | `POST /api/tasks` |
| D.03 Rapid status movement backend persistence | Implemented | `PUT /api/tasks/:id/stage`, `PUT /api/tasks/bulk/stage` |
| D.04 Task assignment | Implemented | `POST /api/tasks`, `PUT /api/tasks/:id`, `GET /api/homepage/notifications` |
| D.05 Bulk status update | Implemented | `PUT /api/tasks/bulk/stage` |
| D.06 Historical deadline validation | Implemented | `POST /api/tasks`, `PUT /api/tasks/:id/stage` |
| D.07 Task deletion | Implemented | `DELETE /api/tasks/bulk` |
| D.08 Status list accuracy | Implemented | `GET /api/tasks/status-options` |
| D.09 Description editing persistence | Implemented | `PUT /api/tasks/:id` |
| D.10 Attachment support | Implemented | `POST /api/tasks/:id/attachments`, `POST /api/tasks/:id/comments` |

## Endpoint Notes

- **`DELETE /api/tasks/bulk`** — JSON body required: `{ "taskIds": ["id1", "id2"] }`.

- `POST /api/tasks`
  - Accepts linked and unlinked tasks.
- `PUT /api/tasks/:id/stage`
  - Persists stage changes and updates linked performance goals.
- `PUT /api/tasks/bulk/stage`
  - Updates multiple tasks and recalculates each affected goal once per batch.
- `DELETE /api/tasks/bulk`
  - Soft-deletes tasks and recalculates linked goals.
- `GET /api/tasks/status-options`
  - Returns the supported backend task statuses used by Kanban workflows.
- `POST /api/tasks/:id/attachments`
  - Uploads task attachments and stores metadata on the task.

## Postman Test Flow

1. Create an unlinked task and confirm it saves.
2. Update the task stage and fetch it again to confirm persistence.
3. Create five linked tasks and run a bulk stage update.
4. Trash linked tasks and confirm the parent goal recalculates.
5. Fetch `GET /api/tasks/status-options` and verify the supported status list.
6. Upload a file to `POST /api/tasks/:id/attachments`.

## Expected Results

- Task stage persists across fetches.
- Unlinked tasks do not affect scorecards.
- Bulk changes trigger grouped recalculation.
- Attachment metadata is stored and returned.
