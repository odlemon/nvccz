# File Upload Technical Setup Documentation

This document describes the technical implementation of the file upload system used in this Node.js/Express application. This setup can be adapted for Laravel or other PHP frameworks.

## Overview

The application uses a **remote file upload service** architecture where:
1. Files are received via `multipart/form-data` using Multer middleware
2. Files are stored in memory (buffers) temporarily
3. Files are forwarded to a remote Ubuntu server via HTTP POST
4. The remote server stores files and returns URLs
5. URLs are stored in the database for later retrieval

## Architecture

```
Client (Frontend)
    ↓ multipart/form-data
Express.js API (Node.js)
    ↓ Multer (memory storage)
File Buffer in Memory
    ↓ HTTP POST (FormData)
Remote Upload Service (Ubuntu Server :3050)
    ↓ File Storage
File System (/uploads directory)
    ↓ Return URL
Database (Store URL)
```

## Components

### 1. Multer Configuration (File Reception)

**Purpose**: Receives files from client as `multipart/form-data` and stores them in memory.

**Dependencies**:
```json
{
  "multer": "^2.0.2",
  "@types/multer": "^2.0.0"
}
```

**Configuration Example**:
```typescript
import multer from 'multer';

const upload = multer({
  storage: multer.memoryStorage(),  // Store files in memory as buffers
  limits: {
    fileSize: 10 * 1024 * 1024,  // 10MB limit (adjust as needed)
  },
  fileFilter: (req, file, cb) => {
    // Optional: Validate file types
    const allowedMimes = [
      'application/pdf',
      'text/csv',
      'image/jpeg',
      'image/png',
      // ... more types
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'), false);
    }
  }
});
```

**Route Usage**:
```typescript
router.post(
  '/upload-endpoint',
  authenticate,           // Authentication middleware
  upload.single('file'),   // Single file upload (field name: 'file')
  controller.uploadFile
);

// For multiple files:
router.post(
  '/upload-endpoint',
  authenticate,
  upload.array('files', 10),  // Max 10 files
  controller.uploadFiles
);

// For multiple fields:
router.post(
  '/upload-endpoint',
  authenticate,
  upload.fields([
    { name: 'documents', maxCount: 5 },
    { name: 'images', maxCount: 3 }
  ]),
  controller.uploadMultipleFields
);
```

**Accessing Files in Controller**:
```typescript
// Single file
const file = req.file;
const buffer = file.buffer;           // File content as Buffer
const originalname = file.originalname; // Original filename
const mimetype = file.mimetype;        // MIME type
const size = file.size;                // File size in bytes

// Multiple files (array)
const files = req.files as Express.Multer.File[];
files.forEach(file => {
  // Process each file
});

// Multiple fields
const files = req.files as { [fieldname: string]: Express.Multer.File[] };
const documents = files['documents'];
const images = files['images'];
```

### 2. Remote Upload Service (File Forwarding)

**Purpose**: Forwards files from the Express API to a remote Ubuntu server.

**Dependencies**:
```json
{
  "axios": "^1.12.2",
  "form-data": "^4.0.4"
}
```

**Service Implementation** (`RemoteUploadService.ts`):

```typescript
import axios from 'axios';
import FormData from 'form-data';
import { logger } from '../utils/logger';

// Configuration
const UPLOAD_SERVICE_URL = 'http://31.220.82.129:3050/upload';
const MEDIA_BASE_URL = 'http://31.220.82.129/uploads';

// Upload type mapping - maps internal types to server directory structure
const UPLOAD_TYPE_MAP: Record<string, string> = {
  'cashbook-imports': 'cashbook-imports',
  'financial-reports': 'financial-reports',
  'application-documents': 'application-documents',
  'term-sheets': 'term-sheets',
  'term-sheet-signatures': 'term-sheet-signatures',
  'temp': 'temp',
  'default': 'temp'
};

export interface UploadFileInput {
  buffer: Buffer;
  originalname: string;
  mimetype?: string;
  size?: number;
}

export interface RemoteUploadResult {
  success: boolean;
  files?: Array<{
    url: string;
    filename: string;
    originalname: string;
    size: number;
    mimetype: string;
  }>;
  error?: string;
}

export class RemoteUploadService {
  /**
   * Upload files to remote Ubuntu server
   * @param files - File buffer(s) or Multer file(s)
   * @param uploadType - Upload type (maps to server directory)
   */
  async uploadFiles(
    files: UploadFileInput | UploadFileInput[] | Express.Multer.File | Express.Multer.File[],
    uploadType: string = 'temp'
  ): Promise<RemoteUploadResult> {
    try {
      // Normalize input to array
      const fileArray = Array.isArray(files) ? files : [files];

      if (fileArray.length === 0) {
        return {
          success: false,
          error: 'No files to upload',
        };
      }

      // Map upload type to server directory
      const serverType = this.mapUploadType(uploadType);

      // Create FormData for multipart/form-data request
      const formData = new FormData();

      // Add all files to form data
      for (const file of fileArray) {
        let buffer: Buffer;
        let filename: string;
        let mimetype: string = 'application/octet-stream';

        // Handle both Multer files and raw buffers
        if ('buffer' in file && file.buffer) {
          // Multer file
          buffer = file.buffer;
          filename = file.originalname || `file-${Date.now()}`;
          mimetype = file.mimetype || mimetype;
        } else if (file instanceof Buffer || (file as any).buffer) {
          // Raw buffer or UploadFileInput
          buffer = (file as any).buffer || file;
          filename = (file as any).originalname || `file-${Date.now()}`;
          mimetype = (file as any).mimetype || mimetype;
        } else {
          throw new Error(`Invalid file format`);
        }

        // Append file to FormData
        // Note: Remote server expects field name 'images' (can be configured)
        formData.append('images', buffer, {
          filename: filename,
          contentType: mimetype,
        });
      }

      // Add upload type
      formData.append('type', serverType);

      // Upload to remote server
      const response = await axios.post(UPLOAD_SERVICE_URL, formData, {
        headers: {
          ...formData.getHeaders(),  // Important: Include multipart headers
        },
        timeout: 60000,  // 60 second timeout for large files
      });

      if (response.data.success && response.data.files) {
        return {
          success: true,
          files: response.data.files,
        };
      } else {
        return {
          success: false,
          error: response.data.message || 'Upload failed',
        };
      }
    } catch (error: any) {
      // Handle errors
      let errorMessage = error.message || 'Failed to upload files';
      
      if (error.response) {
        // Server responded with error
        const status = error.response.status;
        const responseData = error.response.data;
        errorMessage = `Server error (${status}): ${responseData.message || JSON.stringify(responseData)}`;
      } else if (error.code) {
        // Network error
        if (error.code === 'ECONNREFUSED') {
          errorMessage = `Cannot connect to upload server (connection refused)`;
        } else if (error.code === 'ETIMEDOUT') {
          errorMessage = `Upload timeout - server took too long to respond`;
        }
      }
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Upload a single file and return simplified result
   */
  async uploadSingleFile(
    file: UploadFileInput | Express.Multer.File | Buffer,
    uploadType: string = 'temp'
  ): Promise<{ filePath: string; downloadURL: string }> {
    const result = await this.uploadFiles(file, uploadType);

    if (!result.success || !result.files || result.files.length === 0) {
      throw new Error(result.error || 'Failed to upload file');
    }

    const uploadedFile = result.files[0];

    // Extract file path from URL
    const urlParts = uploadedFile.url.split('/uploads/');
    const filePath = urlParts.length > 1 ? urlParts[1] : uploadedFile.filename;

    return {
      filePath: filePath,
      downloadURL: uploadedFile.url,
    };
  }

  /**
   * Map internal upload type to server directory type
   */
  private mapUploadType(uploadType: string): string {
    const normalized = uploadType.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    return UPLOAD_TYPE_MAP[normalized] || 'temp';
  }

  /**
   * Get media base URL
   */
  getMediaBaseUrl(): string {
    return MEDIA_BASE_URL;
  }

  /**
   * Download file from server
   */
  async downloadFile(filePath: string): Promise<Buffer> {
    let url: string;
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      url = filePath;
    } else {
      url = `${MEDIA_BASE_URL}/${filePath}`;
    }

    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000,
    });

    return Buffer.from(response.data);
  }
}

export const remoteUploadService = new RemoteUploadService();
```

### 3. Controller Usage Example

**Complete Flow in Controller**:

```typescript
import { Request, Response, NextFunction } from 'express';
import { remoteUploadService } from '../services/RemoteUploadService';
import { ResponseHelper } from '../utils/responseHelper';

export class FileController {
  async uploadFile(req: Request, res: Response, next: NextFunction) {
    try {
      // 1. Validate file exists
      if (!req.file) {
        return ResponseHelper.error(res, 'No file provided', undefined, 400);
      }

      // 2. Upload to remote server
      const uploadResult = await remoteUploadService.uploadSingleFile(
        {
          buffer: req.file.buffer,
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
        },
        'financial-reports'  // Upload type
      );

      // 3. Save URL to database
      // const record = await prisma.someTable.create({
      //   data: {
      //     fileUrl: uploadResult.downloadURL,
      //     filePath: uploadResult.filePath,
      //     // ... other fields
      //   }
      // });

      // 4. Return success response
      return ResponseHelper.success(
        res,
        'File uploaded successfully',
        {
          id: record.id,
          fileUrl: uploadResult.downloadURL,
          filePath: uploadResult.filePath,
        },
        201
      );
    } catch (error: any) {
      next(error);
    }
  }

  async uploadMultipleFiles(req: Request, res: Response, next: NextFunction) {
    try {
      const files = req.files as Express.Multer.File[];
      
      if (!files || files.length === 0) {
        return ResponseHelper.error(res, 'No files provided', undefined, 400);
      }

      // Upload all files
      const uploadResult = await remoteUploadService.uploadFiles(
        files,
        'application-documents'
      );

      if (!uploadResult.success) {
        return ResponseHelper.error(
          res,
          uploadResult.error || 'Upload failed',
          undefined,
          500
        );
      }

      // Process uploaded files
      const uploadedFiles = uploadResult.files || [];
      
      return ResponseHelper.success(
        res,
        `${uploadedFiles.length} file(s) uploaded successfully`,
        { files: uploadedFiles },
        201
      );
    } catch (error: any) {
      next(error);
    }
  }
}
```

## Remote Server Requirements

The remote Ubuntu server must have an upload service running on port `3050` that:

1. **Accepts POST requests** at `/upload`
2. **Expects multipart/form-data** with:
   - Field name: `images` (or configurable)
   - Field name: `type` (directory/category)
3. **Stores files** in `/uploads/{type}/` directory
4. **Returns JSON response**:
```json
{
  "success": true,
  "files": [
    {
      "url": "http://31.220.82.129/uploads/financial-reports/filename.pdf",
      "filename": "filename.pdf",
      "originalname": "original-name.pdf",
      "size": 12345,
      "mimetype": "application/pdf"
    }
  ]
}
```

### Example Remote Server Implementation (Node.js)

```javascript
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3050;

// Ensure uploads directory exists
const UPLOADS_DIR = '/uploads';
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Configure multer for disk storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const type = req.body.type || 'temp';
    const uploadPath = path.join(UPLOADS_DIR, type);
    
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

app.post('/upload', upload.array('images', 10), (req, res) => {
  try {
    const files = req.files || [];
    const baseUrl = 'http://31.220.82.129/uploads';
    
    const uploadedFiles = files.map(file => ({
      url: `${baseUrl}/${req.body.type}/${file.filename}`,
      filename: file.filename,
      originalname: file.originalname,
      size: file.size,
      mimetype: file.mimetype
    }));

    res.json({
      success: true,
      files: uploadedFiles
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Serve uploaded files
app.use('/uploads', express.static(UPLOADS_DIR));

app.listen(PORT, () => {
  console.log(`Upload service running on port ${PORT}`);
});
```

## Laravel Implementation Guide

### 1. Install Dependencies

```bash
composer require guzzlehttp/guzzle
```

### 2. Create Upload Service Class

```php
<?php
// app/Services/RemoteUploadService.php

namespace App\Services;

use GuzzleHttp\Client;
use GuzzleHttp\Exception\GuzzleException;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Log;

class RemoteUploadService
{
    private $client;
    private $uploadServiceUrl;
    private $mediaBaseUrl;
    
    private $uploadTypeMap = [
        'cashbook-imports' => 'cashbook-imports',
        'financial-reports' => 'financial-reports',
        'application-documents' => 'application-documents',
        'term-sheets' => 'term-sheets',
        'term-sheet-signatures' => 'term-sheet-signatures',
        'temp' => 'temp',
    ];

    public function __construct()
    {
        $this->client = new Client([
            'timeout' => 60.0,
        ]);
        $this->uploadServiceUrl = env('UPLOAD_SERVICE_URL', 'http://31.220.82.129:3050/upload');
        $this->mediaBaseUrl = env('MEDIA_BASE_URL', 'http://31.220.82.129/uploads');
    }

    /**
     * Upload single file
     */
    public function uploadSingleFile(UploadedFile $file, string $uploadType = 'temp'): array
    {
        $result = $this->uploadFiles([$file], $uploadType);
        
        if (!$result['success'] || empty($result['files'])) {
            throw new \Exception($result['error'] ?? 'Failed to upload file');
        }

        $uploadedFile = $result['files'][0];
        $urlParts = explode('/uploads/', $uploadedFile['url']);
        $filePath = count($urlParts) > 1 ? $urlParts[1] : $uploadedFile['filename'];

        return [
            'filePath' => $filePath,
            'downloadURL' => $uploadedFile['url'],
        ];
    }

    /**
     * Upload multiple files
     */
    public function uploadFiles(array $files, string $uploadType = 'temp'): array
    {
        try {
            if (empty($files)) {
                return [
                    'success' => false,
                    'error' => 'No files to upload',
                ];
            }

            $serverType = $this->mapUploadType($uploadType);
            
            // Prepare multipart form data
            $multipart = [];
            
            foreach ($files as $file) {
                $multipart[] = [
                    'name' => 'images',
                    'contents' => fopen($file->getRealPath(), 'r'),
                    'filename' => $file->getClientOriginalName(),
                    'headers' => [
                        'Content-Type' => $file->getMimeType(),
                    ],
                ];
            }
            
            $multipart[] = [
                'name' => 'type',
                'contents' => $serverType,
            ];

            $response = $this->client->post($this->uploadServiceUrl, [
                'multipart' => $multipart,
            ]);

            $data = json_decode($response->getBody()->getContents(), true);

            if (isset($data['success']) && $data['success'] && isset($data['files'])) {
                return [
                    'success' => true,
                    'files' => $data['files'],
                ];
            }

            return [
                'success' => false,
                'error' => $data['message'] ?? 'Upload failed',
            ];
        } catch (GuzzleException $e) {
            Log::error('File upload error', [
                'message' => $e->getMessage(),
                'uploadType' => $uploadType,
            ]);

            $errorMessage = 'Failed to upload files';
            if ($e->getCode() === 0) {
                $errorMessage = 'Cannot connect to upload server';
            } elseif ($e->getCode() === 28) {
                $errorMessage = 'Upload timeout';
            }

            return [
                'success' => false,
                'error' => $errorMessage,
            ];
        }
    }

    /**
     * Map upload type to server directory
     */
    private function mapUploadType(string $uploadType): string
    {
        $normalized = strtolower(preg_replace('/[^a-z0-9-]/', '-', $uploadType));
        return $this->uploadTypeMap[$normalized] ?? 'temp';
    }

    /**
     * Get media base URL
     */
    public function getMediaBaseUrl(): string
    {
        return $this->mediaBaseUrl;
    }

    /**
     * Download file from server
     */
    public function downloadFile(string $filePath): string
    {
        $url = str_starts_with($filePath, 'http') 
            ? $filePath 
            : "{$this->mediaBaseUrl}/{$filePath}";

        $response = $this->client->get($url);
        return $response->getBody()->getContents();
    }
}
```

### 3. Create Controller

```php
<?php
// app/Http/Controllers/FileController.php

namespace App\Http\Controllers;

use App\Services\RemoteUploadService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class FileController extends Controller
{
    protected $uploadService;

    public function __construct(RemoteUploadService $uploadService)
    {
        $this->uploadService = $uploadService;
    }

    /**
     * Upload single file
     */
    public function uploadFile(Request $request): JsonResponse
    {
        $request->validate([
            'file' => 'required|file|max:10240', // 10MB max
            'uploadType' => 'sometimes|string',
        ]);

        try {
            $file = $request->file('file');
            $uploadType = $request->input('uploadType', 'temp');

            $result = $this->uploadService->uploadSingleFile($file, $uploadType);

            // Save to database
            // $record = YourModel::create([
            //     'file_url' => $result['downloadURL'],
            //     'file_path' => $result['filePath'],
            // ]);

            return response()->json([
                'success' => true,
                'message' => 'File uploaded successfully',
                'data' => $result,
            ], 201);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 500);
        }
    }

    /**
     * Upload multiple files
     */
    public function uploadFiles(Request $request): JsonResponse
    {
        $request->validate([
            'files.*' => 'required|file|max:10240',
            'uploadType' => 'sometimes|string',
        ]);

        try {
            $files = $request->file('files');
            $uploadType = $request->input('uploadType', 'temp');

            $result = $this->uploadService->uploadFiles($files, $uploadType);

            if (!$result['success']) {
                return response()->json([
                    'success' => false,
                    'message' => $result['error'],
                ], 500);
            }

            return response()->json([
                'success' => true,
                'message' => count($result['files']) . ' file(s) uploaded successfully',
                'data' => $result,
            ], 201);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 500);
        }
    }
}
```

### 4. Define Routes

```php
// routes/api.php

use App\Http\Controllers\FileController;

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/upload', [FileController::class, 'uploadFile']);
    Route::post('/upload-multiple', [FileController::class, 'uploadFiles']);
});
```

### 5. Environment Configuration

```env
# .env

UPLOAD_SERVICE_URL=http://31.220.82.129:3050/upload
MEDIA_BASE_URL=http://31.220.82.129/uploads
```

## Key Points

1. **Memory Storage**: Files are stored in memory (buffers) temporarily, not on disk
2. **FormData**: Uses `multipart/form-data` format for HTTP POST
3. **Field Names**: Remote server expects `images` field (can be configured)
4. **Type Mapping**: Internal upload types map to server directory structure
5. **Error Handling**: Comprehensive error handling for network and server errors
6. **Timeout**: 60-second timeout for large files
7. **URL Storage**: Store returned URLs in database, not file paths

## Security Considerations

1. **File Validation**: Validate file types and sizes on both client and server
2. **Authentication**: Protect upload endpoints with authentication middleware
3. **File Size Limits**: Set appropriate limits to prevent DoS attacks
4. **Sanitization**: Sanitize filenames before storage
5. **Access Control**: Implement access control for file retrieval
6. **Virus Scanning**: Consider adding virus scanning for uploaded files

## Testing

### Test Single File Upload

```bash
curl -X POST http://localhost:3000/api/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "file=@/path/to/file.pdf" \
  -F "uploadType=financial-reports"
```

### Test Multiple File Upload

```bash
curl -X POST http://localhost:3000/api/upload-multiple \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "files[]=@/path/to/file1.pdf" \
  -F "files[]=@/path/to/file2.pdf" \
  -F "uploadType=application-documents"
```

## Troubleshooting

1. **Connection Refused**: Check if remote upload service is running
2. **Timeout**: Increase timeout for large files
3. **File Not Found**: Verify file path and URL format
4. **Permission Denied**: Check file system permissions on remote server
5. **Memory Issues**: Consider streaming for very large files

## Summary

This architecture provides:
- ✅ Centralized file storage
- ✅ Scalable upload handling
- ✅ Separation of concerns (API vs Storage)
- ✅ Easy migration between storage backends
- ✅ Support for multiple file types and sizes
