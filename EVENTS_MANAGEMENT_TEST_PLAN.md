# 🧪 Events Management - Swagger Test Plan

**Testing Guide Based on Workflow**

This document provides a step-by-step guide for testing all Events Management endpoints in Swagger UI, following the complete event lifecycle workflow.

---

## 📋 **Prerequisites**

### **Users Needed for Testing**

You'll need to authenticate as different users for different steps:

1. **Event Organizer** - User who creates and manages events
   - Role: Any authenticated user (e.g., HR Manager, Marketing Manager)
   - Token: Get JWT token for this user

2. **Budget Approver** - User who approves budgets
   - Role: Finance Manager, Department Head, or any user with approval rights
   - Token: Get JWT token for this user

3. **Event Staff** - User who checks in guests
   - Role: Any authenticated user (e.g., Reception staff)
   - Token: Get JWT token for this user

4. **Guest** - External user (no authentication needed for RSVP/Feedback)
   - Email: Use a real email you can access for testing
   - No token needed for RSVP and feedback endpoints

---

## 🎯 **Test Sequence Overview**

Follow this order to test the complete workflow:

1. **Phase 1: Event Creation** (Event Organizer)
2. **Phase 2: Guest Management** (Event Organizer → Guest)
3. **Phase 3: Budget Planning** (Event Organizer)
4. **Phase 4: Budget Approval** (Budget Approver)
5. **Phase 5: Expense Recording** (Event Organizer)
6. **Phase 6: Event Day Operations** (Event Staff)
7. **Phase 7: Feedback Collection** (Guest - No Auth)
8. **Phase 8: Analytics & Reporting** (Event Organizer)

---

## 📊 **Quick Role Reference Table**

| Endpoint | Required Role | Authentication |
|----------|---------------|----------------|
| `POST /events` | Event Organizer | ✅ Required |
| `GET /events` | Any Authenticated User | ✅ Required |
| `GET /events/upcoming` | Any Authenticated User | ✅ Required |
| `GET /events/{id}` | Any Authenticated User | ✅ Required |
| `PUT /events/{id}` | Event Organizer (Author only) | ✅ Required |
| `DELETE /events/{id}` | Event Organizer (Author only) | ✅ Required |
| `POST /events/{eventId}/guests` | Event Organizer | ✅ Required |
| `GET /events/{eventId}/guests` | Any Authenticated User | ✅ Required |
| `POST /events/rsvp/{token}` | **PUBLIC** | ❌ Not Required |
| `POST /events/{eventId}/guests/{guestId}/check-in` | Event Staff | ✅ Required |
| `POST /events/{eventId}/budget-items` | Event Organizer | ✅ Required |
| `GET /events/{eventId}/budget-items` | Any Authenticated User | ✅ Required |
| `POST /events/{eventId}/budget/approve` | Budget Approver | ✅ Required |
| `POST /events/{eventId}/expenses` | Event Organizer | ✅ Required |
| `GET /events/{eventId}/expenses` | Any Authenticated User | ✅ Required |
| `POST /events/{eventId}/feedback` | **PUBLIC** | ❌ Not Required |
| `GET /events/{eventId}/feedback` | Any Authenticated User | ✅ Required |
| `GET /events/{eventId}/analytics` | Any Authenticated User | ✅ Required |
| `POST /events/{eventId}/reports` | Event Organizer | ✅ Required |

---

## 📝 **Detailed Test Steps**

### **PHASE 1: EVENT CREATION** 🎯

#### **Test 1.1: Create a New Event**

**👤 Required Role:** Event Organizer (Any authenticated user)  
**Endpoint:** `POST /events`  
**Tag:** Events Management - Core Events  
**Authentication:** Required (Bearer Token - Event Organizer)

**Request Body:**
```json
{
  "title": "Annual Company Conference 2024",
  "description": "Our annual company-wide conference with keynote speakers and networking opportunities",
  "startDate": "2024-12-15T09:00:00.000Z",
  "endDate": "2024-12-15T17:00:00.000Z",
  "location": "Convention Center, Harare",
  "eventType": "CONFERENCE",
  "maxAttendees": 500,
  "isPublic": false,
  "requiresRSVP": true,
  "rsvpDeadline": "2024-12-10T23:59:59.000Z",
  "estimatedBudget": 50000,
  "checkInRequired": true,
  "feedbackRequired": true
}
```

**Expected Response:**
- Status: `201 Created`
- `success: true`
- `data.budgetStatus: "DRAFT"`
- `data.status: "PLANNING"`
- `data.id` - Save this event ID for next tests

**Verify:**
- ✅ Event created successfully
- ✅ Status is "PLANNING"
- ✅ Budget status is "DRAFT"
- ✅ Google Calendar link created (if enabled)

**Save for Next Steps:**
- Event ID: `_________________`

---

#### **Test 1.2: Get All Events**

**👤 Required Role:** Any Authenticated User  
**Endpoint:** `GET /events`  
**Tag:** Events Management - Core Events  
**Authentication:** Required

**Expected Response:**
- Status: `200 OK`
- List of all active events
- Your newly created event should appear in the list

**Verify:**
- ✅ Event appears in the list
- ✅ Event has correct status

---

#### **Test 1.3: Get Event by ID**

**👤 Required Role:** Any Authenticated User  
**Endpoint:** `GET /events/{id}`  
**Tag:** Events Management - Core Events  
**Authentication:** Required

**Path Parameter:**
- `id`: Use the event ID from Test 1.1

**Expected Response:**
- Status: `200 OK`
- Full event details with author information

**Verify:**
- ✅ Event details match what you created
- ✅ Author information is included

---

#### **Test 1.4: Get Upcoming Events**

**👤 Required Role:** Any Authenticated User  
**Endpoint:** `GET /events/upcoming`  
**Tag:** Events Management - Core Events  
**Authentication:** Required

**Expected Response:**
- Status: `200 OK`
- List of events with startDate >= current date
- Your event should appear if date is in the future

**Verify:**
- ✅ Event appears in upcoming events list

---

### **PHASE 2: GUEST MANAGEMENT** 👥

#### **Test 2.1: Add Guests to Event**

**👤 Required Role:** Event Organizer (Any authenticated user)  
**Endpoint:** `POST /events/{eventId}/guests`  
**Tag:** Events Management - Guest Management  
**Authentication:** Required

**Path Parameter:**
- `eventId`: Use the event ID from Test 1.1

**Request Body:**
```json
{
  "guests": [
    {
      "email": "john.doe@example.com",
      "name": "John Doe",
      "phone": "+263771234567",
      "company": "Tech Corp",
      "title": "CEO",
      "dietaryRequirements": "Vegetarian",
      "accessibilityNeeds": "Wheelchair access",
      "emergencyContact": "Jane Doe",
      "emergencyPhone": "+263771234568"
    },
    {
      "email": "jane.smith@example.com",
      "name": "Jane Smith",
      "phone": "+263779876543",
      "company": "Marketing Inc",
      "title": "Marketing Director"
    }
  ]
}
```

**Expected Response:**
- Status: `201 Created`
- `success: true`
- Array of guest records with `invitationToken` for each guest

**Verify:**
- ✅ Guests created successfully
- ✅ Each guest has unique `invitationToken`
- ✅ Invitation emails sent (check email inboxes)

**Save for Next Steps:**
- Guest 1 ID: `_________________`
- Guest 1 Invitation Token: `_________________`
- Guest 2 ID: `_________________`
- Guest 2 Invitation Token: `_________________`

---

#### **Test 2.2: Get Event Guests**

**👤 Required Role:** Any Authenticated User  
**Endpoint:** `GET /events/{eventId}/guests`  
**Tag:** Events Management - Guest Management  
**Authentication:** Required

**Path Parameter:**
- `eventId`: Use the event ID from Test 1.1

**Query Parameters (Optional):**
- `page`: 1
- `limit`: 10
- `rsvpStatus`: PENDING (to filter)

**Expected Response:**
- Status: `200 OK`
- List of guests with pagination
- All guests should have `rsvpStatus: "PENDING"`

**Verify:**
- ✅ All added guests appear in the list
- ✅ RSVP status is "PENDING" for all

---

#### **Test 2.3: Guest RSVP - Accept (PUBLIC)**

**👤 Required Role:** PUBLIC (No Authentication Required)  
**Endpoint:** `POST /events/rsvp/{invitationToken}`  
**Tag:** Events Management - Guest Management  
**Authentication:** NOT Required (Public Endpoint)

**Path Parameter:**
- `invitationToken`: Use Guest 1's invitation token from Test 2.1

**Request Body:**
```json
{
  "rsvpStatus": "ACCEPTED",
  "notes": "Looking forward to attending!"
}
```

**Expected Response:**
- Status: `200 OK`
- `success: true`
- Guest record with `rsvpStatus: "ACCEPTED"`
- `rsvpRespondedAt` timestamp

**Verify:**
- ✅ RSVP recorded successfully
- ✅ RSVP notification email sent to organizer (check organizer's email)

---

#### **Test 2.4: Guest RSVP - Decline (PUBLIC)**

**👤 Required Role:** PUBLIC (No Authentication Required)  
**Endpoint:** `POST /events/rsvp/{invitationToken}`  
**Tag:** Events Management - Guest Management  
**Authentication:** NOT Required

**Path Parameter:**
- `invitationToken`: Use Guest 2's invitation token from Test 2.1

**Request Body:**
```json
{
  "rsvpStatus": "DECLINED",
  "notes": "Sorry, have a scheduling conflict"
}
```

**Expected Response:**
- Status: `200 OK`
- Guest record with `rsvpStatus: "DECLINED"`

**Verify:**
- ✅ RSVP recorded successfully
- ✅ RSVP notification email sent to organizer

---

#### **Test 2.5: Guest RSVP - Maybe (PUBLIC)**

**👤 Required Role:** PUBLIC (No Authentication Required)  
**Endpoint:** `POST /events/rsvp/{invitationToken}`  
**Tag:** Events Management - Guest Management  
**Authentication:** NOT Required

**Note:** Add another guest first, then test MAYBE response

**Request Body:**
```json
{
  "rsvpStatus": "MAYBE",
  "notes": "I'll confirm closer to the date"
}
```

**Expected Response:**
- Status: `200 OK`
- Guest record with `rsvpStatus: "MAYBE"`

**Verify:**
- ✅ RSVP recorded successfully

---

### **PHASE 3: BUDGET PLANNING** 💰

#### **Test 3.1: Add Budget Items**

**👤 Required Role:** Event Organizer (Any authenticated user)  
**Endpoint:** `POST /events/{eventId}/budget-items`  
**Tag:** Events Management - Budget Management  
**Authentication:** Required

**Path Parameter:**
- `eventId`: Use the event ID from Test 1.1

**Request Body:**
```json
{
  "budgetItems": [
    {
      "category": "VENUE",
      "itemName": "Conference Hall Rental",
      "description": "Main conference hall for 500 people",
      "estimatedCost": 15000,
      "quantity": 1,
      "unit": "day",
      "vendor": "Convention Center",
      "vendorContact": "events@convention.com",
      "notes": "Includes AV equipment"
    },
    {
      "category": "CATERING",
      "itemName": "Lunch Catering",
      "description": "Buffet lunch for 500 attendees",
      "estimatedCost": 25000,
      "quantity": 500,
      "unit": "person",
      "vendor": "Catering Co",
      "vendorContact": "orders@catering.com"
    },
    {
      "category": "TECHNOLOGY",
      "itemName": "AV Equipment Rental",
      "description": "Sound system, projectors, microphones",
      "estimatedCost": 5000,
      "quantity": 1,
      "unit": "package",
      "vendor": "AV Solutions",
      "vendorContact": "rentals@avsolutions.com"
    }
  ]
}
```

**Expected Response:**
- Status: `201 Created`
- `success: true`
- Array of budget items created

**Verify:**
- ✅ Budget items created successfully
- ✅ Event budget status changed to "SUBMITTED"
- ✅ Event status changed to "BUDGET_PENDING"

**Next Step:** Get event by ID to verify status changes

---

#### **Test 3.2: Get Event Budget Items**

**👤 Required Role:** Any Authenticated User  
**Endpoint:** `GET /events/{eventId}/budget-items`  
**Tag:** Events Management - Budget Management  
**Authentication:** Required

**Path Parameter:**
- `eventId`: Use the event ID from Test 1.1

**Expected Response:**
- Status: `200 OK`
- List of all budget items for the event

**Verify:**
- ✅ All budget items appear
- ✅ Total estimated cost matches sum of items

---

#### **Test 3.3: Verify Event Status Changed**

**👤 Required Role:** Any Authenticated User  
**Endpoint:** `GET /events/{id}`  
**Tag:** Events Management - Core Events  
**Authentication:** Required

**Path Parameter:**
- `id`: Use the event ID from Test 1.1

**Expected Response:**
- Status: `200 OK`
- `data.budgetStatus: "SUBMITTED"`
- `data.status: "BUDGET_PENDING"`

**Verify:**
- ✅ Budget status is "SUBMITTED"
- ✅ Event status is "BUDGET_PENDING"

---

### **PHASE 4: BUDGET APPROVAL** ✅

#### **Test 4.1: Approve Event Budget**

**👤 Required Role:** Budget Approver (Finance Manager, Department Head, or any user with approval rights)  
**Endpoint:** `POST /events/{eventId}/budget/approve`  
**Tag:** Events Management - Budget Management  
**Authentication:** Required (Budget Approver token)

**Path Parameter:**
- `eventId`: Use the event ID from Test 1.1

**Request Body:**
```json
{
  "approvedBudget": 48000,
  "notes": "Approved with minor adjustments to catering costs"
}
```

**Expected Response:**
- Status: `200 OK`
- `success: true`
- `data.budgetStatus: "APPROVED"`
- `data.status: "BUDGET_APPROVED"`
- `data.approvedBudget: 48000`

**Verify:**
- ✅ Budget approved successfully
- ✅ Budget approval email sent to organizer (check organizer's email)
- ✅ Journal entry created for budget allocation

**Next Step:** Verify event status changed

---

#### **Test 4.2: Verify Budget Approval Status**

**👤 Required Role:** Any Authenticated User  
**Endpoint:** `GET /events/{id}`  
**Tag:** Events Management - Core Events  
**Authentication:** Required

**Path Parameter:**
- `id`: Use the event ID from Test 1.1

**Expected Response:**
- Status: `200 OK`
- `data.budgetStatus: "APPROVED"`
- `data.status: "BUDGET_APPROVED"`
- `data.approvedBudget: 48000`
- `data.budgetApprovedAt` - timestamp
- `data.budgetApprovedBy` - approver user ID

**Verify:**
- ✅ Budget status is "APPROVED"
- ✅ Event status is "BUDGET_APPROVED"
- ✅ Approved budget amount is correct

---

#### **Test 4.3: Try to Approve Budget Again (Should Fail)**

**👤 Required Role:** Budget Approver  
**Endpoint:** `POST /events/{eventId}/budget/approve`  
**Tag:** Events Management - Budget Management  
**Authentication:** Required

**Path Parameter:**
- `eventId`: Use the event ID from Test 1.1

**Request Body:**
```json
{
  "approvedBudget": 50000,
  "notes": "Trying to approve again"
}
```

**Expected Response:**
- Status: `400 Bad Request` or `500 Error`
- Error message indicating budget is not in SUBMITTED status

**Verify:**
- ✅ System prevents approving already approved budget
- ✅ Error message is clear

---

### **PHASE 5: EXPENSE RECORDING** 💳

#### **Test 5.1: Record Event Expense (After Budget Approval)**

**👤 Required Role:** Event Organizer (Any authenticated user)  
**Endpoint:** `POST /events/{eventId}/expenses`  
**Tag:** Events Management - Expense Management  
**Authentication:** Required

**Path Parameter:**
- `eventId`: Use the event ID from Test 1.1

**Request Body:**
```json
{
  "description": "Catering services for lunch",
  "amount": 5000,
  "category": "CATERING",
  "vendor": "Catering Co",
  "paymentMethod": "BANK",
  "paymentDate": "2024-12-15T12:00:00.000Z",
  "isTaxable": true,
  "receiptNumber": "REC-001",
  "receiptPath": "/uploads/receipts/catering-receipt.pdf"
}
```

**Expected Response:**
- Status: `201 Created`
- `success: true`
- `data.status: "APPROVED"`
- Expense record with journal entry created

**Verify:**
- ✅ Expense recorded successfully
- ✅ VAT calculated automatically (14.5% if taxable)
- ✅ Journal entry created in accounting system
- ✅ Expense status is "APPROVED"

**Save for Next Steps:**
- Expense ID: `_________________`

---

#### **Test 5.2: Record Another Expense**

**👤 Required Role:** Event Organizer (Any authenticated user)  
**Endpoint:** `POST /events/{eventId}/expenses`  
**Tag:** Events Management - Expense Management  
**Authentication:** Required

**Request Body:**
```json
{
  "description": "Venue rental payment",
  "amount": 15000,
  "category": "VENUE",
  "vendor": "Convention Center",
  "paymentMethod": "BANK",
  "paymentDate": "2024-12-10T10:00:00.000Z",
  "isTaxable": true,
  "receiptNumber": "REC-002"
}
```

**Expected Response:**
- Status: `201 Created`
- Expense recorded successfully

**Verify:**
- ✅ Multiple expenses can be recorded
- ✅ Each expense creates separate journal entry

---

#### **Test 5.3: Record Non-Taxable Expense**

**👤 Required Role:** Event Organizer (Any authenticated user)  
**Endpoint:** `POST /events/{eventId}/expenses`  
**Tag:** Events Management - Expense Management  
**Authentication:** Required

**Request Body:**
```json
{
  "description": "Donation to charity",
  "amount": 1000,
  "category": "OTHER",
  "vendor": "Charity Foundation",
  "paymentMethod": "CASH",
  "isTaxable": false,
  "receiptNumber": "REC-003"
}
```

**Expected Response:**
- Status: `201 Created`
- Expense recorded with VAT = 0

**Verify:**
- ✅ Non-taxable expense recorded
- ✅ No VAT calculated
- ✅ Journal entry created without VAT

---

#### **Test 5.4: Try to Record Expense Before Budget Approval (Should Fail)**

**👤 Required Role:** Event Organizer (Any authenticated user)  
**Endpoint:** `POST /events/{eventId}/expenses`  
**Tag:** Events Management - Expense Management  
**Authentication:** Required

**Note:** Create a new event, add budget items, but DON'T approve budget. Then try to record expense.

**Expected Response:**
- Status: `400 Bad Request` or `500 Error`
- Error message: "Event budget must be approved before recording expenses"

**Verify:**
- ✅ System prevents recording expenses before budget approval
- ✅ Error message is clear

---

#### **Test 5.5: Get Event Expenses**

**👤 Required Role:** Any Authenticated User  
**Endpoint:** `GET /events/{eventId}/expenses`  
**Tag:** Events Management - Expense Management  
**Authentication:** Required

**Path Parameter:**
- `eventId`: Use the event ID from Test 1.1

**Expected Response:**
- Status: `200 OK`
- List of all expenses for the event

**Verify:**
- ✅ All recorded expenses appear
- ✅ Expenses are ordered by creation date (newest first)

---

### **PHASE 6: EVENT DAY OPERATIONS** 📅

#### **Test 6.1: Check In Guest**

**👤 Required Role:** Event Staff (Any authenticated user - Reception staff, event coordinator, etc.)  
**Endpoint:** `POST /events/{eventId}/guests/{guestId}/check-in`  
**Tag:** Events Management - Guest Management  
**Authentication:** Required (Event Staff token)

**Path Parameters:**
- `eventId`: Use the event ID from Test 1.1
- `guestId`: Use Guest 1 ID from Test 2.1 (who accepted RSVP)

**Request Body:**
```json
{
  "notes": "Checked in at main entrance at 9:15 AM"
}
```

**Expected Response:**
- Status: `201 Created`
- `success: true`
- Check-in record created

**Verify:**
- ✅ Guest checked in successfully
- ✅ Guest status updated to "Checked In"
- ✅ Check-in timestamp recorded
- ✅ Staff member who checked in is recorded

---

#### **Test 6.2: Verify Guest Check-In Status**

**👤 Required Role:** Any Authenticated User  
**Endpoint:** `GET /events/{eventId}/guests`  
**Tag:** Events Management - Guest Management  
**Authentication:** Required

**Path Parameter:**
- `eventId`: Use the event ID from Test 1.1

**Expected Response:**
- Status: `200 OK`
- Guest 1 should have:
  - `checkedIn: true`
  - `checkedInAt: timestamp`
  - `checkedInBy: staff user ID`

**Verify:**
- ✅ Guest check-in status updated correctly

---

#### **Test 6.3: Try to Check In Same Guest Twice (Should Fail or Update)**

**👤 Required Role:** Event Staff (Any authenticated user)  
**Endpoint:** `POST /events/{eventId}/guests/{guestId}/check-in`  
**Tag:** Events Management - Guest Management  
**Authentication:** Required

**Path Parameters:**
- `eventId`: Use the event ID from Test 1.1
- `guestId`: Use Guest 1 ID (already checked in)

**Expected Response:**
- Status: `400 Bad Request` or `200 OK` (if it updates)
- Check system behavior

**Verify:**
- ✅ System handles duplicate check-in appropriately

---

### **PHASE 7: FEEDBACK COLLECTION** 💬

#### **Test 7.1: Submit Feedback (PUBLIC)**

**👤 Required Role:** PUBLIC (No Authentication Required)  
**Endpoint:** `POST /events/{eventId}/feedback`  
**Tag:** Events Management - Feedback Management  
**Authentication:** NOT Required (Public Endpoint)

**Path Parameter:**
- `eventId`: Use the event ID from Test 1.1

**Request Body:**
```json
{
  "rating": 5,
  "overallSatisfaction": 5,
  "contentQuality": 4,
  "venueQuality": 5,
  "foodQuality": 4,
  "organization": 5,
  "positiveAspects": "Great speakers and networking opportunities",
  "areasForImprovement": "Better signage for breakout sessions",
  "suggestions": "Consider longer breaks between sessions",
  "wouldAttendAgain": true,
  "wouldRecommend": true,
  "additionalComments": "Overall excellent event!",
  "anonymous": false,
  "guestId": "guest-id-from-test-2-1"
}
```

**Expected Response:**
- Status: `201 Created`
- `success: true`
- Feedback record created

**Verify:**
- ✅ Feedback submitted successfully
- ✅ All rating fields saved

---

#### **Test 7.2: Submit Anonymous Feedback (PUBLIC)**

**👤 Required Role:** PUBLIC (No Authentication Required)  
**Endpoint:** `POST /events/{eventId}/feedback`  
**Tag:** Events Management - Feedback Management  
**Authentication:** NOT Required

**Path Parameter:**
- `eventId`: Use the event ID from Test 1.1

**Request Body:**
```json
{
  "rating": 4,
  "overallSatisfaction": 4,
  "contentQuality": 4,
  "venueQuality": 4,
  "foodQuality": 3,
  "organization": 4,
  "positiveAspects": "Good content",
  "areasForImprovement": "Food could be better",
  "wouldAttendAgain": true,
  "wouldRecommend": true,
  "anonymous": true
}
```

**Expected Response:**
- Status: `201 Created`
- Feedback record with `anonymous: true`

**Verify:**
- ✅ Anonymous feedback submitted
- ✅ Guest ID not linked (or null)

---

#### **Test 7.3: Get Event Feedback**

**👤 Required Role:** Any Authenticated User  
**Endpoint:** `GET /events/{eventId}/feedback`  
**Tag:** Events Management - Feedback Management  
**Authentication:** Required

**Path Parameter:**
- `eventId`: Use the event ID from Test 1.1

**Expected Response:**
- Status: `200 OK`
- List of all feedback for the event
- Includes guest information (unless anonymous)

**Verify:**
- ✅ All feedback appears
- ✅ Anonymous feedback doesn't show guest info
- ✅ Non-anonymous feedback shows guest info

---

### **PHASE 8: ANALYTICS & REPORTING** 📊

#### **Test 8.1: Get Event Analytics**

**👤 Required Role:** Any Authenticated User  
**Endpoint:** `GET /events/{eventId}/analytics`  
**Tag:** Events Management - Analytics & Reporting  
**Authentication:** Required

**Path Parameter:**
- `eventId`: Use the event ID from Test 1.1

**Expected Response:**
- Status: `200 OK`
- Analytics object with:
  - `totalGuests`: 2 (or number of guests added)
  - `acceptedGuests`: 1 (who accepted RSVP)
  - `checkedInGuests`: 1 (who checked in)
  - `feedbackCount`: 2 (or number of feedback submitted)
  - `rsvpRate`: percentage
  - `checkInRate`: percentage
  - `feedbackRate`: percentage
  - `averageRating`: calculated average
  - `totalBudget`: 48000
  - `totalExpenses`: sum of all expenses
  - `budgetUtilization`: percentage
  - `budgetVariance`: difference
  - `costPerAttendee`: calculated value

**Verify:**
- ✅ All metrics calculated correctly
- ✅ Percentages are accurate
- ✅ Budget vs actual comparison is correct

---

#### **Test 8.2: Generate Comprehensive Report**

**👤 Required Role:** Event Organizer (Any authenticated user)  
**Endpoint:** `POST /events/{eventId}/reports`  
**Tag:** Events Management - Analytics & Reporting  
**Authentication:** Required

**Path Parameter:**
- `eventId`: Use the event ID from Test 1.1

**Request Body:**
```json
{
  "reportType": "COMPREHENSIVE"
}
```

**Expected Response:**
- Status: `201 Created`
- `success: true`
- Report object with all metrics and recommendations

**Verify:**
- ✅ Report generated successfully
- ✅ All metrics included
- ✅ Recommendations provided

---

#### **Test 8.3: Generate Financial Report**

**👤 Required Role:** Event Organizer (Any authenticated user)  
**Endpoint:** `POST /events/{eventId}/reports`  
**Tag:** Events Management - Analytics & Reporting  
**Authentication:** Required

**Request Body:**
```json
{
  "reportType": "FINANCIAL"
}
```

**Expected Response:**
- Status: `201 Created`
- Report focused on financial metrics

**Verify:**
- ✅ Financial report generated
- ✅ Budget vs actual expenses included

---

#### **Test 8.4: Generate Attendance Report**

**👤 Required Role:** Event Organizer (Any authenticated user)  
**Endpoint:** `POST /events/{eventId}/reports`  
**Tag:** Events Management - Analytics & Reporting  
**Authentication:** Required

**Request Body:**
```json
{
  "reportType": "ATTENDANCE"
}
```

**Expected Response:**
- Status: `201 Created`
- Report focused on attendance metrics

**Verify:**
- ✅ Attendance report generated
- ✅ RSVP and check-in statistics included

---

#### **Test 8.5: Generate Feedback Report**

**👤 Required Role:** Event Organizer (Any authenticated user)  
**Endpoint:** `POST /events/{eventId}/reports`  
**Tag:** Events Management - Analytics & Reporting  
**Authentication:** Required

**Request Body:**
```json
{
  "reportType": "FEEDBACK"
}
```

**Expected Response:**
- Status: `201 Created`
- Report focused on feedback metrics

**Verify:**
- ✅ Feedback report generated
- ✅ Satisfaction ratings and feedback analysis included

---

### **ADDITIONAL TESTS: UPDATE & DELETE** 🔄

#### **Test 9.1: Update Event**

**👤 Required Role:** Event Organizer (Must be event author - only author can update)  
**Endpoint:** `PUT /events/{id}`  
**Tag:** Events Management - Core Events  
**Authentication:** Required

**Path Parameter:**
- `id`: Use the event ID from Test 1.1

**Request Body:**
```json
{
  "title": "Updated Annual Company Conference 2024",
  "description": "Updated description",
  "startDate": "2024-12-15T09:00:00.000Z",
  "endDate": "2024-12-15T17:00:00.000Z",
  "location": "Updated Convention Center"
}
```

**Expected Response:**
- Status: `200 OK`
- Event updated successfully

**Verify:**
- ✅ Event updated successfully
- ✅ Only author can update (test with different user to verify restriction)

---

#### **Test 9.2: Try to Update Event as Non-Author (Should Fail)**

**👤 Required Role:** Any Authenticated User (but must be event author to succeed)  
**Endpoint:** `PUT /events/{id}`  
**Tag:** Events Management - Core Events  
**Authentication:** Required

**Expected Response:**
- Status: `403 Forbidden`
- Error: "You can only edit your own events"

**Verify:**
- ✅ System prevents non-authors from updating events

---

#### **Test 9.3: Delete Event (Soft Delete)**

**👤 Required Role:** Event Organizer (Must be event author - only author can delete)  
**Endpoint:** `DELETE /events/{id}`  
**Tag:** Events Management - Core Events  
**Authentication:** Required

**Path Parameter:**
- `id`: Use the event ID from Test 1.1

**Expected Response:**
- Status: `200 OK`
- `success: true`
- Event soft deleted (isActive = false)

**Verify:**
- ✅ Event deleted successfully
- ✅ Event no longer appears in active events list
- ✅ Event still exists in database (soft delete)

---

#### **Test 9.4: Try to Delete Event as Non-Author (Should Fail)**

**👤 Required Role:** Any Authenticated User (but must be event author to succeed)  
**Endpoint:** `DELETE /events/{id}`  
**Tag:** Events Management - Core Events  
**Authentication:** Required

**Expected Response:**
- Status: `403 Forbidden`
- Error: "You can only delete your own events"

**Verify:**
- ✅ System prevents non-authors from deleting events

---

## ✅ **Test Checklist**

Use this checklist to track your testing progress:

### **Phase 1: Event Creation**
- [ ] Create new event
- [ ] Get all events
- [ ] Get event by ID
- [ ] Get upcoming events

### **Phase 2: Guest Management**
- [ ] Add guests to event
- [ ] Get event guests
- [ ] Guest RSVP - Accept
- [ ] Guest RSVP - Decline
- [ ] Guest RSVP - Maybe

### **Phase 3: Budget Planning**
- [ ] Add budget items
- [ ] Get budget items
- [ ] Verify status changed to SUBMITTED

### **Phase 4: Budget Approval**
- [ ] Approve budget
- [ ] Verify budget approval status
- [ ] Try to approve again (should fail)

### **Phase 5: Expense Recording**
- [ ] Record expense (after approval)
- [ ] Record multiple expenses
- [ ] Record non-taxable expense
- [ ] Try to record expense before approval (should fail)
- [ ] Get event expenses

### **Phase 6: Event Day Operations**
- [ ] Check in guest
- [ ] Verify check-in status
- [ ] Try duplicate check-in

### **Phase 7: Feedback Collection**
- [ ] Submit feedback
- [ ] Submit anonymous feedback
- [ ] Get event feedback

### **Phase 8: Analytics & Reporting**
- [ ] Get event analytics
- [ ] Generate comprehensive report
- [ ] Generate financial report
- [ ] Generate attendance report
- [ ] Generate feedback report

### **Additional Tests**
- [ ] Update event
- [ ] Try to update as non-author (should fail)
- [ ] Delete event
- [ ] Try to delete as non-author (should fail)

---

## 🐛 **Common Issues to Watch For**

1. **Authentication Errors**
   - Make sure you're using the correct user token for each test
   - Public endpoints (RSVP, Feedback) should NOT require authentication

2. **Status Validation Errors**
   - Budget must be SUBMITTED before approval
   - Budget must be APPROVED before recording expenses
   - Check error messages are clear

3. **Email Delivery**
   - Check email inboxes for invitation emails
   - Check organizer email for RSVP notifications
   - Check organizer email for budget approval notification

4. **Data Consistency**
   - Verify status changes after each action
   - Verify calculations in analytics are correct
   - Verify journal entries are created correctly

---

## 📝 **Notes Section**

Use this space to record any issues, observations, or notes during testing:

```
Test Date: _________________
Tester: _________________

Issues Found:
1. 
2. 
3. 

Observations:
1. 
2. 
3. 

```

---

**Happy Testing! 🎉**

