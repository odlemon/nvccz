# Nested Replies API Documentation

## 🗨️ **Nested Replies Feature**

The system now supports nested replies (replies to replies) just like Facebook! Users can reply to any reply, creating a threaded conversation.

---

## 📝 **API Endpoints**

### **1. Reply to a Post**
**Endpoint:** `POST /api/posts/{postId}/replies`

**Request Body:**
```json
{
  "content": "This is a reply to the post."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Reply added successfully",
  "data": {
    "id": "clx1234567890abcdef",
    "content": "This is a reply to the post.",
    "postId": "clx1234567890abcdef",
    "parentReplyId": null,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z",
    "author": {
      "id": "clx1234567890abcdef",
      "firstName": "Admin",
      "lastName": "User",
      "email": "admin@nvccz.co.zw",
      "fullName": "Admin User"
    }
  }
}
```

### **2. Reply to a Reply (Nested Reply)**
**Endpoint:** `POST /api/posts/replies/{replyId}/replies`

**Request Body:**
```json
{
  "content": "This is a reply to another reply!"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Nested reply added successfully",
  "data": {
    "id": "clx1234567890abcdef",
    "content": "This is a reply to another reply!",
    "postId": "clx1234567890abcdef",
    "parentReplyId": "clx1234567890abcdef",
    "createdAt": "2024-01-15T10:35:00.000Z",
    "updatedAt": "2024-01-15T10:35:00.000Z",
    "author": {
      "id": "clx1234567890abcdef",
      "firstName": "Admin",
      "lastName": "User",
      "email": "admin@nvccz.co.zw",
      "fullName": "Admin User"
    },
    "parentReply": {
      "id": "clx1234567890abcdef",
      "content": "This is a reply to the post.",
      "author": {
        "id": "clx1234567890abcdef",
        "firstName": "John",
        "lastName": "Doe",
        "fullName": "John Doe"
      }
    }
  }
}
```

### **3. Get Post with Nested Replies**
**Endpoint:** `GET /api/posts/{postId}`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "clx1234567890abcdef",
    "title": "Welcome to Our New System!",
    "content": "Hello everyone! This is our first post...",
    "author": {
      "id": "clx1234567890abcdef",
      "firstName": "Admin",
      "lastName": "User",
      "email": "admin@nvccz.co.zw",
      "fullName": "Admin User"
    },
    "replies": [
      {
        "id": "clx1234567890abcdef",
        "content": "This is a reply to the post.",
        "parentReplyId": null,
        "author": {
          "id": "clx1234567890abcdef",
          "firstName": "John",
          "lastName": "Doe",
          "email": "john@example.com",
          "fullName": "John Doe"
        },
        "replies": [
          {
            "id": "clx1234567890abcdef",
            "content": "This is a reply to another reply!",
            "parentReplyId": "clx1234567890abcdef",
            "author": {
              "id": "clx1234567890abcdef",
              "firstName": "Admin",
              "lastName": "User",
              "email": "admin@nvccz.co.zw",
              "fullName": "Admin User"
            }
          }
        ]
      }
    ]
  }
}
```

---

## 🔄 **Reply Management**

### **Update Reply**
**Endpoint:** `PUT /api/posts/replies/{replyId}`

### **Delete Reply**
**Endpoint:** `DELETE /api/posts/replies/{replyId}`

*Note: Deleting a reply will also delete all its nested replies (cascade delete).*

---

## 📊 **Data Structure**

### **Reply Model**
```json
{
  "id": "clx1234567890abcdef",
  "content": "Reply content",
  "postId": "clx1234567890abcdef",
  "authorId": "clx1234567890abcdef",
  "parentReplyId": "clx1234567890abcdef", // null for top-level replies
  "createdAt": "2024-01-15T10:30:00.000Z",
  "updatedAt": "2024-01-15T10:30:00.000Z"
}
```

### **Reply Hierarchy**
- **Top-level replies**: `parentReplyId = null`
- **Nested replies**: `parentReplyId = ID of parent reply`
- **Unlimited nesting**: You can reply to replies to replies...

---

## 🎯 **Usage Examples**

### **Complete Conversation Flow**

1. **Create a post**
   ```bash
   POST /api/posts
   {
     "title": "Team Meeting Tomorrow",
     "content": "Don't forget about the team meeting tomorrow at 10 AM."
   }
   ```

2. **Reply to the post**
   ```bash
   POST /api/posts/{postId}/replies
   {
     "content": "I'll be there! Looking forward to it."
   }
   ```

3. **Reply to the reply**
   ```bash
   POST /api/posts/replies/{replyId}/replies
   {
     "content": "Me too! Should we prepare anything?"
   }
   ```

4. **Reply to the nested reply**
   ```bash
   POST /api/posts/replies/{nestedReplyId}/replies
   {
     "content": "Yes, please bring your project updates."
   }
   ```

---

## 🔧 **Features**

- ✅ **Unlimited Nesting**: Reply to replies to replies...
- ✅ **Hierarchical Display**: Replies are organized in a tree structure
- ✅ **Author Information**: Each reply includes author details
- ✅ **Timestamps**: All replies include creation and update times
- ✅ **Cascade Deletion**: Deleting a reply removes all its nested replies
- ✅ **Activity Logging**: All reply actions are logged for audit purposes
- ✅ **Validation**: Proper validation for content and parent reply existence

---

## 🚨 **Error Handling**

- **400**: Missing content
- **404**: Post or parent reply not found
- **403**: Cannot reply to inactive post
- **500**: Internal server error

---

## 🎨 **Frontend Implementation Tips**

1. **Indentation**: Use CSS indentation to show reply hierarchy
2. **Collapse/Expand**: Allow users to collapse long reply threads
3. **Reply Button**: Show "Reply" button on each reply
4. **Thread View**: Consider a dedicated thread view for long conversations
5. **Real-time Updates**: Use WebSocket for real-time reply notifications

---

## 🔍 **Testing**

### **Test Nested Replies**
1. Create a post
2. Add a reply to the post
3. Add a reply to that reply
4. Add another reply to the nested reply
5. Fetch the post to see the complete thread structure

The nested replies feature is now fully functional! 🚀 