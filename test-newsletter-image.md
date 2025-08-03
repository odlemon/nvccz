# Newsletter Image Upload Test Guide

## Prerequisites
1. Make sure you're logged in and have a valid JWT token
2. Have an image file ready (JPG, PNG, GIF, etc.)

## Testing Image Upload

### 1. Create Newsletter with Image

**Endpoint:** `POST /newsletters`

**Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: multipart/form-data
```

**Body (form-data):**
- `title`: "Test Newsletter with Image"
- `content`: "This newsletter includes an image upload test"
- `image`: [Select your image file]

**cURL Example:**
```bash
curl -X POST "http://localhost:3000/newsletters" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "title=Test Newsletter with Image" \
  -F "content=This newsletter includes an image upload test" \
  -F "image=@/path/to/your/image.jpg"
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Newsletter created successfully",
  "data": {
    "id": "clx1234567890abcdef",
    "title": "Test Newsletter with Image",
    "content": "This newsletter includes an image upload test",
    "imageUrl": "https://lysp.s3.amazonaws.com/newsletters/1234567890-image.jpg",
    "authorId": "clx1234567890abcdef",
    "author": {
      "id": "clx1234567890abcdef",
      "firstName": "John",
      "lastName": "Doe",
      "email": "admin@nvccz.co.zw"
    },
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### 2. Update Newsletter with New Image

**Endpoint:** `PUT /newsletters/{id}`

**Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: multipart/form-data
```

**Body (form-data):**
- `title`: "Updated Newsletter with New Image"
- `content`: "This newsletter has been updated with a new image"
- `image`: [Select your new image file]

**cURL Example:**
```bash
curl -X PUT "http://localhost:3000/newsletters/clx1234567890abcdef" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "title=Updated Newsletter with New Image" \
  -F "content=This newsletter has been updated with a new image" \
  -F "image=@/path/to/your/new-image.jpg"
```

### 3. Get All Newsletters (Verify Image URLs)

**Endpoint:** `GET /newsletters`

**Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
```

**Expected Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "clx1234567890abcdef",
      "title": "Test Newsletter with Image",
      "content": "This newsletter includes an image upload test",
      "imageUrl": "https://lysp.s3.amazonaws.com/newsletters/1234567890-image.jpg",
      "authorId": "clx1234567890abcdef",
      "author": {
        "id": "clx1234567890abcdef",
        "firstName": "John",
        "lastName": "Doe",
        "email": "admin@nvccz.co.zw"
      },
      "isActive": true,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

## Error Testing

### 1. Invalid File Type
Try uploading a non-image file (e.g., .txt, .pdf)

**Expected Error:**
```json
{
  "success": false,
  "message": "Only image files are allowed"
}
```

### 2. File Too Large
Try uploading an image larger than 5MB

**Expected Error:**
```json
{
  "success": false,
  "message": "File too large"
}
```

### 3. Missing Required Fields
Try creating a newsletter without title or content

**Expected Error:**
```json
{
  "success": false,
  "message": "Title and content are required"
}
```

## Notes
- Images are stored in AWS S3 bucket "lysp"
- File size limit: 5MB
- Supported formats: All image types (JPG, PNG, GIF, etc.)
- Images are stored with unique filenames to prevent conflicts
- The imageUrl field is optional - newsletters can be created without images 