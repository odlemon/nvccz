# E-Series: Collaboration & Notifications

## Scope

This section covers backend task collaboration behavior while ignoring Firestore/UI transport details.

## UAT Coverage

| UAT | Backend Status | Endpoints |
|---|---|---|
| E.01 @mention dropdown data | Implemented | `GET /api/tasks/:id/mention-suggestions` |
| E.02 Mention notification | Implemented | `POST /api/tasks/:id/comments`, `GET /api/homepage/notifications` |
| E.03 Chat storage path equivalent | Implemented | `POST /api/tasks/:id/comments`, `GET /api/tasks/:id/comments` |
| E.04 Real-time chat backend persistence | Implemented | comment read/write endpoints |
| E.05 Notification queue persistence | Implemented | `GET /api/homepage/notifications` |
| E.06 Notification mark as read | Implemented | `PUT /api/homepage/notifications/:id/read`, `PUT /api/homepage/notifications/read-all` |
| E.07 Email notification on Red Zone | Implemented | `PUT /api/tasks/:id/stage`, `GET /api/homepage/notifications` |
| E.08 Comment deletion | Implemented | `DELETE /api/tasks/:id/comments/:commentId` |
| E.09 System messages | Implemented | `PUT /api/tasks/:id/stage`, `GET /api/tasks/:id/comments` |
| E.10 Notification deep link payload | Implemented | `GET /api/homepage/notifications` |

## Endpoint Notes

- `GET /api/tasks/:id/comments`
  - Returns task comments and system-generated task messages.
- `POST /api/tasks/:id/comments`
  - Creates a task comment with optional `mentionUserIds` and file attachments.
- `DELETE /api/tasks/:id/comments/:commentId`
  - Soft-deletes a user’s own task comment.
- `GET /api/tasks/:id/mention-suggestions`
  - Searches valid task mention candidates from the backend.
- `GET /api/homepage/notifications`
  - Returns notification feed entries with data payloads.

## Postman Test Flow

1. Fetch mention suggestions with `q=adm`.
2. Post a comment with `content` and `mentionUserIds`.
3. Fetch notifications as the mentioned user.
4. Update a task into `red` or overdue state.
5. Fetch task comments and verify system messages.
6. Delete a comment you created and confirm it is marked deleted in the response.

## Expected Results

- Mention candidates are returned by the backend.
- Mentioned users receive notification records.
- Red-zone transitions create notifications and email attempts.
- System messages record task stage changes.
