# Homepage Features API Documentation

## 🏠 **Main Homepage Endpoint**

### **GET /api/homepage**
Get all homepage data in a single request.

**Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
```

**Response:**
```json
{
  "success": true,
  "data": {
    "posts": [...],
    "newsletters": [...],
    "events": [...],
    "onlineUsers": [...],
    "notifications": [...],
    "summary": {
      "totalPosts": 5,
      "totalNewsletters": 3,
      "totalEvents": 8,
      "onlineUsers": 12,
      "unreadNotifications": 2
    }
  }
}
```

---

## 📝 **Company Posts (Comments)**

### **Create Post**
**POST /api/posts**

**Request Body:**
```json
{
  "title": "Important Announcement",
  "content": "This is an important message for the whole organization.",
  "expiresAt": "2024-12-31T23:59:59.000Z",  // Optional
  "isNotified": true  // Optional - sends notifications to all users
}
```

### **Get All Posts**
**GET /api/posts**

### **Get Post by ID**
**GET /api/posts/{id}**

### **Update Post**
**PUT /api/posts/{id}**

**Request Body:**
```json
{
  "title": "Updated Announcement",
  "content": "Updated content here.",
  "expiresAt": "2024-12-31T23:59:59.000Z",
  "isNotified": false
}
```

### **Delete Post**
**DELETE /api/posts/{id}**

### **Add Reply to Post**
**POST /api/posts/{postId}/replies**

**Request Body:**
```json
{
  "content": "This is my reply to the post."
}
```

### **Update Reply**
**PUT /api/posts/replies/{replyId}**

**Request Body:**
```json
{
  "content": "Updated reply content."
}
```

### **Delete Reply**
**DELETE /api/posts/replies/{replyId}**

---

## 📰 **Company Newsletter**

### **Create Newsletter**
**POST /api/newsletters**

**Request Body:**
```json
{
  "title": "Monthly Newsletter",
  "content": "This month's newsletter content..."
}
```

### **Get All Newsletters**
**GET /api/newsletters**

### **Get Newsletter by ID**
**GET /api/newsletters/{id}**

### **Update Newsletter**
**PUT /api/newsletters/{id}**

**Request Body:**
```json
{
  "title": "Updated Newsletter",
  "content": "Updated newsletter content..."
}
```

### **Delete Newsletter**
**DELETE /api/newsletters/{id}**

---

## 📅 **Events Calendar**

### **Create Event**
**POST /api/events**

**Request Body:**
```json
{
  "title": "Team Meeting",
  "description": "Weekly team meeting to discuss progress.",
  "startDate": "2024-01-20T10:00:00.000Z",
  "endDate": "2024-01-20T11:00:00.000Z",
  "location": "Conference Room A"  // Optional
}
```

### **Get All Events**
**GET /api/events**

### **Get Upcoming Events**
**GET /api/events/upcoming**

### **Get Event by ID**
**GET /api/events/{id}**

### **Update Event**
**PUT /api/events/{id}**

**Request Body:**
```json
{
  "title": "Updated Team Meeting",
  "description": "Updated meeting description.",
  "startDate": "2024-01-20T10:00:00.000Z",
  "endDate": "2024-01-20T11:00:00.000Z",
  "location": "Conference Room B"
}
```

### **Delete Event**
**DELETE /api/events/{id}**

---

## 👥 **Online Activity**

### **Get Online Activity**
**GET /api/homepage/online-activity**

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "clx1234567890abcdef",
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com",
      "lastSeen": "2024-01-15T10:30:00.000Z",
      "isOnline": true
    }
  ]
}
```

---

## 🔔 **Notifications**

### **Get User Notifications**
**GET /api/homepage/notifications**

### **Mark Notification as Read**
**PUT /api/homepage/notifications/{id}/read**

### **Mark All Notifications as Read**
**PUT /api/homepage/notifications/read-all**

---

## 📋 **Response Formats**

### **Success Response**
```json
{
  "success": true,
  "message": "Operation completed successfully",
  "data": { ... }
}
```

### **Error Response**
```json
{
  "success": false,
  "message": "Error description"
}
```

---

## 🔐 **Authentication**

All endpoints require authentication. Include the JWT token in the Authorization header:
```
Authorization: Bearer YOUR_JWT_TOKEN
```

---

## 📊 **Data Models**

### **Post Model**
```json
{
  "id": "clx1234567890abcdef",
  "title": "Post Title",
  "content": "Post content...",
  "authorId": "clx1234567890abcdef",
  "expiresAt": "2024-12-31T23:59:59.000Z",
  "isNotified": true,
  "isActive": true,
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z",
  "author": {
    "id": "clx1234567890abcdef",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com"
  },
  "replies": [...]
}
```

### **Newsletter Model**
```json
{
  "id": "clx1234567890abcdef",
  "title": "Newsletter Title",
  "content": "Newsletter content...",
  "authorId": "clx1234567890abcdef",
  "isActive": true,
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z",
  "author": {
    "id": "clx1234567890abcdef",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com"
  }
}
```

### **Event Model**
```json
{
  "id": "clx1234567890abcdef",
  "title": "Event Title",
  "description": "Event description...",
  "startDate": "2024-01-20T10:00:00.000Z",
  "endDate": "2024-01-20T11:00:00.000Z",
  "location": "Conference Room A",
  "authorId": "clx1234567890abcdef",
  "isActive": true,
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z",
  "author": {
    "id": "clx1234567890abcdef",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com"
  }
}
```

### **Notification Model**
```json
{
  "id": "clx1234567890abcdef",
  "title": "Notification Title",
  "message": "Notification message...",
  "type": "post",  // 'post', 'newsletter', 'event', 'system'
  "userId": "clx1234567890abcdef",
  "isRead": false,
  "data": {
    "postId": "clx1234567890abcdef",
    "authorId": "clx1234567890abcdef"
  },
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

---

## 🚨 **Error Codes**

- **400** - Bad Request (missing required fields, validation errors)
- **401** - Unauthorized (invalid or missing token)
- **403** - Forbidden (insufficient permissions)
- **404** - Not Found (resource doesn't exist)
- **409** - Conflict (duplicate data)
- **500** - Internal Server Error

---

## 🎯 **Usage Examples**

### **Complete Homepage Workflow**

1. **Login and get token**
2. **Get homepage data**: `GET /api/homepage`
3. **Create a post**: `POST /api/posts`
4. **Add reply to post**: `POST /api/posts/{postId}/replies`
5. **Create event**: `POST /api/events`
6. **Create newsletter**: `POST /api/newsletters`
7. **Check online activity**: `GET /api/homepage/online-activity`
8. **Manage notifications**: `GET /api/homepage/notifications`

### **Testing with Postman**

1. **Set Authorization Header**: `Bearer YOUR_JWT_TOKEN`
2. **Set Content-Type**: `application/json`
3. **Use the endpoints above with appropriate request bodies**

---

## 🔧 **Features**

- ✅ **Post Expiration**: Posts can have expiration dates
- ✅ **Notifications**: Optional notifications for posts/newsletters/events
- ✅ **Author Permissions**: Users can only edit/delete their own content
- ✅ **Online Activity**: Real-time online status tracking
- ✅ **Reply System**: Users can reply to posts
- ✅ **Soft Deletes**: Content is hidden rather than permanently deleted
- ✅ **Activity Logging**: All actions are logged for audit purposes 