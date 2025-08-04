# Testing the Login API

## Setup

1. Make sure your database is set up and seeded:
   ```bash
   npm run prisma:db:push
   npm run prisma:seed
   ```

2. Start the server:
   ```bash
   npm run dev
   ```

## Test Login

### Using curl:
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@nvccz.co.zw",
    "password": "admin123"
  }'
```

### Using Postman:
- **Method**: POST
- **URL**: `http://localhost:3000/api/auth/login`
- **Headers**: `Content-Type: application/json`
- **Body** (raw JSON):
  ```json
  {
    "email": "admin@nvccz.co.zw",
    "password": "admin123"
  }
  ```

## Expected Response

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
    "permissions": [
      { "name": "view_dashboard", "value": true },
      { "name": "manage_users", "value": true }
    ]
  }
}
```

## Test Protected Route

Use the token from the login response to test the `/api/auth/me` endpoint:

```bash
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE"
```

## Admin Credentials

- **Email**: `admin@nvccz.co.zw`
- **Password**: `admin123`
- **Role**: `admin` 