# 🔍 Comprehensive API Test Guide

## 🎯 **Testing Checklist**

This guide will help you verify that all endpoints are working correctly, error handling is proper, and Swagger documentation is up to date.

## 📋 **1. Authentication Endpoints**

### **Login** (`POST /api/auth/login`)
```bash
# ✅ Valid login
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{
  "email": "admin@nvccz.co.zw",
  "password": "admin123"
}

# ❌ Invalid credentials
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{
  "email": "wrong@email.com",
  "password": "wrongpassword"
}

# ❌ Missing fields
POST http://localhost:3000/api/auth/login
Content-Type: application/json

{
  "email": "admin@nvccz.co.zw"
}
```

### **Get Current User** (`GET /api/auth/me`)
```bash
# ✅ Valid token
GET http://localhost:3000/api/auth/me
Authorization: Bearer YOUR_JWT_TOKEN

# ❌ Invalid token
GET http://localhost:3000/api/auth/me
Authorization: Bearer invalid_token

# ❌ No token
GET http://localhost:3000/api/auth/me
```

## 📋 **2. Role Management Endpoints**

### **Create Role** (`POST /api/roles`)
```bash
# ✅ Valid role creation
POST http://localhost:3000/api/roles
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "name": "moderator",
  "description": "Moderator with limited permissions",
  "permissions": [
    { "name": "view_posts", "value": true },
    { "name": "create_posts", "value": true },
    { "name": "delete_posts", "value": false }
  ]
}

# ❌ Duplicate role name
POST http://localhost:3000/api/roles
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "name": "admin",
  "description": "Another admin role",
  "permissions": []
}

# ❌ Missing required fields
POST http://localhost:3000/api/roles
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "description": "Role without name"
}
```

### **Get All Roles** (`GET /api/roles`)
```bash
# ✅ Get all roles
GET http://localhost:3000/api/roles
Authorization: Bearer YOUR_JWT_TOKEN
```

### **Get Role by ID** (`GET /api/roles/{id}`)
```bash
# ✅ Valid role ID
GET http://localhost:3000/api/roles/clx1234567890abcdef
Authorization: Bearer YOUR_JWT_TOKEN

# ❌ Invalid role ID
GET http://localhost:3000/api/roles/invalid-id
Authorization: Bearer YOUR_JWT_TOKEN
```

### **Update Role** (`PUT /api/roles/{id}`)
```bash
# ✅ Valid update
PUT http://localhost:3000/api/roles/clx1234567890abcdef
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "name": "senior_moderator",
  "description": "Updated moderator role",
  "permissions": [
    { "name": "view_posts", "value": true },
    { "name": "create_posts", "value": true },
    { "name": "delete_posts", "value": true }
  ]
}

# ❌ Role not found
PUT http://localhost:3000/api/roles/invalid-id
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "name": "test"
}
```

### **Delete Role** (`DELETE /api/roles/{id}`)
```bash
# ✅ Delete role (if no users assigned)
DELETE http://localhost:3000/api/roles/clx1234567890abcdef
Authorization: Bearer YOUR_JWT_TOKEN

# ❌ Delete role with users assigned
DELETE http://localhost:3000/api/roles/admin-role-id
Authorization: Bearer YOUR_JWT_TOKEN
```

## 📋 **3. User Management Endpoints**

### **Create User** (`POST /api/users`)
```bash
# ✅ Valid user creation
POST http://localhost:3000/api/users
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@example.com",
  "password": "password123",
  "roleId": "clx1234567890abcdef"
}

# ❌ Duplicate email
POST http://localhost:3000/api/users
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "admin@nvccz.co.zw",
  "password": "password123",
  "roleId": "clx1234567890abcdef"
}

# ❌ Invalid role ID
POST http://localhost:3000/api/users
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "firstName": "Test",
  "lastName": "User",
  "email": "test@example.com",
  "password": "password123",
  "roleId": "invalid-role-id"
}
```

### **Get All Users** (`GET /api/users`)
```bash
# ✅ Get all users
GET http://localhost:3000/api/users
Authorization: Bearer YOUR_JWT_TOKEN
```

### **Get User by ID** (`GET /api/users/{id}`)
```bash
# ✅ Valid user ID
GET http://localhost:3000/api/users/clx1234567890abcdef
Authorization: Bearer YOUR_JWT_TOKEN

# ❌ Invalid user ID
GET http://localhost:3000/api/users/invalid-id
Authorization: Bearer YOUR_JWT_TOKEN
```

### **Update User** (`PUT /api/users/{id}`)
```bash
# ✅ Valid update
PUT http://localhost:3000/api/users/clx1234567890abcdef
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "firstName": "John Updated",
  "lastName": "Doe Updated",
  "email": "john.updated@example.com",
  "roleId": "clx1234567890abcdef"
}

# ❌ User not found
PUT http://localhost:3000/api/users/invalid-id
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "firstName": "Test"
}
```

### **Delete User** (`DELETE /api/users/{id}`)
```bash
# ✅ Delete user (if not last admin)
DELETE http://localhost:3000/api/users/clx1234567890abcdef
Authorization: Bearer YOUR_JWT_TOKEN

# ❌ Delete last admin
DELETE http://localhost:3000/api/users/admin-user-id
Authorization: Bearer YOUR_JWT_TOKEN
```

### **Change Password** (`PUT /api/users/{id}/change-password`)
```bash
# ✅ Valid password change
PUT http://localhost:3000/api/users/clx1234567890abcdef/change-password
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "currentPassword": "oldpassword",
  "newPassword": "newpassword123"
}

# ❌ Wrong current password
PUT http://localhost:3000/api/users/clx1234567890abcdef/change-password
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "currentPassword": "wrongpassword",
  "newPassword": "newpassword123"
}
```

## 📋 **4. Post Management Endpoints**

### **Create Post** (`POST /api/posts`)
```bash
# ✅ Valid post creation
POST http://localhost:3000/api/posts
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "title": "Test Post",
  "content": "This is a test post content",
  "expiresAt": "2024-12-31T23:59:59.000Z",
  "isNotified": true
}

# ❌ Missing required fields
POST http://localhost:3000/api/posts
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "content": "Post without title"
}

# ❌ Title too long
POST http://localhost:3000/api/posts
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "title": "This is a very long title that exceeds the maximum allowed length of 200 characters and should cause a validation error when submitted to the API endpoint",
  "content": "Post content"
}
```

### **Get All Posts** (`GET /api/posts`)
```bash
# ✅ Get all posts
GET http://localhost:3000/api/posts
Authorization: Bearer YOUR_JWT_TOKEN
```

### **Get Post by ID** (`GET /api/posts/{id}`)
```bash
# ✅ Valid post ID
GET http://localhost:3000/api/posts/clx1234567890abcdef
Authorization: Bearer YOUR_JWT_TOKEN

# ❌ Invalid post ID
GET http://localhost:3000/api/posts/invalid-id
Authorization: Bearer YOUR_JWT_TOKEN
```

### **Update Post** (`PUT /api/posts/{id}`)
```bash
# ✅ Valid update (author only)
PUT http://localhost:3000/api/posts/clx1234567890abcdef
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "title": "Updated Post Title",
  "content": "Updated post content",
  "expiresAt": "2024-12-31T23:59:59.000Z",
  "isNotified": false
}

# ❌ Update by non-author
PUT http://localhost:3000/api/posts/other-user-post-id
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "title": "Unauthorized Update",
  "content": "This should fail"
}
```

### **Delete Post** (`DELETE /api/posts/{id}`)
```bash
# ✅ Delete post (author only)
DELETE http://localhost:3000/api/posts/clx1234567890abcdef
Authorization: Bearer YOUR_JWT_TOKEN

# ❌ Delete by non-author
DELETE http://localhost:3000/api/posts/other-user-post-id
Authorization: Bearer YOUR_JWT_TOKEN
```

## 📋 **5. Reply Management Endpoints**

### **Add Reply to Post** (`POST /api/posts/{postId}/replies`)
```bash
# ✅ Valid reply
POST http://localhost:3000/api/posts/clx1234567890abcdef/replies
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "content": "This is a reply to the post"
}

# ❌ Missing content
POST http://localhost:3000/api/posts/clx1234567890abcdef/replies
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{}
```

### **Add Reply to Reply** (`POST /api/posts/replies/{replyId}/replies`)
```bash
# ✅ Valid nested reply
POST http://localhost:3000/api/posts/replies/clx1234567890abcdef/replies
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "content": "This is a reply to a reply"
}
```

### **Update Reply** (`PUT /api/posts/replies/{replyId}`)
```bash
# ✅ Valid update (author only)
PUT http://localhost:3000/api/posts/replies/clx1234567890abcdef
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "content": "Updated reply content"
}
```

### **Delete Reply** (`DELETE /api/posts/replies/{replyId}`)
```bash
# ✅ Delete reply (author only)
DELETE http://localhost:3000/api/posts/replies/clx1234567890abcdef
Authorization: Bearer YOUR_JWT_TOKEN
```

## 📋 **6. Newsletter Management Endpoints**

### **Create Newsletter** (`POST /api/newsletters`)
```bash
# ✅ Valid newsletter
POST http://localhost:3000/api/newsletters
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "title": "Monthly Newsletter",
  "content": "This is the newsletter content"
}

# ❌ Missing fields
POST http://localhost:3000/api/newsletters
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "title": "Newsletter without content"
}
```

### **Get All Newsletters** (`GET /api/newsletters`)
```bash
# ✅ Get all newsletters
GET http://localhost:3000/api/newsletters
Authorization: Bearer YOUR_JWT_TOKEN
```

### **Get Newsletter by ID** (`GET /api/newsletters/{id}`)
```bash
# ✅ Valid newsletter ID
GET http://localhost:3000/api/newsletters/clx1234567890abcdef
Authorization: Bearer YOUR_JWT_TOKEN
```

### **Update Newsletter** (`PUT /api/newsletters/{id}`)
```bash
# ✅ Valid update
PUT http://localhost:3000/api/newsletters/clx1234567890abcdef
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "title": "Updated Newsletter",
  "content": "Updated newsletter content"
}
```

### **Delete Newsletter** (`DELETE /api/newsletters/{id}`)
```bash
# ✅ Delete newsletter (soft delete)
DELETE http://localhost:3000/api/newsletters/clx1234567890abcdef
Authorization: Bearer YOUR_JWT_TOKEN
```

## 📋 **7. Event Management Endpoints**

### **Create Event** (`POST /api/events`)
```bash
# ✅ Valid event
POST http://localhost:3000/api/events
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "title": "Company Meeting",
  "description": "Monthly company meeting",
  "startDate": "2024-12-25T09:00:00.000Z",
  "endDate": "2024-12-25T17:00:00.000Z",
  "location": "Conference Room A"
}

# ❌ Invalid dates
POST http://localhost:3000/api/events
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "title": "Invalid Event",
  "description": "Event with invalid dates",
  "startDate": "2024-12-25T17:00:00.000Z",
  "endDate": "2024-12-25T09:00:00.000Z",
  "location": "Conference Room"
}
```

### **Get All Events** (`GET /api/events`)
```bash
# ✅ Get all events
GET http://localhost:3000/api/events
Authorization: Bearer YOUR_JWT_TOKEN
```

### **Get Upcoming Events** (`GET /api/events/upcoming`)
```bash
# ✅ Get upcoming events
GET http://localhost:3000/api/events/upcoming
Authorization: Bearer YOUR_JWT_TOKEN
```

### **Get Event by ID** (`GET /api/events/{id}`)
```bash
# ✅ Valid event ID
GET http://localhost:3000/api/events/clx1234567890abcdef
Authorization: Bearer YOUR_JWT_TOKEN
```

### **Update Event** (`PUT /api/events/{id}`)
```bash
# ✅ Valid update
PUT http://localhost:3000/api/events/clx1234567890abcdef
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "title": "Updated Event",
  "description": "Updated event description",
  "startDate": "2024-12-26T09:00:00.000Z",
  "endDate": "2024-12-26T17:00:00.000Z",
  "location": "Updated Location"
}
```

### **Delete Event** (`DELETE /api/events/{id}`)
```bash
# ✅ Delete event (soft delete)
DELETE http://localhost:3000/api/events/clx1234567890abcdef
Authorization: Bearer YOUR_JWT_TOKEN
```

## 📋 **8. Homepage Endpoints**

### **Get Homepage Data** (`GET /api/homepage`)
```bash
# ✅ Get homepage data
GET http://localhost:3000/api/homepage
Authorization: Bearer YOUR_JWT_TOKEN
```

### **Get Online Activity** (`GET /api/homepage/online-activity`)
```bash
# ✅ Get online activity
GET http://localhost:3000/api/homepage/online-activity
Authorization: Bearer YOUR_JWT_TOKEN
```

## 📋 **9. Notification Endpoints**

### **Get User Notifications** (`GET /api/homepage/notifications`)
```bash
# ✅ Get notifications
GET http://localhost:3000/api/homepage/notifications
Authorization: Bearer YOUR_JWT_TOKEN

# ✅ With pagination
GET http://localhost:3000/api/homepage/notifications?limit=10&offset=0
Authorization: Bearer YOUR_JWT_TOKEN
```

### **Mark Notification as Read** (`PUT /api/homepage/notifications/{id}/read`)
```bash
# ✅ Mark as read
PUT http://localhost:3000/api/homepage/notifications/clx1234567890abcdef/read
Authorization: Bearer YOUR_JWT_TOKEN
```

### **Mark All Notifications as Read** (`PUT /api/homepage/notifications/read-all`)
```bash
# ✅ Mark all as read
PUT http://localhost:3000/api/homepage/notifications/read-all
Authorization: Bearer YOUR_JWT_TOKEN
```

### **Get All Notifications (Debug)** (`GET /api/homepage/notifications/debug`)
```bash
# ✅ Admin only - get all notifications
GET http://localhost:3000/api/homepage/notifications/debug
Authorization: Bearer YOUR_JWT_TOKEN
```

## 🔍 **10. Swagger Documentation Verification**

### **Check Swagger UI**
1. Open `http://localhost:3000/api-docs`
2. Verify all endpoints are documented
3. Check request/response schemas
4. Test endpoints directly from Swagger UI
5. Verify error responses are documented

### **Common Issues to Check**
- ✅ All endpoints have proper authentication requirements
- ✅ Request bodies have correct schemas
- ✅ Response schemas match actual responses
- ✅ Error responses are documented
- ✅ Examples are provided for request bodies
- ✅ All required fields are marked as required

## 🚨 **Error Handling Verification**

### **Expected Error Responses**
- **400 Bad Request**: Missing required fields, validation errors
- **401 Unauthorized**: Missing or invalid JWT token
- **403 Forbidden**: Insufficient permissions
- **404 Not Found**: Resource not found
- **409 Conflict**: Duplicate resources
- **500 Internal Server Error**: Server errors

### **Error Response Format**
```json
{
  "success": false,
  "message": "Error description",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## ✅ **Final Checklist**

- [ ] All endpoints respond correctly
- [ ] Error handling works for all scenarios
- [ ] Authentication is required where needed
- [ ] Authorization works (admin-only endpoints)
- [ ] Last seen updates work on all endpoints
- [ ] Swagger documentation is complete and accurate
- [ ] Request/response examples are correct
- [ ] All CRUD operations work properly
- [ ] Soft deletes work correctly
- [ ] Notifications are created when expected
- [ ] Online activity tracking works
- [ ] Pagination works where implemented

## 🎯 **Testing Commands**

```bash
# Start the server
npm run dev

# Test all endpoints using the guide above
# Verify Swagger documentation at http://localhost:3000/api-docs
```

This comprehensive test guide will help ensure your API is fully functional and well-documented! 🚀 