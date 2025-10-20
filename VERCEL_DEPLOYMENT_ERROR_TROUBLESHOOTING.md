# 🚨 VERCEL DEPLOYMENT ERROR TROUBLESHOOTING

## Error: `INTERNAL_FUNCTION_INVOCATION_FAILED`

**Error ID**: `cpt1::lhqf4-1760949027935-9c61a98707a8`  
**Date**: October 16, 2025  
**Status**: 🔴 CRITICAL - Application not accessible

---

## 📋 QUICK DIAGNOSIS

This error typically indicates one of these issues:

1. **❌ Build Failure** - TypeScript compilation errors
2. **❌ Missing Dependencies** - Package installation issues  
3. **❌ Environment Variables** - Missing required env vars
4. **❌ Database Connection** - Prisma/MySQL connection issues
5. **❌ Memory/Timeout** - Function execution limits exceeded
6. **❌ Import Errors** - Module resolution failures

---

## 🔍 STEP-BY-STEP DEBUGGING

### Step 1: Check Vercel Build Logs

**Access Vercel Dashboard:**
1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Select your project: `nvccz-pi`
3. Click on the failed deployment
4. Check **"Build Logs"** tab

**Look for these error patterns:**

```bash
# TypeScript compilation errors
error TS2307: Cannot find module './config/swagger'
error TS2339: Property 'xyz' does not exist on type 'ABC'

# Missing dependencies
Error: Cannot find module 'zeptomail'
Error: Cannot find module '@prisma/client'

# Environment variable errors
Error: DATABASE_URL is not defined
Error: JWT_SECRET is not defined

# Prisma errors
Error: Can't reach database server
Error: Invalid database URL
```

---

### Step 2: Verify Environment Variables

**Required Environment Variables:**

```bash
# Database
DATABASE_URL="mysql://username:password@host:port/database"

# JWT
JWT_SECRET="your-super-secret-jwt-key-here"

# Server
NODE_ENV="production"
PORT="3000"

# CORS
CORS_ORIGINS="https://nvccz-frontend.vercel.app,https://nvccz.vercel.app"

# Optional
SENTRY_DSN="https://your-sentry-dsn@sentry.io/project-id"
FRONTEND_URL="https://nvccz-frontend.vercel.app"
```

**Check in Vercel Dashboard:**
1. Go to **Settings** → **Environment Variables**
2. Verify all required variables are set
3. Ensure they're available for **Production** environment

---

### Step 3: Check Build Configuration

**Current `vercel.json`:**
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

**Potential Issues:**

1. **❌ TypeScript Build**: Vercel might not be compiling TypeScript
2. **❌ Missing Build Command**: No explicit build step
3. **❌ Prisma Generation**: Database client not generated

---

## 🔧 IMMEDIATE FIXES

### Fix 1: Update `vercel.json` (RECOMMENDED)

```json
{
  "version": 2,
  "builds": [
    {
      "src": "src/app.ts",
      "use": "@vercel/node",
      "config": {
        "maxLambdaSize": "50mb"
      }
    }
  ],
  "routes": [
    { "src": "/(.*)", "dest": "src/app.ts" }
  ],
  "functions": {
    "src/app.ts": {
      "maxDuration": 30
    }
  }
}
```

### Fix 2: Add Build Script to `package.json`

**Current build script:**
```json
{
  "scripts": {
    "build": "npm run prisma:generate && tsc",
    "vercel-build": "npm run build"
  }
}
```

**Ensure this is correct:**
```json
{
  "scripts": {
    "build": "npm run prisma:generate && tsc",
    "vercel-build": "npm run build",
    "start": "node dist/app.js"
  }
}
```

### Fix 3: Check TypeScript Configuration

**Verify `tsconfig.json` exists and is correct:**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

---

## 🚨 CRITICAL ISSUES TO CHECK

### Issue 1: Hardcoded API Key in Email Service

**Problem**: ZeptoMail API key is hardcoded in source code

**Location**: `src/services/EmailNotificationService.ts:5`

```typescript
// ❌ SECURITY RISK - Hardcoded API key
const zeptoToken = "Zoho-enczapikey wSsVR61/+xejCqZ6mzOpJuptkQxSVlmgER993FKmuHb7HKiT8MdvxELKDFWmTfJMFmZvRTRAorookUoIgGZa3dUszgsFASiF9mqRe1U4J3x17qnvhDzPX29dmxCAL4wPwQ1jmWVjFc8q+g==";
```

**Fix**: Move to environment variable

```typescript
// ✅ SECURE - Use environment variable
const zeptoToken = process.env.ZEPTO_MAIL_TOKEN;

if (!zeptoToken) {
  console.error('ZEPTO_MAIL_TOKEN environment variable is required');
  throw new Error('Email service configuration missing');
}
```

**Add to Vercel Environment Variables:**
```
ZEPTO_MAIL_TOKEN=Zoho-enczapikey YOUR_ACTUAL_TOKEN_HERE
```

---

### Issue 2: Swagger Configuration Loading

**Problem**: Swagger spec loading might fail in production

**Location**: `src/app.ts:11-21`

```typescript
let specs: any = { openapi: '3.0.0', info: { title: 'NVCCZ API', version: '1.0.0' }, paths: {} };
try {
  const swagger = require("./config/swagger");
  if (swagger?.specs) {
    specs = swagger.specs;
  }
} catch (e) {
  // Fallback minimal spec is already assigned
}
```

**Potential Issue**: `require("./config/swagger")` might fail if TypeScript compilation issues exist.

**Fix**: Add more robust error handling

```typescript
let specs: any = { openapi: '3.0.0', info: { title: 'NVCCZ API', version: '1.0.0' }, paths: {} };

try {
  const swagger = require("./config/swagger");
  if (swagger?.specs) {
    specs = swagger.specs;
    console.log('✅ Swagger spec loaded successfully');
  }
} catch (e) {
  console.warn('⚠️ Swagger spec loading failed, using fallback:', e.message);
  // Fallback minimal spec is already assigned
}
```

---

### Issue 3: Database Connection

**Problem**: Prisma client might not be generated or database connection fails

**Check**: Ensure Prisma client is generated during build

**In `package.json`:**
```json
{
  "scripts": {
    "build": "npm run prisma:generate && tsc",
    "prisma:generate": "prisma generate"
  }
}
```

**Verify `DATABASE_URL` is correct:**
```bash
# Format should be:
DATABASE_URL="mysql://username:password@host:port/database_name"

# Example:
DATABASE_URL="mysql://user:pass@mysql.example.com:3306/nvccz_production"
```

---

## 🛠️ DEBUGGING STEPS

### Step 1: Test Build Locally

```bash
# 1. Install dependencies
npm install

# 2. Generate Prisma client
npm run prisma:generate

# 3. Build TypeScript
npm run build

# 4. Check if dist/app.js exists
ls -la dist/

# 5. Test the built application
npm start
```

### Step 2: Check for Import Errors

**Common import issues:**

```typescript
// ❌ These might fail in production:
import { EmailNotificationService } from './services/EmailNotificationService';
import { specs } from './config/swagger';

// ✅ Use try-catch for critical imports:
let EmailNotificationService;
try {
  EmailNotificationService = require('./services/EmailNotificationService').EmailNotificationService;
} catch (e) {
  console.error('Failed to load EmailNotificationService:', e);
}
```

### Step 3: Add Debug Logging

**Add to `src/app.ts` at the top:**

```typescript
console.log('🚀 Starting NVCCZ API...');
console.log('Environment:', process.env.NODE_ENV);
console.log('Database URL exists:', !!process.env.DATABASE_URL);
console.log('JWT Secret exists:', !!process.env.JWT_SECRET);
console.log('ZeptoMail Token exists:', !!process.env.ZEPTO_MAIL_TOKEN);
```

---

## 🔄 DEPLOYMENT FIXES

### Fix 1: Force Clean Deploy

```bash
# 1. Delete .vercel folder
rm -rf .vercel

# 2. Clear Vercel cache
vercel --prod --force

# 3. Or redeploy from GitHub
# Push a new commit to trigger fresh deployment
```

### Fix 2: Update Vercel Configuration

**Create/Update `vercel.json`:**

```json
{
  "version": 2,
  "builds": [
    {
      "src": "src/app.ts",
      "use": "@vercel/node",
      "config": {
        "maxLambdaSize": "50mb",
        "includeFiles": ["dist/**", "prisma/**"]
      }
    }
  ],
  "routes": [
    { "src": "/(.*)", "dest": "src/app.ts" }
  ],
  "functions": {
    "src/app.ts": {
      "maxDuration": 30,
      "memory": 1024
    }
  },
  "env": {
    "NODE_ENV": "production"
  }
}
```

### Fix 3: Add Health Check Endpoint

**Add to `src/app.ts`:**

```typescript
// Health check endpoint (before other routes)
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    database: "connected", // Prisma handles connection status
    version: "1.0.0"
  });
});

// Test endpoint
app.get("/test", (req, res) => {
  res.json({
    message: "API is working",
    timestamp: new Date().toISOString(),
    swaggerUrl: '/api-docs'
  });
});
```

---

## 📊 COMMON ERROR PATTERNS

### Pattern 1: Module Resolution Errors

```bash
Error: Cannot find module './config/swagger'
Error: Cannot find module 'zeptomail'
```

**Solution**: Check if all dependencies are in `package.json` and build process includes them.

### Pattern 2: Environment Variable Errors

```bash
Error: DATABASE_URL is not defined
Error: JWT_SECRET is not defined
```

**Solution**: Add all required environment variables in Vercel dashboard.

### Pattern 3: Prisma Client Errors

```bash
Error: PrismaClient is not defined
Error: Can't reach database server
```

**Solution**: Ensure `prisma generate` runs during build and `DATABASE_URL` is correct.

### Pattern 4: Memory/Timeout Errors

```bash
Error: Function execution timeout
Error: Out of memory
```

**Solution**: Increase memory limit in `vercel.json` and optimize imports.

---

## 🎯 QUICK FIX CHECKLIST

- [ ] **Check Vercel build logs** for specific error messages
- [ ] **Verify all environment variables** are set in Vercel dashboard
- [ ] **Test build locally** with `npm run build`
- [ ] **Move hardcoded API key** to environment variables
- [ ] **Add error handling** for Swagger loading
- [ ] **Update `vercel.json`** with proper configuration
- [ ] **Add health check endpoints** for debugging
- [ ] **Force clean deployment** to clear any cached issues

---

## 🚀 DEPLOYMENT COMMANDS

```bash
# 1. Test locally first
npm run build
npm start

# 2. Deploy to Vercel
vercel --prod

# 3. Check deployment status
vercel ls

# 4. View logs
vercel logs [deployment-url]
```

---

## 📞 NEXT STEPS

1. **Check Vercel build logs** for the specific error message
2. **Share the build log output** if the issue persists
3. **Test the health endpoint** once deployed: `https://nvccz-pi.vercel.app/health`
4. **Verify environment variables** are properly set
5. **Consider moving to a more robust deployment strategy** if issues continue

---

**Error ID**: `cpt1::lhqf4-1760949027935-9c61a98707a8`  
**Last Updated**: October 16, 2025  
**Status**: 🔴 Requires immediate attention


