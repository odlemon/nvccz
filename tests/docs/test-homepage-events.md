# 🏠 Homepage Events Testing Guide

## 🎯 **New Events Structure**

The homepage now shows events in two categories:
- **Upcoming Events**: Events with start date >= current date
- **All Events**: All active events regardless of date

## 📋 **Test Steps**

### 1. **Create Events with Different Dates**

**Past Event:**
```bash
POST http://localhost:3000/api/events
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "title": "Past Company Meeting",
  "description": "This event already happened",
  "startDate": "2024-01-01T09:00:00.000Z",
  "endDate": "2024-01-01T17:00:00.000Z",
  "location": "Conference Room A"
}
```

**Current/Future Event:**
```bash
POST http://localhost:3000/api/events
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json

{
  "title": "Upcoming Company Meeting",
  "description": "This event is in the future",
  "startDate": "2024-12-25T09:00:00.000Z",
  "endDate": "2024-12-25T17:00:00.000Z",
  "location": "Conference Room B"
}
```

### 2. **Check Homepage Response**

```bash
GET http://localhost:3000/api/homepage
Authorization: Bearer YOUR_JWT_TOKEN
```

## 📊 **Expected Response Structure**

```json
{
  "success": true,
  "data": {
    "posts": [...],
    "newsletters": [...],
    "events": {
      "upcoming": [
        {
          "id": "clx...",
          "title": "Upcoming Company Meeting",
          "description": "This event is in the future",
          "startDate": "2024-12-25T09:00:00.000Z",
          "endDate": "2024-12-25T17:00:00.000Z",
          "location": "Conference Room B",
          "author": {...},
          "isActive": true,
          "createdAt": "2024-01-15T10:30:00.000Z",
          "updatedAt": "2024-01-15T10:30:00.000Z"
        }
      ],
      "all": [
        {
          "id": "clx...",
          "title": "Past Company Meeting",
          "description": "This event already happened",
          "startDate": "2024-01-01T09:00:00.000Z",
          "endDate": "2024-01-01T17:00:00.000Z",
          "location": "Conference Room A",
          "author": {...},
          "isActive": true,
          "createdAt": "2024-01-15T10:25:00.000Z",
          "updatedAt": "2024-01-15T10:25:00.000Z"
        },
        {
          "id": "clx...",
          "title": "Upcoming Company Meeting",
          "description": "This event is in the future",
          "startDate": "2024-12-25T09:00:00.000Z",
          "endDate": "2024-12-25T17:00:00.000Z",
          "location": "Conference Room B",
          "author": {...},
          "isActive": true,
          "createdAt": "2024-01-15T10:30:00.000Z",
          "updatedAt": "2024-01-15T10:30:00.000Z"
        }
      ]
    },
    "onlineUsers": [...],
    "summary": {
      "totalPosts": 2,
      "totalNewsletters": 1,
      "upcomingEvents": 1,
      "totalEvents": 2,
      "onlineUsers": 3
    }
  }
}
```

## 🎨 **Frontend Usage**

### **Display Upcoming Events (Calendar Widget)**
```javascript
// Show only upcoming events for calendar
const upcomingEvents = homepageData.events.upcoming;
```

### **Display All Events (Events List)**
```javascript
// Show all events in events list
const allEvents = homepageData.events.all;
```

### **Summary Statistics**
```javascript
// Show counts in dashboard
const { upcomingEvents, totalEvents } = homepageData.summary;
```

## ✅ **Benefits**

1. **Better Organization**: Clear separation between upcoming and past events
2. **Calendar Integration**: Easy to show upcoming events in calendar widgets
3. **Complete Overview**: All events available for reference
4. **Flexible Display**: Frontend can choose which events to show where
5. **Performance**: Single API call provides all event data

## 🚀 **Testing Checklist**

- [ ] Create event with past date → Should appear in `all` but not `upcoming`
- [ ] Create event with future date → Should appear in both `upcoming` and `all`
- [ ] Check summary counts → `upcomingEvents` and `totalEvents` should be correct
- [ ] Verify ordering → Events ordered by start date (earliest first)
- [ ] Test with no events → Both arrays should be empty

The homepage now provides a comprehensive view of events with clear categorization! 🎯 