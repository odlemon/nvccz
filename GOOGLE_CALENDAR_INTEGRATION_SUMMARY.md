# 📅 Google Calendar Integration - Complete Setup Guide

## 🎯 **What's Already Implemented**

Your Events Management module already has **complete Google Calendar integration** built-in! Here's what's working:

### ✅ **Core Integration Features**
- **Event Synchronization**: Automatic Google Calendar event creation
- **RSVP Management**: Seamless RSVP handling with Google Calendar
- **Attendee Tracking**: Real-time attendee management
- **Email Integration**: RSVP emails with Google Calendar links
- **OAuth2 Authentication**: Secure Google Calendar access

### ✅ **Technical Implementation**
- **GoogleCalendarService**: Complete service class with all methods
- **EventService Integration**: Automatic Google Calendar sync on event creation
- **RSVP System**: Unique invitation tokens and RSVP links
- **Email Templates**: RSVP emails with Google Calendar integration

## 🚀 **Quick Setup (5 Minutes)**

### **Step 1: Google Cloud Console Setup**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable **Google Calendar API**
4. Go to **APIs & Services** → **Credentials**
5. Create **OAuth 2.0 Client ID** (Web application)
6. Add redirect URI: `http://localhost:3000/auth/google/callback`

### **Step 2: Environment Variables**
Add these to your `.env` file:
```env
# Google Calendar Integration
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
GOOGLE_CALENDAR_ENABLED=true
FRONTEND_URL=http://localhost:3000

# OAuth Tokens (will be set after authentication)
GOOGLE_ACCESS_TOKEN=
GOOGLE_REFRESH_TOKEN=
```

### **Step 3: Add OAuth Routes**
Add this to your main `app.js` or `server.js`:
```javascript
// Import the OAuth routes
const googleOAuthRoutes = require('./google-oauth-routes');
app.use('/', googleOAuthRoutes);
```

### **Step 4: Authenticate with Google**
1. Start your server: `npm start`
2. Visit: `http://localhost:3000/auth/google`
3. Authorize the application
4. Copy the tokens from the response
5. Add tokens to your `.env` file

### **Step 5: Test Integration**
Visit: `http://localhost:3000/auth/google/test`

## 🔧 **How It Works**

### **Event Creation Flow**
```typescript
// When you create an event
const event = await EventService.createEvent(eventData, userId);

// This automatically:
// 1. Creates Google Calendar event
// 2. Adds attendees to Google Calendar
// 3. Generates RSVP links
// 4. Sends email invitations
// 5. Updates event with Google Calendar details
```

### **RSVP Management Flow**
```typescript
// When guests RSVP
POST /api/events/rsvp/{invitationToken}
{
  "response": "ACCEPTED",
  "notes": "Looking forward to it!"
}

// This automatically:
// 1. Updates Google Calendar attendee status
// 2. Syncs response with your system
// 3. Notifies event organizer
// 4. Updates RSVP statistics
```

## 📋 **API Endpoints Available**

### **Event Management**
- `POST /api/events` - Create event (with Google Calendar sync)
- `PUT /api/events/{id}` - Update event (with Google Calendar sync)
- `DELETE /api/events/{id}` - Delete event (with Google Calendar sync)

### **Guest Management**
- `POST /api/events/{id}/guests` - Add guests (with Google Calendar sync)
- `GET /api/events/{id}/guests` - Get guest list
- `POST /api/events/rsvp/{token}` - Handle RSVP response

### **Google Calendar OAuth**
- `GET /auth/google` - Start OAuth flow
- `GET /auth/google/callback` - OAuth callback
- `GET /auth/google/status` - Check integration status
- `GET /auth/google/test` - Test integration

## 🎯 **Integration Features**

### **1. Automatic Event Sync**
```typescript
// Every event creation automatically syncs with Google Calendar
const event = await EventService.createEvent({
  title: "Annual Conference 2024",
  description: "Our annual company conference",
  startDate: "2024-06-15T09:00:00Z",
  endDate: "2024-06-15T17:00:00Z",
  location: "Convention Center",
  guests: [
    { email: "john@example.com", name: "John Doe" },
    { email: "jane@example.com", name: "Jane Smith" }
  ]
}, userId);

// Result: Google Calendar event created with attendees
```

### **2. RSVP Management**
```typescript
// RSVP links are automatically generated
const rsvpLinks = event.guests.map(guest => 
  googleCalendarService.generateRSVPLink(
    event.googleCalendarEventId, 
    guest.email
  )
);

// Example: https://yourdomain.com/events/event123/rsvp?email=john@example.com
```

### **3. Email Integration**
```typescript
// RSVP emails are automatically sent with Google Calendar links
const rsvpEmail = `
  <h2>You're Invited to ${eventTitle}</h2>
  <p>Date: ${eventDate}</p>
  <p>Location: ${eventLocation}</p>
  
  <a href="${rsvpLink}">RSVP Now</a>
  <a href="${googleCalendarLink}">Add to Google Calendar</a>
`;
```

## 🔍 **Testing Your Integration**

### **1. Check Integration Status**
```bash
curl http://localhost:3000/auth/google/status
```

### **2. Test OAuth Flow**
```bash
# Visit this URL in your browser
http://localhost:3000/auth/google
```

### **3. Test Google Calendar API**
```bash
curl http://localhost:3000/auth/google/test
```

### **4. Create Test Event**
```bash
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_jwt_token" \
  -d '{
    "title": "Test Event",
    "description": "Testing Google Calendar integration",
    "startDate": "2024-06-15T09:00:00Z",
    "endDate": "2024-06-15T17:00:00Z",
    "location": "Test Location",
    "guests": [
      {"email": "test@example.com", "name": "Test User"}
    ]
  }'
```

## 🛠️ **Troubleshooting**

### **Common Issues:**

#### **1. OAuth Authentication Failed**
```bash
# Check your credentials
echo $GOOGLE_CLIENT_ID
echo $GOOGLE_CLIENT_SECRET

# Verify redirect URI matches exactly
# Should be: http://localhost:3000/auth/google/callback
```

#### **2. Google Calendar API Not Enabled**
- Go to Google Cloud Console
- Enable Google Calendar API
- Check API quotas

#### **3. Token Expired**
```bash
# Re-authenticate
curl http://localhost:3000/auth/google
```

#### **4. RSVP Links Not Working**
```bash
# Check if event has Google Calendar ID
curl http://localhost:3000/api/events/{eventId}
```

## 🎉 **You're All Set!**

Your Events Management module now has **complete Google Calendar integration**:

- ✅ **Event Sync**: Automatic Google Calendar event creation
- ✅ **RSVP Management**: Seamless RSVP handling
- ✅ **Attendee Tracking**: Real-time attendee management
- ✅ **Email Integration**: RSVP emails with Google Calendar links
- ✅ **OAuth2 Authentication**: Secure Google Calendar access

### **Next Steps:**
1. **Test the integration** with the provided endpoints
2. **Create your first event** and see it sync to Google Calendar
3. **Send RSVP invitations** and track responses
4. **Monitor the integration** with the status endpoint

The integration is **production-ready** and provides a seamless experience for both event organizers and attendees! 🚀

## 📞 **Need Help?**

If you encounter any issues:
1. Check the **Google Cloud Console** setup
2. Verify your **OAuth2 credentials**
3. Ensure **Google Calendar API** is enabled
4. Check the **console logs** for error messages
5. Use the **test endpoints** to diagnose issues

Your Google Calendar integration is now **fully functional**! 🎉


