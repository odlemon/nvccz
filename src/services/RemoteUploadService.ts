// @ts-nocheck
// Centralized Remote Upload Service
// Handles all file uploads to custom Ubuntu server, replacing Firebase Storage

import axios from "axios";
import FormData from "form-data";
import { logger } from "../utils/logger";

// Configuration - Ubuntu server upload service
const UPLOAD_SERVICE_URL = "http://31.220.82.129:3050/upload";
const MEDIA_BASE_URL = "http://31.220.82.129/uploads";

// Upload type mapping - maps our internal types to server directory structure
const UPLOAD_TYPE_MAP: Record<string, string> = {
  // Cashbook imports
  "cashbook-imports": "cashbook-imports",
  "cashbook": "cashbook-imports",
  
  // Financial reports
  "financial-reports": "financial-reports",
  "financial-report": "financial-reports",
  
  // Application documents
  "application-documents": "application-documents",
  "application-document": "application-documents",
  
  // Term sheets
  "term-sheets": "term-sheets",
  "term-sheet": "term-sheets",
  "term-sheet-signatures": "term-sheet-signatures",
  "term-sheet-signature": "term-sheet-signatures",
  
  // Activity documents (stored under application-documents)
  "activity-documents": "application-documents",
  "activity-document": "application-documents",
  
  // Default/temp
  "temp": "temp",
  "default": "temp"
};

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

export interface UploadFileInput {
  buffer: Buffer;
  originalname: string;
  mimetype?: string;
  size?: number;
}

export class RemoteUploadService {
  /**
   * Upload files to Ubuntu server
   * @param files - File buffer(s) or Multer file(s)
   * @param uploadType - Upload type (cashbook-imports, financial-reports, application-documents, etc.)
   */
  async uploadFiles(
    files: UploadFileInput | UploadFileInput[] | Express.Multer.File | Express.Multer.File[],
    uploadType: string = "temp"
  ): Promise<RemoteUploadResult> {
    try {
      // Normalize input to array
      const fileArray = Array.isArray(files) ? files : [files];

      if (fileArray.length === 0) {
        return {
          success: false,
          error: "No files to upload",
        };
      }

      // Map upload type to server directory
      const serverType = this.mapUploadType(uploadType);

      // Create FormData for multipart/form-data request
      const formData = new FormData();

      // Add all files to form data
      for (const file of fileArray) {
        // Handle both Multer files and raw buffers
        let buffer: Buffer;
        let filename: string;
        let mimetype: string = "application/octet-stream";

        if ("buffer" in file && file.buffer) {
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
          throw new Error(`Invalid file format: ${JSON.stringify(file)}`);
        }

        formData.append("images", buffer, {
          filename: filename,
          contentType: mimetype,
        });
      }

      // Add upload type
      formData.append("type", serverType);

      logger.info(`Uploading ${fileArray.length} file(s) to remote server`, {
        uploadType: serverType,
        fileCount: fileArray.length,
      });

      // Upload to Ubuntu server
      const response = await axios.post(UPLOAD_SERVICE_URL, formData, {
        headers: {
          ...formData.getHeaders(),
        },
        timeout: 60000, // 60 second timeout for large files
      });

      if (response.data.success && response.data.files) {
        logger.info(`Successfully uploaded ${response.data.files.length} file(s) to remote server`);
        return {
          success: true,
          files: response.data.files,
        };
      } else {
        logger.error("Upload failed", { response: response.data });
        return {
          success: false,
          error: response.data.message || "Upload failed",
        };
      }
    } catch (error: any) {
      // Extract detailed error from server response
      let errorMessage = error.message || "Failed to upload files to remote server";
      
      if (error.response) {
        // Server responded with an error status
        const status = error.response.status;
        const statusText = error.response.statusText;
        const responseData = error.response.data;
        
        logger.error("Error uploading files to remote server:", {
          status: status,
          statusText: statusText,
          responseData: responseData,
          uploadType,
          error: error.message,
          stack: error.stack,
        });
        
        // Extract actual error message from server response
        if (responseData) {
          if (responseData.message) {
            errorMessage = `Server error (${status}): ${responseData.message}`;
          } else if (responseData.error) {
            errorMessage = `Server error (${status}): ${responseData.error}`;
          } else if (typeof responseData === 'string') {
            errorMessage = `Server error (${status}): ${responseData}`;
          } else {
            errorMessage = `Server error (${status} ${statusText}): ${JSON.stringify(responseData)}`;
          }
        } else {
          errorMessage = `Server error (${status} ${statusText}): No error details provided`;
        }
      } else if (error.code) {
        // Network/connection error
        logger.error("Network error uploading files to remote server:", {
          code: error.code,
          message: error.message,
          uploadType,
        });
        
        if (error.code === 'ECONNREFUSED') {
          errorMessage = `Cannot connect to upload server at ${UPLOAD_SERVICE_URL} (connection refused). The upload service may be down.`;
        } else if (error.code === 'ETIMEDOUT') {
          errorMessage = `Upload timeout - the server at ${UPLOAD_SERVICE_URL} took too long to respond.`;
        } else if (error.code === 'ENOTFOUND') {
          errorMessage = `Upload server not found: ${UPLOAD_SERVICE_URL}. Please check the server configuration.`;
        } else {
          errorMessage = `Network error (${error.code}): ${errorMessage}`;
        }
      } else {
        logger.error("Unknown error uploading files to remote server:", {
          error: error.message,
          stack: error.stack,
          uploadType,
        });
      }
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Upload a single file and return the first result
   */
  async uploadSingleFile(
    file: UploadFileInput | Express.Multer.File | Buffer,
    uploadType: string = "temp"
  ): Promise<{ filePath: string; downloadURL: string }> {
    const result = await this.uploadFiles(file, uploadType);

    if (!result.success || !result.files || result.files.length === 0) {
      // Throw error with the actual server error message
      const errorMessage = result.error || "Failed to upload file";
      logger.error("uploadSingleFile failed", {
        error: errorMessage,
        uploadType,
        hasFiles: !!result.files,
        fileCount: result.files?.length || 0
      });
      throw new Error(errorMessage);
    }

    const uploadedFile = result.files[0];

    // Extract file path from URL for backward compatibility
    // URL format: http://31.220.82.129/uploads/{type}/{filename}
    const urlParts = uploadedFile.url.split("/uploads/");
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
    const normalized = uploadType.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    return UPLOAD_TYPE_MAP[normalized] || "temp";
  }

  /**
   * Get media base URL
   */
  getMediaBaseUrl(): string {
    return MEDIA_BASE_URL;
  }

  /**
   * Download file from server (for backward compatibility with Firebase download)
   */
  async downloadFile(filePath: string): Promise<Buffer> {
    try {
      // If filePath is already a full URL, use it directly
      let url: string;
      if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
        url = filePath;
      } else {
        // Construct URL from file path
        url = `${MEDIA_BASE_URL}/${filePath}`;
      }

      logger.info(`Downloading file from remote server: ${url}`);

      const response = await axios.get(url, {
        responseType: "arraybuffer",
        timeout: 30000,
      });

      const buffer = Buffer.from(response.data);
      logger.info(`Successfully downloaded file: ${filePath}`);
      return buffer;
    } catch (error: any) {
      logger.error("Error downloading file from remote server:", {
        error: error.message,
        filePath,
      });
      throw new Error(`Failed to download file: ${error.message}`);
    }
  }

  /**
   * Delete file from server (placeholder - implement if needed)
   */
  async deleteFile(filePath: string): Promise<void> {
    // TODO: Implement delete endpoint on Ubuntu server if needed
    logger.warn("Delete file not implemented for remote server", { filePath });
    throw new Error("Delete file not yet implemented for remote server");
  }

  /**
   * List files (placeholder - implement if needed)
   */
  async listFiles(path: string): Promise<string[]> {
    // TODO: Implement list endpoint on Ubuntu server if needed
    logger.warn("List files not implemented for remote server", { path });
    throw new Error("List files not yet implemented for remote server");
  }
}

export const remoteUploadService = new RemoteUploadService();


