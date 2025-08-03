# Testing Notifications

## Step 1: Login to get JWT token
```bash
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{
  "email": "admin@nvccz.co.zw",
  "password": "admin123"
}
```

## Step 2: Create a post with notifications enabled
```bash
POST http://localhost:3000/api/posts
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "title": "Test Post with Notifications",
  "content": "This post should create notifications for all users",
  "isNotified": true
}
```

## Step 3: Check your notifications
```bash
GET http://localhost:3000/api/homepage/notifications
Authorization: Bearer YOUR_JWT_TOKEN
```

## Step 4: Debug - Check all notifications in database (admin only)
```bash
GET http://localhost:3000/api/homepage/notifications/debug
Authorization: Bearer YOUR_JWT_TOKEN
```

## Expected Results:
- Step 2 should show console logs about notification creation
- Step 3 should show your notifications
- Step 4 should show all notifications in the database

## Troubleshooting:
1. Check server console for logs when creating posts
2. Use the debug endpoint to see if notifications exist in database
3. Verify the user ID in the JWT token matches the user ID in notifications 