# API Integration Guide

## Base URLs
- **Production**: `https://nvccz-pi.vercel.app/api`
- **Development**: `http://localhost:3000/api`

## Authentication
All protected endpoints require a Bearer token in the Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

---

## 🔐 Authentication Endpoints

### 1. Login
**POST** `/auth/login`

**Request Body:**
```json
{
  "email": "admin@nvccz.co.zw",
  "password": "admin123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Logged in successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "clx1234567890abcdef",
    "email": "admin@nvccz.co.zw",
    "firstName": "Admin",
    "lastName": "User",
    "role": "admin",
    "permissions": [
      { "name": "view_dashboard", "value": true },
      { "name": "manage_users", "value": true }
    ]
  }
}
```

### 2. Get Current User
**GET** `/auth/me`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "userId": "clx1234567890abcdef",
    "email": "admin@nvccz.co.zw",
    "firstName": "Admin",
    "lastName": "User",
    "role": "admin",
    "permissions": [
      { "name": "view_dashboard", "value": true },
      { "name": "manage_users", "value": true }
    ]
  }
}
```

---

## 👥 User Management

### 1. Create User
**POST** `/users`

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "password": "password123",
  "roleId": "clx1234567890abcdef"
}
```

### 2. Get All Users
**GET** `/users`

**Headers:** `Authorization: Bearer <token>`

### 3. Get User by ID
**GET** `/users/:id`

**Headers:** `Authorization: Bearer <token>`

### 4. Update User
**PUT** `/users/:id`

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "firstName": "John Updated",
  "lastName": "Doe Updated",
  "email": "john.updated@example.com",
  "roleId": "clx1234567890abcdef"
}
```

### 5. Delete User
**DELETE** `/users/:id`

**Headers:** `Authorization: Bearer <token>`

### 6. Change Password
**PUT** `/users/:id/password`

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "currentPassword": "oldpassword",
  "newPassword": "newpassword123"
}
```

---

## 🎭 Role Management

### 1. Create Role
**POST** `/roles`

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "name": "moderator",
  "description": "Moderator with limited admin access",
  "permissions": [
    { "name": "view_dashboard", "value": true },
    { "name": "view_posts", "value": true },
    { "name": "create_posts", "value": true },
    { "name": "edit_posts", "value": false },
    { "name": "delete_posts", "value": false }
  ]
}
```

### 2. Get All Roles
**GET** `/roles`

**Headers:** `Authorization: Bearer <token>`

### 3. Get Role by ID
**GET** `/roles/:id`

**Headers:** `Authorization: Bearer <token>`

### 4. Update Role
**PUT** `/roles/:id`

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "name": "senior_moderator",
  "description": "Senior moderator with more permissions",
  "permissions": [
    { "name": "view_dashboard", "value": true },
    { "name": "view_posts", "value": true },
    { "name": "create_posts", "value": true },
    { "name": "edit_posts", "value": true },
    { "name": "delete_posts", "value": false }
  ]
}
```

### 5. Delete Role
**DELETE** `/roles/:id`

**Headers:** `Authorization: Bearer <token>`

### 6. Get Role Permissions
**GET** `/roles/:id/permissions`

**Headers:** `Authorization: Bearer <token>`

---

## 📝 Posts Management

### 1. Create Post
**POST** `/posts`

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "title": "Important Company Announcement",
  "content": "This is the content of the post...",
  "expiresAt": "2024-12-31T23:59:59.000Z",
  "isNotified": true
}
```

### 2. Get All Posts
**GET** `/posts`

**Headers:** `Authorization: Bearer <token>`

### 3. Get Post by ID
**GET** `/posts/:id`

**Headers:** `Authorization: Bearer <token>`

### 4. Update Post
**PUT** `/posts/:id`

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "title": "Updated Company Announcement",
  "content": "This is the updated content...",
  "expiresAt": "2024-12-31T23:59:59.000Z",
  "isNotified": false
}
```

### 5. Delete Post
**DELETE** `/posts/:id`

**Headers:** `Authorization: Bearer <token>`

---

## 💬 Reply Management

### 1. Add Reply to Post
**POST** `/posts/:postId/replies`

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "content": "This is a reply to the post..."
}
```

### 2. Add Reply to Reply (Nested)
**POST** `/posts/replies/:replyId/replies`

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "content": "This is a reply to another reply..."
}
```

### 3. Update Reply
**PUT** `/posts/replies/:replyId`

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "content": "This is an updated reply..."
}
```

### 4. Delete Reply
**DELETE** `/posts/replies/:replyId`

**Headers:** `Authorization: Bearer <token>`

---

## 📰 Newsletter Management

### 1. Create Newsletter
**POST** `/newsletters`

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "title": "Monthly Company Newsletter",
  "content": "This is the newsletter content..."
}
```

### 2. Get All Newsletters
**GET** `/newsletters`

**Headers:** `Authorization: Bearer <token>`

### 3. Get Newsletter by ID
**GET** `/newsletters/:id`

**Headers:** `Authorization: Bearer <token>`

### 4. Update Newsletter
**PUT** `/newsletters/:id`

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "title": "Updated Company Newsletter",
  "content": "This is the updated newsletter content..."
}
```

### 5. Delete Newsletter
**DELETE** `/newsletters/:id`

**Headers:** `Authorization: Bearer <token>`

---

## 📅 Event Management

### 1. Create Event
**POST** `/events`

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "title": "Company Annual Meeting",
  "description": "Annual company meeting for all employees",
  "startDate": "2024-12-25T09:00:00.000Z",
  "endDate": "2024-12-25T17:00:00.000Z",
  "location": "Main Conference Room"
}
```

### 2. Get All Events
**GET** `/events`

**Headers:** `Authorization: Bearer <token>`

### 3. Get Upcoming Events
**GET** `/events/upcoming`

**Headers:** `Authorization: Bearer <token>`

### 4. Get Event by ID
**GET** `/events/:id`

**Headers:** `Authorization: Bearer <token>`

### 5. Update Event
**PUT** `/events/:id`

**Headers:** `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "title": "Updated Company Annual Meeting",
  "description": "Updated annual company meeting",
  "startDate": "2024-12-25T09:00:00.000Z",
  "endDate": "2024-12-25T17:00:00.000Z",
  "location": "Updated Conference Room"
}
```

### 6. Delete Event
**DELETE** `/events/:id`

**Headers:** `Authorization: Bearer <token>`

---

## 🏠 Homepage & Activity

### 1. Get Homepage Data
**GET** `/homepage`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "posts": [...],
    "newsletters": [...],
    "events": {
      "upcoming": [...],
      "all": [...]
    },
    "onlineUsers": [
      {
        "id": "clx1234567890abcdef",
        "firstName": "John",
        "lastName": "Doe",
        "email": "john@example.com",
        "lastSeen": "2024-08-03T11:00:00.000Z",
        "isOnline": true
      }
    ],
    "summary": {
      "totalPosts": 5,
      "totalNewsletters": 3,
      "upcomingEvents": 2,
      "totalEvents": 8,
      "onlineUsers": 8
    }
  }
}
```

### 2. Get Online Activity
**GET** `/homepage/online-activity`

**Headers:** `Authorization: Bearer <token>`

### 3. Get User Notifications
**GET** `/homepage/notifications?limit=50&offset=0`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": "clx1234567890abcdef",
        "title": "New Company Post",
        "message": "A new post has been created by John Doe",
        "type": "post",
        "isRead": false,
        "data": {
          "postId": "clx1234567890abcdef",
          "authorId": "clx1234567890abcdef",
          "authorName": "John Doe"
        },
        "createdAt": "2024-08-03T11:00:00.000Z",
        "timeAgo": "2 hours ago"
      }
    ],
    "pagination": {
      "total": 15,
      "unread": 8,
      "limit": 50,
      "offset": 0,
      "hasMore": false
    }
  }
}
```

### 4. Mark Notification as Read
**PUT** `/homepage/notifications/:id/read`

**Headers:** `Authorization: Bearer <token>`

### 5. Mark All Notifications as Read
**PUT** `/homepage/notifications/read-all`

**Headers:** `Authorization: Bearer <token>`

---

## 🔧 Test Endpoints

### 1. Test API
**GET** `/test-api`

**Response:**
```json
{
  "message": "API is working",
  "timestamp": "2024-08-03T11:00:00.000Z",
  "swaggerUrl": "/api-docs"
}
```

### 2. Test Database
**GET** `/test-db`

**Response:**
```json
{
  "success": true,
  "message": "Database connection successful",
  "userCount": 1,
  "timestamp": "2024-08-03T11:00:00.000Z"
}
```

### 3. Health Check
**GET** `/health`

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-08-03T11:00:00.000Z",
  "environment": "production",
  "database": "connected"
}
```

---

## 📋 Common Permission Names

Here are the common permission names used in the system:

### Dashboard & General
- `view_dashboard`
- `view_reports`
- `view_analytics`

### User Management
- `view_users`
- `create_users`
- `edit_users`
- `delete_users`
- `manage_user_roles`

### Role Management
- `view_roles`
- `create_roles`
- `edit_roles`
- `delete_roles`
- `manage_permissions`

### Posts
- `view_posts`
- `create_posts`
- `edit_posts`
- `delete_posts`
- `manage_post_replies`

### Newsletters
- `view_newsletters`
- `create_newsletters`
- `edit_newsletters`
- `delete_newsletters`

### Events
- `view_events`
- `create_events`
- `edit_events`
- `delete_events`

### Notifications
- `view_notifications`
- `manage_notifications`

### System
- `manage_system_settings`
- `view_system_logs`
- `manage_backups`

---

## 🚨 Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "message": "Validation error",
  "errors": [
    {
      "field": "email",
      "message": "Email is required"
    }
  ]
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "message": "Unauthorized access"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "message": "Access denied"
}
```

### 404 Not Found
```json
{
  "success": false,
  "message": "Resource not found"
}
```

### 409 Conflict
```json
{
  "success": false,
  "message": "Resource already exists"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "message": "Internal server error"
}
```

---

## 📝 Usage Examples

### cURL Examples

#### Login
```bash
curl -X POST https://nvccz-pi.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@nvccz.co.zw",
    "password": "admin123"
  }'
```

#### Create Post (with token)
```bash
curl -X POST https://nvccz-pi.vercel.app/api/posts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -d '{
    "title": "Important Announcement",
    "content": "This is an important announcement for all employees.",
    "isNotified": true
  }'
```

#### Get Homepage Data
```bash
curl -X GET https://nvccz-pi.vercel.app/api/homepage \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### JavaScript Examples

#### Login
```javascript
const loginResponse = await fetch('https://nvccz-pi.vercel.app/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'admin@nvccz.co.zw',
    password: 'admin123'
  })
});

const loginData = await loginResponse.json();
const token = loginData.token;
```

#### Create Post
```javascript
const createPostResponse = await fetch('https://nvccz-pi.vercel.app/api/posts', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    title: 'Important Announcement',
    content: 'This is an important announcement for all employees.',
    isNotified: true
  })
});

const postData = await createPostResponse.json();
```

#### Get Homepage Data
```javascript
const homepageResponse = await fetch('https://nvccz-pi.vercel.app/api/homepage', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const homepageData = await homepageResponse.json();
```

---

## 🔐 Security Notes

1. **Always use HTTPS** in production
2. **Store tokens securely** - never expose them in client-side code
3. **Implement token refresh** for long-running applications
4. **Validate all inputs** on both client and server
5. **Use appropriate permissions** for each user role
6. **Log security events** for audit purposes

---

## 📞 Support

For API support, contact: support@nvccz.co.zw

**Production URL:** https://nvccz-pi.vercel.app/api
**Development URL:** http://localhost:3000/api 