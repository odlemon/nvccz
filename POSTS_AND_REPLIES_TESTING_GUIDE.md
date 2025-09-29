# Posts and Replies API Testing Guide

## Overview
This guide provides step-by-step instructions for testing the Posts and Replies module, which includes creating posts, adding replies, nested replies, and managing the entire conversation flow.

## Available Endpoints

### Posts Endpoints
- `POST /api/posts` - Create a new post
- `GET /api/posts` - Get all active posts
- `GET /api/posts/{id}` - Get specific post with replies
- `PUT /api/posts/{id}` - Update a post
- `DELETE /api/posts/{id}` - Delete a post

### Replies Endpoints
- `POST /api/posts/{postId}/replies` - Add reply to a post
- `POST /api/posts/replies/{replyId}/replies` - Add nested reply to a reply
- `PUT /api/posts/replies/{replyId}` - Update a reply
- `DELETE /api/posts/replies/{replyId}` - Delete a reply

## Testing Workflow

### Step 1: Authentication
First, you need to authenticate to get a Bearer token.

**Request:**
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "admin@nvccz.co.zw",
  "password": "admin123"
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": "user_id",
      "firstName": "Admin",
      "lastName": "User",
      "email": "admin@nvccz.co.zw"
    }
  }
}
```

**Save the token for all subsequent requests!**

### Step 2: Create a Test Post
Create a new post to test the replies functionality.

**Request:**
```bash
POST /api/posts
Authorization: Bearer <your_token>
Content-Type: application/json

{
  "title": "Test Post for Replies",
  "content": "This is a test post to test the replies functionality. Please feel free to reply!",
  "isActive": true
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Post created successfully",
  "data": {
    "id": "post_id_123",
    "title": "Test Post for Replies",
    "content": "This is a test post to test the replies functionality. Please feel free to reply!",
    "isActive": true,
    "createdAt": "2025-01-15T10:30:00Z",
    "updatedAt": "2025-01-15T10:30:00Z",
    "author": {
      "id": "user_id",
      "firstName": "Admin",
      "lastName": "User",
      "email": "admin@nvccz.co.zw"
    }
  }
}
```

**Save the post ID for subsequent requests!**

### Step 3: Get All Posts
Verify that your post appears in the list of active posts.

**Request:**
```bash
GET /api/posts
Authorization: Bearer <your_token>
```

**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "post_id_123",
      "title": "Test Post for Replies",
      "content": "This is a test post to test the replies functionality. Please feel free to reply!",
      "isActive": true,
      "createdAt": "2025-01-15T10:30:00Z",
      "author": {
        "firstName": "Admin",
        "lastName": "User"
      },
      "replies": []
    }
  ]
}
```

### Step 4: Add a Reply to the Post
Add a direct reply to the post.

**Request:**
```bash
POST /api/posts/{postId}/replies
Authorization: Bearer <your_token>
Content-Type: application/json

{
  "content": "This is a reply to the test post. Great content!"
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Reply added successfully",
  "data": {
    "id": "reply_id_456",
    "content": "This is a reply to the test post. Great content!",
    "postId": "post_id_123",
    "parentReplyId": null,
    "createdAt": "2025-01-15T10:35:00Z",
    "author": {
      "id": "user_id",
      "firstName": "Admin",
      "lastName": "User"
    }
  }
}
```

**Save the reply ID for nested reply testing!**

### Step 5: Add a Nested Reply
Add a reply to the existing reply (nested reply functionality).

**Request:**
```bash
POST /api/posts/replies/{replyId}/replies
Authorization: Bearer <your_token>
Content-Type: application/json

{
  "content": "This is a nested reply to the first reply. I agree with your comment!"
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Reply added successfully",
  "data": {
    "id": "nested_reply_id_789",
    "content": "This is a nested reply to the first reply. I agree with your comment!",
    "postId": "post_id_123",
    "parentReplyId": "reply_id_456",
    "createdAt": "2025-01-15T10:40:00Z",
    "author": {
      "id": "user_id",
      "firstName": "Admin",
      "lastName": "User"
    }
  }
}
```

### Step 6: Get Post with All Replies
Retrieve the post with all its replies and nested replies.

**Request:**
```bash
GET /api/posts/{postId}
Authorization: Bearer <your_token>
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "id": "post_id_123",
    "title": "Test Post for Replies",
    "content": "This is a test post to test the replies functionality. Please feel free to reply!",
    "isActive": true,
    "createdAt": "2025-01-15T10:30:00Z",
    "author": {
      "firstName": "Admin",
      "lastName": "User"
    },
    "replies": [
      {
        "id": "reply_id_456",
        "content": "This is a reply to the test post. Great content!",
        "createdAt": "2025-01-15T10:35:00Z",
        "author": {
          "firstName": "Admin",
          "lastName": "User"
        },
        "replies": [
          {
            "id": "nested_reply_id_789",
            "content": "This is a nested reply to the first reply. I agree with your comment!",
            "createdAt": "2025-01-15T10:40:00Z",
            "author": {
              "firstName": "Admin",
              "lastName": "User"
            },
            "replies": []
          }
        ]
      }
    ]
  }
}
```

### Step 7: Update a Reply
Update the content of an existing reply.

**Request:**
```bash
PUT /api/posts/replies/{replyId}
Authorization: Bearer <your_token>
Content-Type: application/json

{
  "content": "Updated reply content - I have more thoughts on this topic!"
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Reply updated successfully",
  "data": {
    "id": "reply_id_456",
    "content": "Updated reply content - I have more thoughts on this topic!",
    "postId": "post_id_123",
    "parentReplyId": null,
    "updatedAt": "2025-01-15T10:45:00Z",
    "author": {
      "firstName": "Admin",
      "lastName": "User"
    }
  }
}
```

### Step 8: Update the Original Post
Update the content of the original post.

**Request:**
```bash
PUT /api/posts/{postId}
Authorization: Bearer <your_token>
Content-Type: application/json

{
  "title": "Updated Test Post",
  "content": "Updated post content - this post has been modified to test the update functionality."
}
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Post updated successfully",
  "data": {
    "id": "post_id_123",
    "title": "Updated Test Post",
    "content": "Updated post content - this post has been modified to test the update functionality.",
    "isActive": true,
    "updatedAt": "2025-01-15T10:50:00Z",
    "author": {
      "firstName": "Admin",
      "lastName": "User"
    }
  }
}
```

### Step 9: Delete a Reply
Delete a specific reply (this will also delete any nested replies).

**Request:**
```bash
DELETE /api/posts/replies/{replyId}
Authorization: Bearer <your_token>
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Reply deleted successfully"
}
```

### Step 10: Delete the Post
Delete the entire post (this will cascade delete all remaining replies).

**Request:**
```bash
DELETE /api/posts/{postId}
Authorization: Bearer <your_token>
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Post deleted successfully"
}
```

## Key Features to Test

### 1. Nested Replies System
- Test the Facebook-like nested reply functionality
- Verify that replies can have sub-replies
- Check that the hierarchy is maintained correctly

### 2. Authorization
- Only authors can edit/delete their own posts and replies
- Test with different user accounts to verify access control

### 3. Cascade Delete
- Deleting a post should delete all its replies
- Deleting a reply should delete all its nested replies

### 4. Active Posts Filter
- Only active posts should appear in the posts list
- Inactive posts should not be visible to users

### 5. Real-time Updates
- Verify that replies appear immediately after creation
- Check that updates are reflected in real-time

## Error Scenarios to Test

### 1. Unauthorized Access
```bash
# Try to access without token
GET /api/posts
# Expected: 401 Unauthorized
```

### 2. Invalid Post ID
```bash
# Try to get non-existent post
GET /api/posts/invalid_id
# Expected: 404 Not Found
```

### 3. Editing Others' Content
```bash
# Try to edit someone else's post/reply
PUT /api/posts/{other_user_post_id}
# Expected: 403 Forbidden
```

### 4. Invalid Reply to Non-existent Post
```bash
# Try to reply to non-existent post
POST /api/posts/invalid_post_id/replies
# Expected: 404 Not Found
```

## Testing Checklist

- [ ] Authentication works correctly
- [ ] Post creation works
- [ ] Post listing works
- [ ] Direct replies work
- [ ] Nested replies work
- [ ] Post updates work
- [ ] Reply updates work
- [ ] Post deletion works (cascade delete)
- [ ] Reply deletion works
- [ ] Authorization is enforced
- [ ] Error handling works correctly
- [ ] Real-time updates work

## Notes

- All endpoints require Bearer token authentication
- The system supports unlimited nesting of replies
- Posts and replies are soft-deleted (cascade delete)
- Only active posts are visible in the posts list
- All timestamps are in ISO 8601 format
- The API returns consistent response formats across all endpoints


