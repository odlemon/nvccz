# API Documentation - Role-Based Access Control

## Overview

This API provides role-based access control with dynamic roles and permissions. Users are assigned roles, and roles have specific permissions that determine what actions users can perform.

## Authentication

All protected endpoints require a JWT token in the Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

## Base URL

**Production:**
```
https://nvccz-moiaeowxc-nyashakarata1-gmailcoms-projects.vercel.app/api
```

**Development:**
```
http://localhost:3000/api
```

---

## 🔐 Authentication Endpoints

### Login
**POST** `/auth/login`

**Body:**
```json
{
  "email": "admin@nvccz.co.zw",
  "password": "admin123"
}
```

**Response:**
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

### Get Current User
**GET** `/auth/me`

**Headers:** `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "userId": "clx...",
    "email": "admin@nvccz.co.zw",
    "firstName": "Admin",
    "lastName": "User",
    "role": "admin",
    "permissions": [...]
  }
}
```

---

## 👥 User Management Endpoints

*All user endpoints require admin role*

### Create User
**POST** `/users`

**Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "password": "password123",
  "roleId": "role_id_here"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User created successfully",
  "data": {
    "id": "clx...",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "role": {
      "id": "clx...",
      "name": "user",
      "description": "Regular user"
    }
  }
}
```

### Get All Users
**GET** `/users`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "clx...",
      "firstName": "Admin",
      "lastName": "User",
      "email": "admin@nvccz.co.zw",
      "role": {
        "id": "clx...",
        "name": "admin",
        "description": "Administrator"
      }
    }
  ]
}
```

### Get User by ID
**GET** `/users/:id`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "clx...",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@example.com",
    "role": {
      "id": "clx...",
      "name": "user",
      "description": "Regular user",
      "permissions": [...]
    }
  }
}
```

### Update User
**PUT** `/users/:id`

**Body:**
```json
{
  "firstName": "John Updated",
  "lastName": "Doe Updated",
  "email": "john.updated@example.com",
  "roleId": "new_role_id"
}
```

### Delete User
**DELETE** `/users/:id`

**Note:** Cannot delete the last admin user

### Change Password
**PUT** `/users/:id/password`

**Body:**
```json
{
  "currentPassword": "oldpassword",
  "newPassword": "newpassword123"
}
```

---

## 🎭 Role Management Endpoints

*All role endpoints require admin role*

### Create Role
**POST** `/roles`

**Body:**
```json
{
  "name": "moderator",
  "description": "Moderator with limited admin access",
  "permissions": [
    { "name": "view_dashboard", "value": true },
    { "name": "view_users", "value": true },
    { "name": "manage_users", "value": false },
    { "name": "manage_roles", "value": false }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Role created successfully",
  "data": {
    "id": "clx...",
    "name": "moderator",
    "description": "Moderator with limited admin access",
    "permissions": [...],
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### Get All Roles
**GET** `/roles`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "clx...",
      "name": "admin",
      "description": "Full access administrator",
      "permissions": [...],
      "_count": {
        "users": 1
      }
    }
  ]
}
```

### Get Role by ID
**GET** `/roles/:id`

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "clx...",
    "name": "moderator",
    "description": "Moderator role",
    "permissions": [...],
    "users": [
      {
        "id": "clx...",
        "firstName": "John",
        "lastName": "Doe",
        "email": "john@example.com"
      }
    ],
    "_count": {
      "users": 1
    }
  }
}
```

### Update Role
**PUT** `/roles/:id`

**Body:**
```json
{
  "name": "senior_moderator",
  "description": "Senior moderator with more permissions",
  "permissions": [
    { "name": "view_dashboard", "value": true },
    { "name": "manage_users", "value": true },
    { "name": "manage_roles", "value": false }
  ]
}
```

### Delete Role
**DELETE** `/roles/:id`

**Note:** Cannot delete roles that have users assigned

### Get Role Permissions
**GET** `/roles/:id/permissions`

**Response:**
```json
{
  "success": true,
  "data": {
    "roleId": "clx...",
    "roleName": "moderator",
    "permissions": [
      { "name": "view_dashboard", "value": true },
      { "name": "manage_users", "value": false }
    ]
  }
}
```

---

## 🔑 Permission System

### Available Permissions

- `view_dashboard` - View dashboard
- `view_reports` - View reports
- `view_structure` - View organizational structure
- `manage_structure` - Manage organizational structure
- `view_accounting` - View accounting information
- `manage_accounting` - Manage accounting records
- `view_financial_reports` - View financial reports
- `manage_financial_reports` - Manage financial reports
- `view_ledger` - View general ledger
- `manage_ledger` - Manage general ledger
- `view_users` - View user list
- `manage_users` - Create, update, delete users
- `view_roles` - View role list
- `manage_roles` - Create, update, delete roles
- `create_worklog` - Create work logs
- `edit_worklog` - Edit work logs
- `delete_worklog` - Delete work logs
- `view_worklog` - View work logs
- `view_business_operations` - View business operations
- `manage_business_operations` - Manage business operations
- `view_company_data` - View company data
- `manage_company_data` - Manage company data
- `view_erp_reports` - View ERP reports
- `manage_erp_reports` - Manage ERP reports
- `view_subscription` - View subscription
- `manage_subscription` - Manage subscription
- `manage_firm_settings` - Manage firm settings

### Permission Format

Each permission is an object with:
```json
{
  "name": "permission_name",
  "value": true  // or false
}
```

---

## 🚨 Error Responses

### 400 Bad Request
```json
{
  "success": false,
  "message": "Validation error message"
}
```

### 401 Unauthorized
```json
{
  "success": false,
  "message": "Authorization token missing or malformed"
}
```

### 403 Forbidden
```json
{
  "success": false,
  "message": "Forbidden: insufficient permissions"
}
```

### 404 Not Found
```json
{
  "success": false,
  "message": "Resource not found"
}
```

### 409 Conflict
```json
{
  "success": false,
  "message": "Resource already exists"
}
```

### 500 Internal Server Error
```json
{
  "success": false,
  "message": "Internal server error"
}
```

---

## 📝 Testing Examples

### Using curl

**Login:**
```bash
# Production
curl -X POST https://nvccz-moiaeowxc-nyashakarata1-gmailcoms-projects.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@nvccz.co.zw",
    "password": "admin123"
  }'

# Development
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@nvccz.co.zw",
    "password": "admin123"
  }'
```

**Create Role:**
```bash
# Production
curl -X POST https://nvccz-moiaeowxc-nyashakarata1-gmailcoms-projects.vercel.app/api/roles \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "user",
    "description": "Regular user",
    "permissions": [
      {"name": "view_dashboard", "value": true},
      {"name": "view_users", "value": false}
    ]
  }'

# Development
curl -X POST http://localhost:3000/api/roles \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "user",
    "description": "Regular user",
    "permissions": [
      {"name": "view_dashboard", "value": true},
      {"name": "view_users", "value": false}
    ]
  }'
```

**Get All Users:**
```bash
# Production
curl -X GET https://nvccz-moiaeowxc-nyashakarata1-gmailcoms-projects.vercel.app/api/users \
  -H "Authorization: Bearer YOUR_TOKEN"

# Development
curl -X GET http://localhost:3000/api/users \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Using Postman

1. **Login Request:**
   - Method: POST
   - URL: `https://nvccz-moiaeowxc-nyashakarata1-gmailcoms-projects.vercel.app/api/auth/login` (Production)
   - URL: `http://localhost:3000/api/auth/login` (Development)
   - Headers: `Content-Type: application/json`
   - Body: Raw JSON with login credentials

2. **Protected Request:**
   - Method: GET
   - URL: `https://nvccz-moiaeowxc-nyashakarata1-gmailcoms-projects.vercel.app/api/users` (Production)
   - URL: `http://localhost:3000/api/users` (Development)
   - Headers: `Authorization: Bearer <token_from_login>`

---

## 🔧 Setup Instructions

1. **Install dependencies:** `npm install`
2. **Generate Prisma client:** `npm run prisma:generate`
3. **Set up database:** `npm run prisma:db:push`
4. **Seed database:** `npm run prisma:seed`
5. **Start server:** `npm run dev`

## 👤 Default Admin User

- **Email:** `admin@nvccz.co.zw`
- **Password:** `admin123`
- **Role:** `admin` (with all permissions) 