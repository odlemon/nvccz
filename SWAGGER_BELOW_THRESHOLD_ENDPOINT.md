# Swagger Documentation - Below Threshold Endpoint

## ✅ Changes Made to Swagger Configuration

### 1. **Updated Application Stage Enum**

**File:** `src/config/swagger.ts` (Line ~6966)

**Change:** Replaced `REJECTED` with `BELOW_THRESHOLD` in the stage change endpoint enum.

```typescript
enum: [
  'UNDER_DUE_DILIGENCE', 
  'DUE_DILIGENCE_COMPLETED', 
  'UNDER_BOARD_REVIEW', 
  'BOARD_APPROVED', 
  'BOARD_REJECTED', 
  'BOARD_CONDITIONAL', 
  'TERM_SHEET_NEGOTIATION', 
  'IMPLEMENTATION', 
  'FUNDED', 
  'BELOW_THRESHOLD'  // ✅ Changed from 'REJECTED'
]
```

---

### 2. **Added New Endpoint: GET /api/applications/below-threshold**

**File:** `src/config/swagger.ts` (Added after line ~6845)

**Endpoint Details:**

- **Path:** `/applications/below-threshold`
- **Method:** `GET`
- **Tag:** `📝 Stage 0: Shortlist`
- **Authentication:** Required (Bearer Token)
- **Access:** Admin/Fund Manager only

**Query Parameters:**

| Parameter | Type    | Default | Description                |
|-----------|---------|---------|----------------------------|
| `page`    | integer | 1       | Page number for pagination |
| `limit`   | integer | 10      | Number of items per page   |

**Response (200 - Success):**

```json
{
  "success": true,
  "message": "Below threshold applications retrieved successfully",
  "data": [
    {
      "id": "clx1234567890abcdef",
      "businessName": "Legora",
      "applicantName": "Vexi Games",
      "applicantEmail": "veximagames@gmail.com",
      "requestedAmount": 50000,
      "currentStage": "BELOW_THRESHOLD",
      "createdAt": "2025-11-20T10:30:00.000Z",
      "updatedAt": "2025-11-25T05:28:16.883Z"
    }
  ],
  "pagination": {
    "total": 1,
    "page": 1,
    "limit": 10,
    "totalPages": 1
  }
}
```

**Response (401 - Unauthorized):**

```json
{
  "success": false,
  "message": "Unauthorized"
}
```

**Response (500 - Internal Server Error):**

```json
{
  "success": false,
  "message": "Internal server error"
}
```

---

## 📋 Endpoint Description

**Summary:** Get applications below investment threshold (Investor)

**Description:** 
> Retrieve all applications that did not meet investment criteria. These applications are marked as BELOW_THRESHOLD and are filtered out from the main application list. Admin/Fund Manager access required.

---

## 🎯 Purpose

This endpoint allows administrators and fund managers to:

1. **View applications that didn't meet investment criteria** without them cluttering the main application list
2. **Track and analyze** why certain applications were marked below threshold
3. **Maintain a record** of all applications for reporting and analytics purposes
4. **Use softer, more professional language** instead of "REJECTED"

---

## 🔗 Related Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/applications` | Get all active applications (excludes BELOW_THRESHOLD) |
| `GET /api/applications/{id}` | Get specific application details |
| `PUT /api/applications/{id}/stage` | Change application stage (can set to BELOW_THRESHOLD) |

---

## 📍 Location in Swagger UI

When you access the Swagger documentation at:
- **Production:** `https://nvccz-pi.vercel.app/api-docs`
- **Development:** `http://localhost:3000/api-docs`

You will find this endpoint under:
- **Tag:** `📝 Stage 0: Shortlist`
- **Section:** Portfolio Management
- **Position:** Right after the main `GET /api/applications` endpoint

---

## ✅ Testing the Endpoint

### Using Swagger UI:

1. Navigate to `https://nvccz-pi.vercel.app/api-docs`
2. Find the `📝 Stage 0: Shortlist` section
3. Locate `GET /api/applications/below-threshold`
4. Click "Try it out"
5. Enter your Bearer token in the Authorization header
6. Optionally set `page` and `limit` parameters
7. Click "Execute"

### Using cURL:

```bash
curl -X 'GET' \
  'https://nvccz-pi.vercel.app/api/applications/below-threshold?page=1&limit=10' \
  -H 'accept: application/json' \
  -H 'Authorization: Bearer YOUR_TOKEN_HERE'
```

### Using Postman:

```
GET https://nvccz-pi.vercel.app/api/applications/below-threshold
Headers:
  Authorization: Bearer YOUR_TOKEN_HERE
  Accept: application/json
Query Params:
  page: 1
  limit: 10
```

---

## 🚀 Deployment Status

- ✅ **Code Updated:** All service, controller, and route files updated
- ✅ **Database Updated:** All `REJECTED` applications migrated to `BELOW_THRESHOLD`
- ✅ **Swagger Documentation:** Endpoint added and enum updated
- ✅ **Email Templates:** Updated with softer language
- ✅ **Backward Compatibility:** Maintained for existing email functions

**Ready for Production Deployment! 🎉**

---

## 📝 Notes

- The endpoint uses the same authorization middleware as other application endpoints
- Pagination is supported to handle large datasets efficiently
- Applications with `BELOW_THRESHOLD` status are automatically excluded from the main `GET /api/applications` endpoint
- The endpoint returns applications in descending order by `updatedAt` (most recently updated first)

---

**Last Updated:** November 25, 2025
**Status:** ✅ Complete and Ready for Production

