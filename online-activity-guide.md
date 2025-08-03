# 🟢 Online Activity & Last Seen Guide

## 🎯 **How It Works**

The online activity system tracks when users are active and shows their online status. Here's how it works:

### **1. Last Seen Tracking**
- **Automatic Updates**: Every time a user makes an API call to certain endpoints, their `lastSeen` timestamp is updated
- **Database Field**: Each user has a `lastSeen` field in the database that stores the last activity timestamp
- **Real-time**: Updates happen in real-time as users interact with the system

### **2. Online Status Logic**
- **Online Threshold**: Users are considered "online" if they were active within the last **5 minutes**
- **Offline Status**: Users become "offline" after 5 minutes of inactivity
- **Automatic**: No manual status updates needed - it's all automatic

## 📍 **Endpoints That Update Last Seen**

### **Homepage Data** (`GET /api/homepage`)
```typescript
// Updates lastSeen when user fetches homepage
await prisma.user.update({
  where: { id: userId },
  data: { lastSeen: new Date() }
});
```

### **Online Activity** (`GET /api/homepage/online-activity`)
```typescript
// Updates lastSeen when user checks online activity
await prisma.user.update({
  where: { id: userId },
  data: { lastSeen: new Date() }
});
```

### **Notifications** (`GET /api/homepage/notifications`)
```typescript
// Updates lastSeen when user fetches notifications
await prisma.user.update({
  where: { id: userId },
  data: { lastSeen: new Date() }
});
```

## 🔍 **How Online Status is Calculated**

### **In Homepage Data**
```typescript
// Get users active in last 5 minutes
prisma.user.findMany({
  where: {
    lastSeen: {
      gte: new Date(Date.now() - 5 * 60 * 1000) // 5 minutes ago
    }
  },
  select: {
    id: true,
    firstName: true,
    lastName: true,
    email: true,
    lastSeen: true
  },
  orderBy: { lastSeen: 'desc' }
})
```

### **In Online Activity Endpoint**
```typescript
// Get all users and calculate online status
const usersWithStatus = users.map(user => ({
  ...user,
  isOnline: user.lastSeen >= new Date(Date.now() - 5 * 60 * 1000)
}));
```

## 📊 **API Responses**

### **Homepage Data Response**
```json
{
  "success": true,
  "data": {
    "onlineUsers": [
      {
        "id": "clx1234567890abcdef",
        "firstName": "John",
        "lastName": "Doe",
        "email": "john@example.com",
        "lastSeen": "2024-01-15T10:30:00.000Z"
      }
    ],
    "summary": {
      "onlineUsers": 3
    }
  }
}
```

### **Online Activity Response**
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
    },
    {
      "id": "clx1234567890abcdef",
      "firstName": "Jane",
      "lastName": "Smith",
      "email": "jane@example.com",
      "lastSeen": "2024-01-15T10:25:00.000Z",
      "isOnline": false
    }
  ]
}
```

## 🧪 **Testing the System**

### **1. Test Last Seen Updates**
```bash
# Make a request to update last seen
GET http://localhost:3000/api/homepage
Authorization: Bearer YOUR_JWT_TOKEN
```

### **2. Test Online Status**
```bash
# Check online activity
GET http://localhost:3000/api/homepage/online-activity
Authorization: Bearer YOUR_JWT_TOKEN
```

### **3. Test Time-based Status**
```bash
# Wait 6 minutes, then check again
# User should show as offline
GET http://localhost:3000/api/homepage/online-activity
Authorization: Bearer YOUR_JWT_TOKEN
```

## 🎨 **Frontend Implementation Ideas**

### **Real-time Updates**
```javascript
// Poll every 30 seconds to update online status
setInterval(() => {
  fetch('/api/homepage/online-activity')
    .then(response => response.json())
    .then(data => {
      updateOnlineUsers(data.data);
    });
}, 30000);
```

### **Online Status Indicators**
```javascript
// Show green dot for online users
const OnlineIndicator = ({ user }) => (
  <div className="user-status">
    <span className={`status-dot ${user.isOnline ? 'online' : 'offline'}`}></span>
    <span>{user.firstName} {user.lastName}</span>
    <small>{user.isOnline ? 'Online' : `Last seen ${formatTimeAgo(user.lastSeen)}`}</small>
  </div>
);
```

### **Live Counter**
```javascript
// Show live online count
const OnlineCounter = ({ onlineUsers }) => (
  <div className="online-counter">
    <span className="count">{onlineUsers.length}</span>
    <span className="label">users online</span>
  </div>
);
```

## ⚙️ **Configuration Options**

### **Change Online Threshold**
Currently set to 5 minutes. To change it:

```typescript
// In HomepageController.ts, change this line:
gte: new Date(Date.now() - 5 * 60 * 1000) // 5 minutes

// To something else, e.g., 10 minutes:
gte: new Date(Date.now() - 10 * 60 * 1000) // 10 minutes
```

### **Add More Endpoints**
To track activity on other endpoints, add this to any controller:

```typescript
// Update last seen
await prisma.user.update({
  where: { id: req.user.id },
  data: { lastSeen: new Date() }
});
```

## 🔄 **How It Updates in Real-time**

1. **User makes API call** → `lastSeen` is updated
2. **Homepage loads** → Shows current online users
3. **Other users see updates** → When they refresh or poll
4. **Automatic offline** → After 5 minutes of inactivity

## ✅ **Benefits**

- ✅ **Real-time tracking**: No manual status updates needed
- ✅ **Automatic**: Works without user intervention
- ✅ **Efficient**: Only updates when users are actually active
- ✅ **Flexible**: Easy to adjust online threshold
- ✅ **Scalable**: Works with any number of users

## 🚀 **Current Status**

The system is **fully functional** and working as designed:
- ✅ Last seen updates automatically
- ✅ Online status calculated correctly
- ✅ Homepage shows online users
- ✅ Dedicated online activity endpoint
- ✅ Real-time updates on API calls

The online activity system is ready to use! 🎯 