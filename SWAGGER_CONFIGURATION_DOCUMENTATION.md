# 📘 SWAGGER CONFIGURATION DOCUMENTATION

## Project: NVCCZ API
**Last Updated:** October 16, 2025

---

## 📋 TABLE OF CONTENTS

1. [Overview](#overview)
2. [Architecture & Strategy](#architecture--strategy)
3. [Dependencies](#dependencies)
4. [File Structure](#file-structure)
5. [Configuration Files](#configuration-files)
6. [Swagger Spec Generation](#swagger-spec-generation)
7. [UI Implementation (CDN-Based)](#ui-implementation-cdn-based)
8. [Vercel Configuration](#vercel-configuration)
9. [Adding New API Documentation](#adding-new-api-documentation)
10. [Key Features](#key-features)
11. [Accessing Swagger](#accessing-swagger)
12. [Troubleshooting](#troubleshooting)

---

## 1. OVERVIEW

This project uses **Swagger/OpenAPI 3.0.0** for comprehensive API documentation. The configuration is designed to work seamlessly in both **development** and **production** (Vercel) environments.

### Key Highlights:
- ✅ **250+ documented endpoints**
- ✅ **Dual documentation strategy**: JSDoc annotations + Fallback spec
- ✅ **No `swagger-ui-express` dependency** (uses CDN for Vercel compatibility)
- ✅ **Production-ready** with custom HTML rendering
- ✅ **JWT Bearer authentication** integrated
- ✅ **Organized by 40+ tags** (modules)

---

## 2. ARCHITECTURE & STRATEGY

### 🎯 Dual Documentation Strategy

The project implements a **hybrid approach** to ensure Swagger works in all environments:

```
┌─────────────────────────────────────────┐
│   PRIMARY: swagger-jsdoc (JSDoc)       │
│   Scans .ts files for @swagger tags    │
└──────────────┬──────────────────────────┘
               │
               ├─ Success? → Use generated spec
               │
               └─ Failed? → Use FALLBACK spec
                            ↓
              ┌──────────────────────────────┐
              │  FALLBACK: Pre-defined spec  │
              │  (accounting-endpoints.ts)   │
              └──────────────────────────────┘
```

**Why this approach?**
- **Development**: JSDoc annotations provide flexibility and auto-generation
- **Production (Vercel)**: Fallback ensures documentation always available
- **Build failures**: If JSDoc parsing fails, fallback prevents complete failure

---

## 3. DEPENDENCIES

### Package.json Dependencies

```json
{
  "dependencies": {
    "swagger-jsdoc": "^6.2.8"
  },
  "devDependencies": {
    "@types/swagger-jsdoc": "^6.0.4"
  }
}
```

### Notable Exclusions

❌ **NOT USED**: `swagger-ui-express`

**Reason**: Vercel serverless functions don't work well with `swagger-ui-express` static file serving. Instead, we use a custom HTML page with CDN-hosted Swagger UI resources.

---

## 4. FILE STRUCTURE

```
nvccz/
├── src/
│   ├── app.ts                           # Main app, Swagger UI endpoint
│   ├── config/
│   │   ├── swagger.ts                   # Main Swagger configuration
│   │   └── accounting-endpoints.ts      # Fallback spec (accounting module)
│   ├── routes/                          # Route files with @swagger JSDoc
│   │   ├── hardcodedRoleRoutes.ts       # Example with @swagger tags
│   │   ├── procurementRoutes.ts
│   │   ├── vendorQuotationRoutes.ts
│   │   └── [62 other route files...]
│   └── controllers/                     # Controllers (scanned for @swagger)
├── package.json                         # Dependencies
├── vercel.json                          # Vercel deployment config
├── tsconfig.json                        # TypeScript config
└── SWAGGER_PRODUCTION_FIXES.md          # Production fix history
```

---

## 5. CONFIGURATION FILES

### 5.1 `src/config/swagger.ts` (Main Configuration)

**Purpose**: Generates the OpenAPI specification using `swagger-jsdoc`.

**Key Components**:

```typescript
import swaggerJsdoc from 'swagger-jsdoc';
import { accountingEndpoints } from './accounting-endpoints';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'NVCCZ API Documentation',
      version: '1.0.0',
      description: 'A comprehensive API for managing users, roles, and permissions...',
      contact: {
        name: 'API Support',
        email: 'support@nvccz.co.zw'
      },
      license: {
        name: 'ISC',
        url: 'https://opensource.org/licenses/ISC'
      }
    },
    servers: [
      {
        url: 'https://nvccz-pi.vercel.app/api',
        description: 'Production server'
      },
      {
        url: 'http://localhost:3000/api',
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        User: { /* ... */ },
        Role: { /* ... */ },
        LoginRequest: { /* ... */ },
        // 100+ predefined schemas
      }
    },
    security: [
      { bearerAuth: [] }  // Global security requirement
    ]
  },
  apis: ['./src/**/*.ts', './src/routes/**/*.ts', './src/controllers/**/*.ts']
  // ⬆️ Scans these files for @swagger JSDoc comments
};
```

**Spec Generation Logic**:

```typescript
let specs: any;

try {
  specs = swaggerJsdoc(options);
  
  // Check if specs has paths - if not, use fallback
  if (!specs || !specs.paths || Object.keys(specs.paths).length === 0) {
    console.log('Swagger-jsdoc returned empty spec, using fallback');
    specs = fallbackSpec;
  } else {
    // Merge accounting endpoints with generated spec
    specs.paths = { ...specs.paths, ...accountingEndpoints };
  }
} catch (error) {
  console.error('Error generating Swagger spec:', error);
  specs = fallbackSpec;  // Fallback on error
}

export { specs };
```

---

### 5.2 `src/config/accounting-endpoints.ts` (Fallback Spec)

**Purpose**: Pre-defined endpoint specifications as a safety net.

**Structure**:

```typescript
export const accountingEndpoints = {
  '/accounting/inventory/items': {
    post: {
      summary: 'Create inventory item',
      tags: ['Inventory Management'],
      security: [{ bearerAuth: [] }],
      requestBody: { /* ... */ },
      responses: { /* ... */ }
    },
    get: { /* ... */ }
  },
  '/accounting/balance-sheet/generate': {
    post: { /* ... */ }
  },
  // ... 100+ more endpoints
};
```

**Coverage**:
- ✅ All accounting module endpoints
- ✅ Complete request/response schemas
- ✅ Detailed examples and descriptions
- ✅ ~1,800 lines of comprehensive documentation

---

### 5.3 `src/app.ts` (Swagger UI Rendering)

#### Loading Swagger Spec

```typescript
// Load swagger spec with fallback
let specs: any = { 
  openapi: '3.0.0', 
  info: { title: 'NVCCZ API', version: '1.0.0' }, 
  paths: {} 
};

try {
  const swagger = require("./config/swagger");
  if (swagger?.specs) {
    specs = swagger.specs;
  }
} catch (e) {
  // Fallback minimal spec is already assigned
}
```

#### Debug Endpoint (Development Only)

```typescript
if (process.env.NODE_ENV === 'development') {
  app.get('/api-spec', (req, res) => {
    res.json({
      success: true,
      spec: specs,
      paths: Object.keys(specs.paths || {}),
      totalPaths: Object.keys(specs.paths || {}).length,
      environment: process.env.NODE_ENV
    });
  });
}
```

**Usage**: `http://localhost:3000/api-spec` (shows raw spec JSON)

---

## 6. SWAGGER SPEC GENERATION

### How JSDoc Annotations Work

Files in `src/routes/**/*.ts` and `src/controllers/**/*.ts` can include JSDoc comments with `@swagger` tags:

**Example from `src/routes/hardcodedRoleRoutes.ts`**:

```typescript
/**
 * @swagger
 * /hardcoded-roles:
 *   get:
 *     summary: Get all hardcoded roles
 *     description: Retrieve all 35 hardcoded system roles across all 7 departments
 *     tags: [Hardcoded Roles]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Roles retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       code:
 *                         type: string
 *                         example: FIN_MGR
 *       401:
 *         description: Unauthorized
 */
router.get("/", controller.getAllRoles.bind(controller));
```

**⚠️ CRITICAL**: Path must **NOT** include `/api` prefix!

```typescript
// ✅ CORRECT
/**
 * @swagger
 * /hardcoded-roles:
 */

// ❌ WRONG (causes /api/api/ duplication)
/**
 * @swagger
 * /api/hardcoded-roles:
 */
```

**Why?** The Express app adds `/api` prefix via routing:

```typescript
app.use("/api/hardcoded-roles", hardcodedRoleRoutes);
//      ⬆️ /api prefix added here
```

---

## 7. UI IMPLEMENTATION (CDN-Based)

### Why No `swagger-ui-express`?

**Problem**: Vercel serverless functions don't efficiently serve static files. `swagger-ui-express` relies on serving static CSS/JS assets, which causes issues in production.

**Solution**: Custom HTML page that loads Swagger UI from CDN.

### Custom Swagger UI Endpoint

**Location**: `src/app.ts`

```typescript
app.get('/api-docs', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>NVCCZ API Documentation</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      
      <!-- Swagger UI CSS from CDN -->
      <link rel="stylesheet" type="text/css" 
            href="https://unpkg.com/swagger-ui-dist@5.27.1/swagger-ui.css" />
      
      <style>
        /* Custom styling */
        .swagger-ui .topbar { display: none; }
        .swagger-ui .opblock.opblock-post { 
          border-color: #49cc90; 
          background: rgba(73, 204, 144, 0.1); 
        }
        /* ... more custom styles ... */
      </style>
    </head>
    <body>
      <div id="swagger-ui"></div>
      
      <!-- Swagger UI JS from CDN -->
      <script src="https://unpkg.com/swagger-ui-dist@5.27.1/swagger-ui-bundle.js"></script>
      <script src="https://unpkg.com/swagger-ui-dist@5.27.1/swagger-ui-standalone-preset.js"></script>
      
      <script>
        window.onload = function() {
          const ui = SwaggerUIBundle({
            spec: ${JSON.stringify(specs)},  // ⬅️ Inline spec injection
            dom_id: '#swagger-ui',
            deepLinking: true,
            presets: [
              SwaggerUIBundle.presets.apis,
              SwaggerUIStandalonePreset
            ],
            plugins: [
              SwaggerUIBundle.plugins.DownloadUrl
            ],
            layout: "StandaloneLayout",
            persistAuthorization: true,        // ⬅️ Remembers JWT token
            displayRequestDuration: true,
            filter: true,                      // ⬅️ Search/filter endpoints
            showRequestHeaders: true,
            docExpansion: 'list',
            defaultModelsExpandDepth: 1,
            defaultModelExpandDepth: 1,
            tryItOutEnabled: true
          });
        };
      </script>
    </body>
    </html>
  `);
});
```

### Key Features of Custom UI

| Feature | Description |
|---------|-------------|
| **CDN Resources** | Loads CSS/JS from `unpkg.com` (no local static files) |
| **Inline Spec** | Swagger spec injected directly into HTML via `${JSON.stringify(specs)}` |
| **JWT Persistence** | `persistAuthorization: true` saves bearer token in browser |
| **Search/Filter** | `filter: true` enables endpoint search |
| **Try It Out** | `tryItOutEnabled: true` allows testing APIs directly |
| **Custom Styling** | Hide topbar, custom colors for HTTP methods |

---

## 8. VERCEL CONFIGURATION

### `vercel.json`

```json
{
  "version": 2,
  "builds": [
    { "src": "src/app.ts", "use": "@vercel/node" }
  ],
  "routes": [
    { "src": "/(.*)", "dest": "src/app.ts" }
  ]
}
```

**Explanation**:

| Property | Value | Purpose |
|----------|-------|---------|
| `version` | `2` | Vercel platform version |
| `builds[].src` | `src/app.ts` | Entry point for the Node.js app |
| `builds[].use` | `@vercel/node` | Vercel Node.js builder |
| `routes[].src` | `/(.*)`  | Match all routes |
| `routes[].dest` | `src/app.ts` | Route all requests to app.ts |

### Why This Works for Swagger

1. **All routes go to `app.ts`**: Including `/api-docs`, `/api-spec`, and all `/api/*` endpoints
2. **No static file serving needed**: Swagger UI assets loaded from CDN
3. **Spec embedded in HTML**: No separate `/swagger.json` file needed
4. **Serverless compatible**: Each request is handled by a serverless function

### Build Process

**`package.json` build script**:

```json
{
  "scripts": {
    "build": "npm run prisma:generate && tsc",
    "vercel-build": "npm run build"
  }
}
```

**Build steps**:
1. Generate Prisma client
2. Compile TypeScript to JavaScript (→ `dist/` folder)
3. Vercel deploys compiled code

---

## 9. ADDING NEW API DOCUMENTATION

### Method 1: JSDoc Annotations (Recommended)

**Step 1**: Add `@swagger` comment above your route

```typescript
// src/routes/myNewRoutes.ts

/**
 * @swagger
 * /my-new-endpoint:
 *   post:
 *     summary: Create a new resource
 *     tags: [My Module]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Sample Name"
 *     responses:
 *       201:
 *         description: Resource created successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post("/", MyController.create);
```

**Step 2**: Register route in `app.ts`

```typescript
import myNewRoutes from "./routes/myNewRoutes";

// ...

app.use("/api/my-new-endpoint", myNewRoutes);
```

**Step 3**: Verify

```bash
npm run dev
# Visit http://localhost:3000/api-docs
# Search for "My Module" tag
```

---

### Method 2: Add to Fallback Spec (Backup)

If JSDoc doesn't work, add directly to `src/config/accounting-endpoints.ts`:

```typescript
export const accountingEndpoints = {
  // ... existing endpoints ...
  
  '/my-new-endpoint': {
    post: {
      summary: 'Create a new resource',
      tags: ['My Module'],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['name'],
              properties: {
                name: { type: 'string', example: 'Sample Name' }
              }
            }
          }
        }
      },
      responses: {
        201: { description: 'Resource created successfully' },
        400: { description: 'Bad request' },
        401: { description: 'Unauthorized' }
      }
    }
  }
};
```

---

## 10. KEY FEATURES

### 10.1 Modules Documented (40+ Tags)

| Module | Endpoints | Status |
|--------|-----------|--------|
| **Authentication** | 5 | ✅ |
| **Users** | 8 | ✅ |
| **Roles & Permissions** | 6 | ✅ |
| **Accounting** | 50+ | ✅ |
| **Procurement** | 35+ | ✅ |
| **Inventory Management** | 12 | ✅ |
| **Payroll** | 18 | ✅ |
| **Assets** | 15 | ✅ |
| **Investment Module** | 25+ | ✅ |
| **Events Management** | 12 | ✅ |
| **Hardcoded Roles** | 2 | ✅ |
| **... 30+ more** | 80+ | ✅ |

**Total**: 250+ endpoints fully documented

---

### 10.2 Security Scheme

**Global Bearer Auth**:

```yaml
components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

security:
  - bearerAuth: []
```

**How to Use in Swagger UI**:

1. Click **"Authorize"** button (top-right)
2. Enter: `Bearer YOUR_JWT_TOKEN`
3. Click **"Authorize"**
4. All subsequent requests include the token

**Token Persistence**: Enabled via `persistAuthorization: true` (survives page refresh)

---

### 10.3 Predefined Schemas

**Location**: `src/config/swagger.ts` → `components.schemas`

**Examples**:

```yaml
components:
  schemas:
    User:
      type: object
      properties:
        id: { type: string }
        firstName: { type: string }
        lastName: { type: string }
        email: { type: string }
    
    LoginRequest:
      type: object
      required: [email, password]
      properties:
        email: { type: string, format: email }
        password: { type: string }
    
    LoginResponse:
      type: object
      properties:
        success: { type: boolean }
        token: { type: string }
        user: { $ref: '#/components/schemas/User' }
```

**Total Schemas**: 100+ (covers all major data models)

---

### 10.4 Multiple Servers

```yaml
servers:
  - url: https://nvccz-pi.vercel.app/api
    description: Production server
  - url: http://localhost:3000/api
    description: Development server
```

**Benefit**: Users can switch between environments in Swagger UI dropdown.

---

## 11. ACCESSING SWAGGER

### Development

```
http://localhost:3000/api-docs
```

**Prerequisites**:
```bash
npm install
npm run dev
```

### Production

```
https://nvccz-pi.vercel.app/api-docs
```

### Debug Endpoint (Dev Only)

```
http://localhost:3000/api-spec
```

**Returns**:
```json
{
  "success": true,
  "spec": { /* full OpenAPI spec */ },
  "paths": ["/auth/login", "/users", ...],
  "totalPaths": 250,
  "environment": "development"
}
```

---

## 12. TROUBLESHOOTING

### Issue 1: Swagger UI Shows No Endpoints

**Symptom**: `/api-docs` loads but no endpoints visible

**Causes**:
1. JSDoc parsing failed → Check console for errors
2. Wrong path prefix in `@swagger` comments (includes `/api`)

**Solution**:
```bash
# Check debug endpoint
curl http://localhost:3000/api-spec

# If totalPaths is 0 or very low:
# 1. Check swagger-jsdoc is scanning correct paths
# 2. Verify @swagger comments syntax
# 3. Fallback spec should still show accounting endpoints
```

---

### Issue 2: Duplicate `/api/api/` in URLs

**Symptom**: Endpoint shows as `/api/api/accounting/...`

**Cause**: Path in `@swagger` comment includes `/api` prefix

**Solution**: Remove `/api` from JSDoc paths

```typescript
// ❌ WRONG
/**
 * @swagger
 * /api/accounting/inventory:
 */

// ✅ CORRECT
/**
 * @swagger
 * /accounting/inventory:
 */
```

---

### Issue 3: 404 on Swagger Endpoints

**Symptom**: Swagger UI works, but "Try it out" gives 404

**Debug Steps**:

1. **Check actual route registration**:
   ```typescript
   // In app.ts
   app.use("/api/my-route", myRoutes);
   //        ⬆️ This determines the actual URL
   ```

2. **Verify Swagger path matches**:
   ```typescript
   /**
    * @swagger
    * /my-route:  ⬅️ Should NOT include /api
    */
   ```

3. **Test manually**:
   ```bash
   curl -X POST http://localhost:3000/api/my-route \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"test": "data"}'
   ```

---

### Issue 4: Swagger Not Loading on Vercel

**Symptom**: Works locally, but `/api-docs` fails in production

**Checklist**:

1. ✅ Check `vercel.json` routes configuration
2. ✅ Verify build succeeded (check Vercel dashboard)
3. ✅ Ensure CDN URLs are accessible:
   - `https://unpkg.com/swagger-ui-dist@5.27.1/swagger-ui.css`
   - `https://unpkg.com/swagger-ui-dist@5.27.1/swagger-ui-bundle.js`
4. ✅ Check browser console for JavaScript errors

**Quick Fix**: Deploy with `vercel --prod` and check logs

---

### Issue 5: Unauthorized Errors Despite Valid Token

**Symptom**: All endpoints return 401 in Swagger UI

**Solution**:

1. Ensure token format is correct:
   ```
   Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```
   ⚠️ **Must include "Bearer " prefix**

2. Check token expiration:
   ```bash
   # Decode JWT (use jwt.io)
   # Check "exp" claim
   ```

3. Verify Authorization header in browser DevTools:
   ```
   Network → Request → Headers → Authorization: Bearer ...
   ```

---

### Issue 6: Schema References Not Working

**Symptom**: `$ref: '#/components/schemas/User'` shows as undefined

**Cause**: Schema not defined in `components.schemas`

**Solution**: Add schema to `src/config/swagger.ts`:

```typescript
const options = {
  definition: {
    // ...
    components: {
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' }
          }
        }
      }
    }
  }
};
```

---

## 📊 SUMMARY TABLE

| Aspect | Implementation | Notes |
|--------|---------------|-------|
| **OpenAPI Version** | 3.0.0 | Industry standard |
| **Spec Generation** | `swagger-jsdoc` | Scans `@swagger` JSDoc tags |
| **Fallback Strategy** | Pre-defined spec in `accounting-endpoints.ts` | Ensures production reliability |
| **UI Library** | Swagger UI (CDN) | No `swagger-ui-express` dependency |
| **CDN Version** | `swagger-ui-dist@5.27.1` | Loaded from unpkg.com |
| **Total Endpoints** | 250+ | Across 40+ modules |
| **Authentication** | JWT Bearer Token | Global security scheme |
| **Development URL** | `http://localhost:3000/api-docs` | |
| **Production URL** | `https://nvccz-pi.vercel.app/api-docs` | Vercel deployment |
| **Debug Endpoint** | `/api-spec` (dev only) | Shows raw spec JSON |
| **Vercel Config** | `vercel.json` | Routes all requests to `app.ts` |
| **Build Command** | `npm run build` | Prisma + TypeScript compilation |

---

## 🎯 BEST PRACTICES

### ✅ DO

1. **Use JSDoc annotations** for new endpoints (primary method)
2. **Omit `/api` prefix** in Swagger paths (app.ts handles it)
3. **Add detailed examples** in request/response schemas
4. **Group endpoints by tags** (modules)
5. **Test in Swagger UI** before deploying
6. **Use predefined schemas** via `$ref` for consistency

### ❌ DON'T

1. **Don't include `/api` in `@swagger` paths** (causes duplication)
2. **Don't use `swagger-ui-express`** (Vercel incompatible)
3. **Don't forget to add routes to `app.ts`** (registration required)
4. **Don't omit security requirements** for protected endpoints
5. **Don't hardcode tokens in examples** (use placeholders)

---

## 📚 ADDITIONAL DOCUMENTATION

Related documentation files in this project:

- `SWAGGER_PRODUCTION_FIXES.md` - History of Swagger production issues and fixes
- `HARDCODED_ROLES_API_DOCUMENTATION.md` - Example of API-specific documentation
- `PROCUREMENT_END_TO_END_TESTING_GUIDE.md` - Integration testing with Swagger
- `tests/docs/SWAGGER_GUIDE.md` - Testing Swagger endpoints

---

## 🔗 EXTERNAL RESOURCES

- [Swagger/OpenAPI Specification](https://swagger.io/specification/)
- [swagger-jsdoc Documentation](https://github.com/Surnet/swagger-jsdoc)
- [Swagger UI Documentation](https://swagger.io/docs/open-source-tools/swagger-ui/)
- [Vercel Node.js Deployment](https://vercel.com/docs/functions/serverless-functions/runtimes/node-js)

---

**Documentation Prepared By**: AI Assistant  
**Project**: NVCCZ ERP API  
**Date**: October 16, 2025  
**Status**: ✅ Production-Ready






