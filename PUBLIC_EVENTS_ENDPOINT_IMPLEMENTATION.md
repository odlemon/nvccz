# How to Implement `GET /api/events/public`

## Overview

This guide explains how the public events endpoint was implemented, so you can clone this pattern for other public endpoints.

---

## Implementation Steps

### 1. **Add Route Before Authentication Middleware**

In `src/routes/eventRoutes.ts`, the public route must be defined **BEFORE** `router.use(authenticate)`:

```typescript
// PUBLIC ROUTES - Must be defined BEFORE authentication middleware
router.get("/public", eventController.getAllEvents);

// All other routes require authentication
router.use(authenticate);
```

**Why?** Routes defined before the middleware are public, routes after require authentication.

---

### 2. **Update Controller to Accept Both Request Types**

In `src/controllers/EventController.ts`, update the method signature to accept both `AuthRequest` and `Request`:

```typescript
// Get all active events (works for both authenticated and public)
async getAllEvents(req: AuthRequest | Request, res: Response) {
  try {
    const events = await prisma.event.findMany({
      where: { isActive: true },
      include: {
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      },
      orderBy: { startDate: 'asc' }
    });

    res.status(200).json({
      success: true,
      data: events
    });
  } catch (error: any) {
    console.error("Error fetching events:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
}
```

**Key Points:**
- Use `req: AuthRequest | Request` to support both authenticated and public access
- Same response format for both public and authenticated endpoints
- No need to check `req.user` since it's optional

---

### 3. **Add Swagger Documentation**

In `src/config/events-endpoints.ts`, add the endpoint definition:

```typescript
'/events/public': {
  get: {
    summary: 'Get all active events (PUBLIC)',
    description: '**PUBLIC ENDPOINT** - No authentication required. Retrieve all active events ordered by start date.',
    tags: ['Events Management - Core Events'],
    // NO security field - means it's public
    responses: {
      200: {
        description: 'Events retrieved successfully',
        content: {
          'application/json': {
            example: {
              success: true,
              data: [/* event objects */]
            }
          }
        }
      }
    }
  }
}
```

**Key Points:**
- **No `security` field** = Public endpoint
- Clear description indicating it's PUBLIC
- Same response format as authenticated endpoint

---

## Response Format

Both public and authenticated endpoints return the same format:

```json
{
  "success": true,
  "data": [
    {
      "id": "event-id",
      "title": "Annual Company Conference",
      "description": "Event description",
      "startDate": "2024-12-15T09:00:00.000Z",
      "endDate": "2024-12-15T17:00:00.000Z",
      "location": "Convention Center",
      "status": "PLANNING",
      "isActive": true,
      "author": {
        "id": "user-id",
        "firstName": "John",
        "lastName": "Doe",
        "email": "john@example.com"
      }
    }
  ]
}
```

---

## How to Clone This Pattern

To create a similar public endpoint for another resource:

### Step 1: Add Public Route
```typescript
// In your routes file (e.g., src/routes/yourRoutes.ts)
router.get("/public", yourController.getAllItems); // BEFORE authenticate middleware
router.use(authenticate); // Then add authentication
```

### Step 2: Update Controller Method
```typescript
// In your controller
async getAllItems(req: AuthRequest | Request, res: Response) {
  // Same logic, same response format
  // No need to check req.user
}
```

### Step 3: Add Swagger Documentation
```typescript
// In your endpoints config file
'/your-resource/public': {
  get: {
    summary: 'Get all items (PUBLIC)',
    description: '**PUBLIC ENDPOINT** - No authentication required.',
    tags: ['Your Tag'],
    // NO security field
    responses: { /* same format */ }
  }
}
```

---

## Example: Complete Implementation

### Route File (`src/routes/eventRoutes.ts`)
```typescript
// PUBLIC ROUTES - Must be defined BEFORE authentication middleware
router.get("/public", eventController.getAllEvents);

// All other routes require authentication
router.use(authenticate);
```

### Controller File (`src/controllers/EventController.ts`)
```typescript
async getAllEvents(req: AuthRequest | Request, res: Response) {
  try {
    const events = await prisma.event.findMany({
      where: { isActive: true },
      include: { author: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: { startDate: 'asc' }
    });

    res.status(200).json({
      success: true,
      data: events
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
}
```

### Swagger Config (`src/config/events-endpoints.ts`)
```typescript
'/events/public': {
  get: {
    summary: 'Get all active events (PUBLIC)',
    description: '**PUBLIC ENDPOINT** - No authentication required.',
    tags: ['Events Management - Core Events'],
    responses: {
      200: { /* response definition */ }
    }
  }
}
```

---

## Testing

### Public Endpoint (No Auth)
```bash
curl http://localhost:3000/api/events/public
```

### Authenticated Endpoint (With Auth)
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3000/api/events
```

Both return the same response format!

---

## Summary

1. ✅ Route defined **before** `router.use(authenticate)`
2. ✅ Controller accepts `AuthRequest | Request`
3. ✅ Same response format for both public and authenticated
4. ✅ Swagger docs with **no security field**
5. ✅ Clear "PUBLIC" indication in description

**Result**: One controller method serves both public and authenticated endpoints with identical responses! 🎉


