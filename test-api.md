# API Testing Guide - Debug Deployment Issues

## 🚨 Issue: 404 Error on Homepage Endpoint

You're getting a 404 error when accessing `https://nvccz-pi.vercel.app/api/homepage/`

## 🔍 Debug Steps

### Step 1: Test Health Endpoint
First, let's check if the API is running at all:

```bash
curl -X GET https://nvccz-pi.vercel.app/health
```

**Expected Response:**
```json
{
  "status": "OK",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "environment": "production",
  "database": "connected"
}
```

### Step 2: Test Authentication
If the health endpoint works, test the login:

```bash
curl -X POST https://nvccz-pi.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@nvccz.co.zw",
    "password": "admin123"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Logged in successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "clx...",
    "email": "admin@nvccz.co.zw",
    "firstName": "Admin",
    "lastName": "User",
    "role": "admin",
    "permissions": [...]
  }
}
```

### Step 3: Test Homepage with Authentication
If login works, copy the token and test the homepage:

```bash
curl -X GET https://nvccz-pi.vercel.app/api/homepage \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "posts": [],
    "newsletters": [],
    "events": {
      "upcoming": [],
      "all": []
    },
    "onlineUsers": [],
    "summary": {
      "totalPosts": 0,
      "totalNewsletters": 0,
      "upcomingEvents": 0,
      "totalEvents": 0,
      "onlineUsers": 0
    }
  }
}
```

## 🚨 Common Issues & Solutions

### Issue 1: Health endpoint returns 404
**Problem:** The API is not deployed correctly
**Solution:** Check Vercel deployment logs and ensure the build completed successfully

### Issue 2: Login returns 404
**Problem:** The `/api` prefix is not working
**Solution:** Try without the `/api` prefix: `https://nvccz-pi.vercel.app/auth/login`

### Issue 3: Login works but homepage returns 404
**Problem:** Route mounting issue
**Solution:** Check if the homepage routes are properly imported in `app.ts`

### Issue 4: Homepage returns 401 Unauthorized
**Problem:** Missing or invalid authentication token
**Solution:** Make sure you're including the `Authorization: Bearer <token>` header

### Issue 5: Homepage returns 500 Internal Server Error
**Problem:** Database connection or Prisma issue
**Solution:** Check Vercel function logs for database connection errors

## 🔧 Using Postman

1. **Test Health:**
   - Method: GET
   - URL: `https://nvccz-pi.vercel.app/health`

2. **Test Login:**
   - Method: POST
   - URL: `https://nvccz-pi.vercel.app/api/auth/login`
   - Headers: `Content-Type: application/json`
   - Body: Raw JSON
   ```json
   {
     "email": "admin@nvccz.co.zw",
     "password": "admin123"
   }
   ```

3. **Test Homepage:**
   - Method: GET
   - URL: `https://nvccz-pi.vercel.app/api/homepage`
   - Headers: `Authorization: Bearer <token_from_login>`

## 📊 Expected Results

If everything is working correctly:

1. ✅ Health endpoint returns 200 OK
2. ✅ Login returns 200 with JWT token
3. ✅ Homepage returns 200 with empty data arrays
4. ✅ Swagger docs available at `https://nvccz-pi.vercel.app/api-docs`

## 🚨 If All Tests Fail

If all endpoints return 404, the issue is likely:

1. **Build failed** - Check Vercel deployment logs
2. **Environment variables missing** - Ensure `DATABASE_URL` and `JWT_SECRET` are set
3. **Database connection failed** - Check if your MySQL database is accessible
4. **Route configuration** - Verify all routes are properly mounted

## 🔍 Vercel Debugging

1. Go to your Vercel dashboard
2. Check the deployment logs
3. Look for any build errors or runtime errors
4. Verify environment variables are set correctly
5. Check function logs for runtime errors

## 📞 Next Steps

Run these tests and let me know:
1. What the health endpoint returns
2. What the login endpoint returns
3. What the homepage endpoint returns
4. Any error messages from Vercel logs

This will help us identify exactly where the issue is occurring. 