# Forgot Password API Documentation

This document provides step-by-step instructions on how to use the forgot password endpoints.

## Overview

The forgot password feature consists of two public endpoints:
1. **Request Password Reset** - User requests a password reset link via email
2. **Reset Password** - User resets their password using the token from the email

Both endpoints are **public** (no authentication required).

---

## Step 1: Request Password Reset

### Endpoint
```
POST /api/auth/forgot-password
```

### Description
Sends a password reset link to the user's email address. For security reasons, the API always returns a success message even if the email doesn't exist in the system.

### Request Headers
```
Content-Type: application/json
```

### Request Body
```json
{
  "email": "user@example.com"
}
```

### Request Body Schema
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | The email address of the user requesting password reset |

### Example Request (cURL)
```bash
curl -X POST http://localhost:3000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com"
  }'
```

### Example Request (JavaScript/Fetch)
```javascript
const response = await fetch('http://localhost:3000/api/auth/forgot-password', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: 'user@example.com'
  })
});

const data = await response.json();
console.log(data);
```

### Example Request (Axios)
```javascript
const axios = require('axios');

const response = await axios.post('http://localhost:3000/api/auth/forgot-password', {
  email: 'user@example.com'
});

console.log(response.data);
```

### Success Response (200 OK)
```json
{
  "success": true,
  "message": "If an account with that email exists, a password reset link has been sent"
}
```

### Error Response (400 Bad Request)
```json
{
  "success": false,
  "message": "Email is required"
}
```

### What Happens Next?
1. If the email exists in the system:
   - A secure token is generated
   - The token is hashed and stored in the database
   - An email is sent to the user with a reset link
   - The reset link contains the raw token as a query parameter
   - The token expires in **1 hour**

2. If the email doesn't exist:
   - The API still returns success (for security)
   - No email is sent
   - No token is created

### Email Content
The user will receive an email from **NVCCZ IT Team** (`noreply@kyntaro.com`) with:
- Subject: "Reset your NVCCZ account password"
- A reset link in the format: `{FRONTEND_URL}/reset-password?token={token}`
- The link expires in 1 hour

**Note:** The `FRONTEND_URL` is set via the `FRONTEND_URL` environment variable (defaults to `http://app.kyntaro.com`).

---

## Step 2: Reset Password

### Endpoint
```
POST /api/auth/reset-password
```

### Description
Resets the user's password using the token received in the password reset email.

### Request Headers
```
Content-Type: application/json
```

### Request Body
```json
{
  "token": "abc123def456...",
  "newPassword": "newSecurePassword123"
}
```

### Request Body Schema
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `token` | string | Yes | The reset token from the email link (query parameter value) |
| `newPassword` | string | Yes | The new password (must be at least 6 characters) |

### Example Request (cURL)
```bash
curl -X POST http://localhost:3000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "token": "abc123def456789012345678901234567890123456789012345678901234567890",
    "newPassword": "newSecurePassword123"
  }'
```

### Example Request (JavaScript/Fetch)
```javascript
// Extract token from URL query parameter
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');

const response = await fetch('http://localhost:3000/api/auth/reset-password', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    token: token,
    newPassword: 'newSecurePassword123'
  })
});

const data = await response.json();
console.log(data);
```

### Example Request (Axios)
```javascript
const axios = require('axios');

// Extract token from URL query parameter
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');

const response = await axios.post('http://localhost:3000/api/auth/reset-password', {
  token: token,
  newPassword: 'newSecurePassword123'
});

console.log(response.data);
```

### Success Response (200 OK)
```json
{
  "success": true,
  "message": "Password has been reset successfully"
}
```

### Error Responses

#### 400 Bad Request - Missing Fields
```json
{
  "success": false,
  "message": "Token and new password are required"
}
```

#### 400 Bad Request - Weak Password
```json
{
  "success": false,
  "message": "New password must be at least 6 characters long"
}
```

#### 400 Bad Request - Invalid/Expired Token
```json
{
  "success": false,
  "message": "Invalid or expired reset token"
}
```

#### 404 Not Found - User Not Found
```json
{
  "success": false,
  "message": "User not found"
}
```

### What Happens Next?
1. The token is validated (checked for existence, expiration, and usage status)
2. The user's password is hashed and updated
3. The reset token is marked as used (cannot be reused)
4. The user can now log in with their new password

---

## Complete Flow Example

### Frontend Implementation Example

```javascript
// Step 1: User enters email on forgot password page
async function requestPasswordReset(email) {
  try {
    const response = await fetch('http://localhost:3000/api/auth/forgot-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email })
    });
    
    const data = await response.json();
    
    if (data.success) {
      alert('If an account with that email exists, a password reset link has been sent');
    }
  } catch (error) {
    console.error('Error:', error);
    alert('An error occurred. Please try again.');
  }
}

// Step 2: User clicks link in email and lands on reset password page
// URL: http://app.kyntaro.com/reset-password?token=abc123def456...

async function resetPassword(newPassword) {
  // Extract token from URL
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  
  if (!token) {
    alert('Invalid reset link. Please request a new password reset.');
    return;
  }
  
  try {
    const response = await fetch('http://localhost:3000/api/auth/reset-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token: token,
        newPassword: newPassword
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      alert('Password has been reset successfully! You can now log in.');
      // Redirect to login page
      window.location.href = '/login';
    } else {
      alert(data.message || 'Failed to reset password. Please try again.');
    }
  } catch (error) {
    console.error('Error:', error);
    alert('An error occurred. Please try again.');
  }
}
```

---

## Important Notes

### Security Features
1. **Token Expiration**: Reset tokens expire after 1 hour
2. **Single Use**: Tokens can only be used once
3. **Token Hashing**: Tokens are hashed before storage (SHA-256)
4. **Email Privacy**: The API doesn't reveal if an email exists in the system
5. **Automatic Invalidation**: Previous unused tokens are invalidated when a new reset is requested

### Password Requirements
- Minimum length: **6 characters**
- No maximum length specified
- Recommended: Use a strong password with mix of letters, numbers, and special characters

### Token Format
- Tokens are 64-character hexadecimal strings (32 bytes)
- Example: `a1b2c3d4e5f6...` (64 characters total)
- Tokens are sent in the email URL as a query parameter

### Base URL
- Replace `http://localhost:3000` with your actual API base URL
- The API routes are prefixed with `/api`
- Example: `https://api.yourdomain.com/api/auth/forgot-password`

### Frontend URL
- The reset link in the email uses the `FRONTEND_URL` environment variable
- Default: `http://app.kyntaro.com`
- Format: `{FRONTEND_URL}/reset-password?token={token}`

---

## Testing the Endpoints

### Using Postman

1. **Request Password Reset**
   - Method: `POST`
   - URL: `http://localhost:3000/api/auth/forgot-password`
   - Headers: `Content-Type: application/json`
   - Body (raw JSON):
     ```json
     {
       "email": "test@example.com"
     }
     ```

2. **Reset Password**
   - Method: `POST`
   - URL: `http://localhost:3000/api/auth/reset-password`
   - Headers: `Content-Type: application/json`
   - Body (raw JSON):
     ```json
     {
       "token": "your-token-from-email",
       "newPassword": "newPassword123"
     }
     ```

### Using cURL

```bash
# Step 1: Request reset
curl -X POST http://localhost:3000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com"}'

# Step 2: Reset password (use token from email)
curl -X POST http://localhost:3000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "token": "token-from-email",
    "newPassword": "newPassword123"
  }'
```

---

## Troubleshooting

### Issue: "Invalid or expired reset token"
- **Cause**: Token has expired (1 hour limit) or has already been used
- **Solution**: Request a new password reset

### Issue: "New password must be at least 6 characters long"
- **Cause**: Password is too short
- **Solution**: Use a password with at least 6 characters

### Issue: Email not received
- **Cause**: Email might be in spam folder, or email doesn't exist in system
- **Solution**: Check spam folder, verify email address, or check email service configuration

### Issue: Token not found in URL
- **Cause**: User might have copied the link incorrectly
- **Solution**: Ensure the full URL with token query parameter is used

---

## Database Schema

The password reset feature uses the `password_reset_tokens` table:

| Column | Type | Description |
|--------|------|-------------|
| `id` | String (CUID) | Primary key |
| `userId` | String | Foreign key to User table |
| `tokenHash` | String (unique) | SHA-256 hash of the reset token |
| `expiresAt` | DateTime | Token expiration time (1 hour from creation) |
| `usedAt` | DateTime (nullable) | When the token was used (null if unused) |
| `createdAt` | DateTime | Token creation timestamp |

---

## Environment Variables

Make sure these environment variables are set:

```env
# Frontend URL for password reset links
FRONTEND_URL=http://app.kyntaro.com

# JWT Secret (for authentication)
JWT_SECRET=your_jwt_secret_here
```

---

## Support

For issues or questions, contact the NVCCZ IT Team.

