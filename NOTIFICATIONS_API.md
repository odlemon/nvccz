# Notifications API Documentation

## 🔔 **User Notifications System**

The system provides comprehensive notification management for users, including viewing, marking as read, and pagination support.

---

## 📝 **API Endpoints**

### **1. Get User Notifications**
**Endpoint:** `GET /api/homepage/notifications`

**Headers:** 
```
Authorization: Bearer {your-jwt-token}
```

**Query Parameters:**
- `limit` (optional): Number of notifications to return (default: 50)
- `offset` (optional): Number of notifications to skip (default: 0)

**Example Request:**
```bash
GET /api/homepage/notifications?limit=20&offset=0
```

**Response:**
```json
{
  "success": true,
  "data": {
    "notifications": [
      {
        "id": "clx1234567890abcdef",
        "title": "New Company Post: Important Announcement",
        "message": "A new post has been created by Admin User",
        "type": "post",
        "isRead": false,
        "data": {
          "postId": "clx1234567890abcdef",
          "authorId": "clx1234567890abcdef"
        },
        "createdAt": "2024-01-15T10:30:00.000Z",
        "updatedAt": "2024-01-15T10:30:00.000Z",
        "timeAgo": "2 hours ago"
      },
      {
        "id": "clx1234567890abcdef",
        "title": "New Newsletter: Monthly Update",
        "message": "A new newsletter has been published by John Doe",
        "type": "newsletter",
        "isRead": true,
        "data": {
          "newsletterId": "clx1234567890abcdef",
          "authorId": "clx1234567890abcdef"
        },
        "createdAt": "2024-01-14T15:45:00.000Z",
        "updatedAt": "2024-01-14T16:00:00.000Z",
        "timeAgo": "1 day ago"
      }
    ],
    "pagination": {
      "total": 25,
      "unread": 8,
      "limit": 20,
      "offset": 0,
      "hasMore": true
    }
  }
}
```

### **2. Mark Notification as Read**
**Endpoint:** `PUT /api/homepage/notifications/{notificationId}/read`

**Headers:** 
```
Authorization: Bearer {your-jwt-token}
```

**Example Request:**
```bash
PUT /api/homepage/notifications/clx1234567890abcdef/read
```

**Response:**
```json
{
  "success": true,
  "message": "Notification marked as read"
}
```

### **3. Mark All Notifications as Read**
**Endpoint:** `PUT /api/homepage/notifications/read-all`

**Headers:** 
```
Authorization: Bearer {your-jwt-token}
```

**Example Request:**
```bash
PUT /api/homepage/notifications/read-all
```

**Response:**
```json
{
  "success": true,
  "message": "All notifications marked as read"
}
```

---

## 📊 **Notification Types**

### **Post Notifications**
- **Type:** `post`
- **Trigger:** When a post is created with `isNotified: true`
- **Data:** `{ postId, authorId }`

### **Newsletter Notifications**
- **Type:** `newsletter`
- **Trigger:** When a newsletter is created
- **Data:** `{ newsletterId, authorId }`

### **Event Notifications**
- **Type:** `event`
- **Trigger:** When an event is created
- **Data:** `{ eventId, authorId }`

### **System Notifications**
- **Type:** `system`
- **Trigger:** System-generated notifications
- **Data:** Varies based on system action

---

## 🔧 **Features**

### **✅ Pagination Support**
- Configurable `limit` and `offset` parameters
- Total count and unread count included
- `hasMore` flag for infinite scrolling

### **✅ Read Status Management**
- Mark individual notifications as read
- Mark all notifications as read at once
- Unread count tracking

### **✅ Time Formatting**
- Relative time display (e.g., "2 hours ago")
- Automatic time zone handling
- User-friendly time representation

### **✅ Data Structure**
- Rich notification data with context
- Type-specific information
- Author and content references

---

## 🎯 **Usage Examples**

### **Get Recent Notifications**
```bash
GET /api/homepage/notifications?limit=10
```

### **Get Unread Notifications Only**
```bash
# Get all notifications and filter client-side
GET /api/homepage/notifications?limit=100
```

### **Pagination Example**
```bash
# First page
GET /api/homepage/notifications?limit=20&offset=0

# Second page
GET /api/homepage/notifications?limit=20&offset=20

# Third page
GET /api/homepage/notifications?limit=20&offset=40
```

### **Mark Specific Notification as Read**
```bash
PUT /api/homepage/notifications/clx1234567890abcdef/read
```

### **Mark All as Read**
```bash
PUT /api/homepage/notifications/read-all
```

---

## 🚨 **Error Handling**

### **404 - Notification Not Found**
```json
{
  "success": false,
  "message": "Notification not found"
}
```

### **401 - Unauthorized**
```json
{
  "success": false,
  "message": "Unauthorized"
}
```

### **500 - Internal Server Error**
```json
{
  "success": false,
  "message": "Internal server error"
}
```

---

## 🎨 **Frontend Implementation Tips**

### **1. Real-time Updates**
- Poll notifications every 30 seconds
- Use WebSocket for real-time updates
- Show notification badge with unread count

### **2. Infinite Scrolling**
```javascript
// Example with infinite scroll
let offset = 0;
const limit = 20;

async function loadMoreNotifications() {
  const response = await fetch(`/api/homepage/notifications?limit=${limit}&offset=${offset}`);
  const data = await response.json();
  
  if (data.data.pagination.hasMore) {
    offset += limit;
  }
  
  return data.data.notifications;
}
```

### **3. Notification Badge**
```javascript
// Update notification badge
function updateNotificationBadge(unreadCount) {
  const badge = document.getElementById('notification-badge');
  badge.textContent = unreadCount;
  badge.style.display = unreadCount > 0 ? 'block' : 'none';
}
```

### **4. Auto-mark as Read**
```javascript
// Mark notification as read when clicked
async function markAsRead(notificationId) {
  await fetch(`/api/homepage/notifications/${notificationId}/read`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
}
```

---

## 🔍 **Testing**

### **Test Notification Creation**
1. Create a post with `isNotified: true`
2. Check if notifications were created for other users
3. Verify notification data structure

### **Test Notification Reading**
1. Get user notifications
2. Mark a notification as read
3. Verify unread count decreases
4. Mark all notifications as read
5. Verify all notifications are marked as read

### **Test Pagination**
1. Create multiple notifications
2. Test different limit/offset combinations
3. Verify pagination metadata is correct

The notifications system is fully functional and ready for use! 🚀 