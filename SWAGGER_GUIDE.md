# Swagger API Documentation Guide

## 🚀 Quick Start

Once your server is running, you can access the interactive API documentation at:

**Production:**
```
https://nvccz-moiaeowxc-nyashakarata1-gmailcoms-projects.vercel.app/api-docs
```

**Development:**
```
http://localhost:3000/api-docs
```

## 📋 What You'll Find

The Swagger documentation provides:

- **Interactive API Testing** - Test endpoints directly from the browser
- **Request/Response Examples** - See exactly what data to send and receive
- **Authentication Setup** - Easy JWT token management
- **Schema Definitions** - Complete data models and validation rules
- **Error Responses** - All possible error scenarios with examples

## 🔐 Authentication Setup

### Step 1: Get Your JWT Token

1. Go to the **Authentication** section
2. Click on **POST /auth/login**
3. Click **Try it out**
4. Enter the admin credentials:
   ```json
   {
     "email": "admin@nvccz.co.zw",
     "password": "admin123"
   }
   ```
5. Click **Execute**
6. Copy the `token` value from the response

### Step 2: Authorize Swagger

1. Click the **Authorize** button (🔒) at the top of the page
2. In the **Value** field, enter: `Bearer YOUR_TOKEN_HERE`
   - Replace `YOUR_TOKEN_HERE` with the token you copied
   - Example: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
3. Click **Authorize**
4. Click **Close**

Now you can test all protected endpoints!

## 🎯 Testing Workflows

### Workflow 1: Create a Role and User

1. **Create a Role**
   - Go to **Roles** section
   - Click **POST /roles**
   - Click **Try it out**
   - Use this example:
   ```json
   {
     "name": "moderator",
     "description": "Moderator with limited access",
     "permissions": [
       { "name": "view_dashboard", "value": true },
       { "name": "view_users", "value": true },
       { "name": "manage_users", "value": false },
       { "name": "manage_roles", "value": false }
     ]
   }
   ```
   - Click **Execute**
   - Copy the `id` from the response

2. **Create a User**
   - Go to **Users** section
   - Click **POST /users**
   - Click **Try it out**
   - Use the role ID from step 1:
   ```json
   {
     "firstName": "John",
     "lastName": "Doe",
     "email": "john@example.com",
     "password": "password123",
     "roleId": "PASTE_ROLE_ID_HERE"
   }
   ```
   - Click **Execute**

### Workflow 2: Test User Management

1. **Get All Users**
   - Go to **Users** section
   - Click **GET /users**
   - Click **Try it out**
   - Click **Execute**

2. **Get User by ID**
   - Use the user ID from the previous response
   - Click **GET /users/{id}**
   - Click **Try it out**
   - Enter the user ID
   - Click **Execute**

3. **Update User**
   - Click **PUT /users/{id}**
   - Click **Try it out**
   - Enter the user ID
   - Update the request body:
   ```json
   {
     "firstName": "John Updated",
     "lastName": "Doe Updated",
     "email": "john.updated@example.com"
   }
   ```
   - Click **Execute**

### Workflow 3: Test Role Management

1. **Get All Roles**
   - Go to **Roles** section
   - Click **GET /roles**
   - Click **Try it out**
   - Click **Execute**

2. **Get Role Permissions**
   - Use a role ID from the previous response
   - Click **GET /roles/{id}/permissions**
   - Click **Try it out**
   - Enter the role ID
   - Click **Execute**

3. **Update Role**
   - Click **PUT /roles/{id}**
   - Click **Try it out**
   - Enter the role ID
   - Update permissions:
   ```json
   {
     "name": "senior_moderator",
     "description": "Senior moderator with more permissions",
     "permissions": [
       { "name": "view_dashboard", "value": true },
       { "name": "view_users", "value": true },
       { "name": "manage_users", "value": true },
       { "name": "manage_roles", "value": false }
     ]
   }
   ```
   - Click **Execute**

## 🔑 Available Permissions

When creating or updating roles, you can use these permissions:

### Dashboard & Reports
- `view_dashboard` - View dashboard
- `view_reports` - View reports

### Structure Management
- `view_structure` - View organizational structure
- `manage_structure` - Manage organizational structure

### Accounting & Financial Management
- `view_accounting` - View accounting information
- `manage_accounting` - Manage accounting records
- `view_financial_reports` - View financial reports
- `manage_financial_reports` - Manage financial reports
- `view_ledger` - View general ledger
- `manage_ledger` - Manage general ledger

### User & Role Management
- `view_users` - View user list
- `manage_users` - Create, update, delete users
- `view_roles` - View role list
- `manage_roles` - Create, update, delete roles

### Work Logs
- `create_worklog` - Create work logs
- `edit_worklog` - Edit work logs
- `delete_worklog` - Delete work logs
- `view_worklog` - View work logs

### ERP & Business Operations
- `view_business_operations` - View business operations
- `manage_business_operations` - Manage business operations
- `view_company_data` - View company data
- `manage_company_data` - Manage company data
- `view_erp_reports` - View ERP reports
- `manage_erp_reports` - Manage ERP reports

### Subscription & Settings
- `view_subscription` - View subscription
- `manage_subscription` - Manage subscription
- `manage_firm_settings` - Manage firm settings

## 📝 Permission Format

Each permission is an object with:
```json
{
  "name": "permission_name",
  "value": true  // or false
}
```

## 🎨 Swagger Features

### Interactive Testing
- **Try it out** - Test endpoints with real data
- **Request/Response** - See exactly what's sent and received
- **Schema Validation** - Automatic validation of request data
- **Error Handling** - See all possible error responses

### Authentication
- **Bearer Token** - JWT authentication support
- **Persistent Auth** - Token persists across requests
- **Easy Setup** - One-click authorization

### Documentation
- **Organized by Tags** - Authentication, Users, Roles
- **Complete Schemas** - All data models defined
- **Examples** - Real-world usage examples
- **Error Codes** - All HTTP status codes explained

## 🚨 Common Issues & Solutions

### Issue: "Unauthorized" (401)
**Solution:** Make sure you've authorized with a valid JWT token

### Issue: "Forbidden" (403)
**Solution:** The admin user has all permissions. Check if you're using the admin token.

### Issue: "Not Found" (404)
**Solution:** Check that the ID you're using exists in the database

### Issue: "Conflict" (409)
**Solution:** Email or role name already exists. Use a unique value.

### Issue: "Bad Request" (400)
**Solution:** Check that all required fields are provided and valid

## 🔧 Tips for Testing

1. **Start with Login** - Always get a fresh token first
2. **Use Real Data** - Copy IDs from responses to use in subsequent requests
3. **Check Responses** - Look at the response body for success/error messages
4. **Test Error Cases** - Try invalid data to see error handling
5. **Use the Filter** - Search for specific endpoints using the filter box

## 📊 Example Test Scenarios

### Scenario 1: Full User Lifecycle
1. Create a role
2. Create a user with that role
3. Get all users
4. Get the specific user
5. Update the user
6. Change the user's password
7. Delete the user

### Scenario 2: Role Management
1. Create multiple roles with different permissions
2. Get all roles
3. Get role details with assigned users
4. Update role permissions
5. Get role permissions
6. Try to delete a role (should fail if users are assigned)

### Scenario 3: Permission Testing
1. Create a role with limited permissions
2. Create a user with that role
3. Test various endpoints to see permission restrictions

## 🎯 Next Steps

After testing with Swagger:

1. **Integrate with Frontend** - Use the API endpoints in your application
2. **Add More Permissions** - Extend the permission system as needed
3. **Implement Middleware** - Use the permission-based middleware for fine-grained control
4. **Add Validation** - Enhance request validation for production use

The Swagger documentation makes it easy to understand and test your role-based access control API! 