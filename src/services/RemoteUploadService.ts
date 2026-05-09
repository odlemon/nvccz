// @ts-nocheck
// Centralized Remote Upload Service
// Handles all file uploads to custom Ubuntu server, replacing Firebase Storage

import axios from "axios";
import FormData from "form-data";
import { logger } from "../utils/logger";

/** POST target for the upload microservice (may stay HTTP on a private network). */
const DEFAULT_REMOTE_UPLOAD_SERVICE_URL = "http://31.220.82.129:3050/upload";
/** Where files actually live — server-side fetch + upload proxy use this (HTTP is fine). Override with REMOTE_MEDIA_INTERNAL_BASE. */
const DEFAULT_REMOTE_MEDIA_INTERNAL_BASE = "http://31.220.82.129/uploads";

function resolveUploadServiceUrl(): string {
  return (
    process.env.REMOTE_UPLOAD_SERVICE_URL || DEFAULT_REMOTE_UPLOAD_SERVICE_URL
  ).replace(/\/+$/, "");
}

/** Direct HTTP base for the file store (used by the API proxy and downloadFile). */
export function resolveInternalMediaBaseUrl(): string {
  return (
    process.env.REMOTE_MEDIA_INTERNAL_BASE || DEFAULT_REMOTE_MEDIA_INTERNAL_BASE
  ).replace(/\/+$/, "");
}

/**
 * Public URLs returned to browsers / stored in DB — all from env (no hardcoded API hosts).
 * REMOTE_MEDIA_BASE_URL (full override) → BASE_URL (API base, often ends with /api) → FRONTEND_URL / API_PUBLIC_BASE_URL.
 * If none set: path-only "/api/public-media" (same-origin); set BASE_URL for absolute URLs on other hosts.
 */
function resolveMediaBaseUrl(): string {
  const explicit = process.env.REMOTE_MEDIA_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const baseUrl = process.env.BASE_URL?.trim();
  if (baseUrl) {
    const b = baseUrl.replace(/\/+$/, "");
    if (/\/api$/i.test(b)) return `${b}/public-media`;
    return `${b}/api/public-media`;
  }
  const origin =
    process.env.FRONTEND_URL?.trim() || process.env.API_PUBLIC_BASE_URL?.trim();
  if (origin) return `${origin.replace(/\/+$/, "")}/api/public-media`;
  logger.warn(
    "RemoteUploadService: BASE_URL and REMOTE_MEDIA_BASE_URL unset — public media URLs use path-only /api/public-media. Set BASE_URL in env for absolute URLs."
  );
  return "/api/public-media";
}

/** Collapse accidental .../api/public-media/api/public-media/... from bad URL rewriting. */
export function collapseDuplicatePublicMediaPath(url: string): string {
  let u = String(url || "");
  const dup = "/api/public-media/api/public-media/";
  while (u.includes(dup)) {
    u = u.replace(dup, "/api/public-media/");
  }
  return u;
}

/** Path under uploads/ (e.g. term-sheet-signatures/foo.png) from any stored URL shape. */
export function extractRelativeMediaPath(stored: string): string {
  const q = stored.split("?")[0];
  const marker = "/uploads/";
  let idx = q.indexOf(marker);
  if (idx >= 0) {
    return normalizeMalformedSignaturePath(q.slice(idx + marker.length).replace(/^\/+/, ""));
  }
  const pm = "/api/public-media/";
  idx = q.indexOf(pm);
  if (idx >= 0) {
    let rel = q.slice(idx + pm.length).replace(/^\/+/, "");
    while (/^api\/public-media\//i.test(rel)) {
      rel = rel.replace(/^api\/public-media\//i, "");
    }
    return normalizeMalformedSignaturePath(rel);
  }
  return normalizeMalformedSignaturePath(q.replace(/^\/+/, ""));
}

/**
 * Fix paths where underscores in signature filenames became spaces (browser/UI or bad storage),
 * e.g. investor 177… signature-….png → investor_177…_signature-….png
 */
export function normalizeMalformedSignaturePath(rel: string): string {
  if (!rel) return rel;
  return rel.replace(/(investor|applicant)\s+(\d+)\s+(signature-)/gi, "$1_$2_$3");
}

/** Bust CDN edge caches that still hold old responses (e.g. CORP: same-origin). Strip in extractRelativeMediaPath. */
function appendPublicMediaCacheBuster(url: string): string {
  if (!url || url.indexOf("/api/public-media/") < 0) return url;
  if (/[?&]cb=/.test(url)) return url;
  return url.includes("?") ? `${url}&cb=1` : `${url}?cb=1`;
}

/**
 * Rebuild our media URLs using resolveMediaBaseUrl() so old http://…/uploads/… rows become
 * https://…/api/public-media/… when BASE_URL (or legacy FRONTEND_URL) is set.
 */
export function rewritePublicMediaUrl(
  url: string | null | undefined
): string | null | undefined {
  if (url == null || url === "") return url;
  const marker = "/uploads/";
  const pm = "/api/public-media/";
  if (url.indexOf(marker) < 0 && url.indexOf(pm) < 0) return url;
  const relative = extractRelativeMediaPath(url);
  const base = resolveMediaBaseUrl();
  return appendPublicMediaCacheBuster(`${base}/${relative}`);
}

function toPublicMediaUrlFromUploadResponse(
  uploadResponseUrl: string,
  fallbackFilename?: string
): string {
  const marker = "/uploads/";
  const idx = uploadResponseUrl.indexOf(marker);
  if (idx >= 0) {
    const relative = normalizeMalformedSignaturePath(
      uploadResponseUrl.slice(idx + marker.length).replace(/^\/+/, "")
    );
    return appendPublicMediaCacheBuster(`${resolveMediaBaseUrl()}/${relative}`);
  }
  // Upload service may already return .../api/public-media/<file> — do not prefix again (avoids /api/public-media/api/public-media/).
  const pmInResponse = "/api/public-media/";
  if (uploadResponseUrl.indexOf(pmInResponse) >= 0) {
    const relative = extractRelativeMediaPath(uploadResponseUrl);
    return appendPublicMediaCacheBuster(`${resolveMediaBaseUrl()}/${relative}`);
  }
  const trimmed = uploadResponseUrl.replace(/^https?:\/\/[^/]+\//, "");
  if (trimmed && trimmed !== uploadResponseUrl) {
    return appendPublicMediaCacheBuster(
      `${resolveMediaBaseUrl()}/${normalizeMalformedSignaturePath(trimmed.replace(/^\/+/, ""))}`
    );
  }
  const name = fallbackFilename || uploadResponseUrl;
  return appendPublicMediaCacheBuster(
    `${resolveMediaBaseUrl()}/${normalizeMalformedSignaturePath(name.replace(/^\/+/, ""))}`
  );
}

// Upload type mapping - maps our internal types to server directory structure
const UPLOAD_TYPE_MAP: Record<string, string> = {
  // Cashbook imports + entry receipt scans (same remote folder as batch imports)
  "cashbook-imports": "cashbook-imports",
  "cashbook": "cashbook-imports",
  "cashbook-receipts": "cashbook-imports",
  "cashbook-receipt": "cashbook-imports",
  
  // Financial reports + procurement vendor invoice PDFs (same remote folder tree)
  "financial-reports": "financial-reports",
  "financial-report": "financial-reports",
  "procurement-vendor-invoices": "financial-reports",
  
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

  // Newsletter cover images
  "newsletters": "newsletters",
  "newsletter": "newsletters",
  "newsletter-covers": "newsletters",
  "newsletter-cover": "newsletters",

  // Company profile / letterhead
  "company-profile": "application-documents",
  "company-profile-logos": "application-documents",
  
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
      const response = await axios.post(resolveUploadServiceUrl(), formData, {
        headers: {
          ...formData.getHeaders(),
        },
        timeout: 60000, // 60 second timeout for large files
      });

      if (response.data.success && response.data.files) {
        logger.info(`Successfully uploaded ${response.data.files.length} file(s) to remote server`);
        const files = response.data.files.map((f: any) => ({
          ...f,
          url: toPublicMediaUrlFromUploadResponse(
            f.url || "",
            f.filename || f.originalname
          ),
        }));
        return {
          success: true,
          files,
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
          errorMessage = `Cannot connect to upload server at ${resolveUploadServiceUrl()} (connection refused). The upload service may be down.`;
        } else if (error.code === 'ETIMEDOUT') {
          errorMessage = `Upload timeout - the server at ${resolveUploadServiceUrl()} took too long to respond.`;
        } else if (error.code === 'ENOTFOUND') {
          errorMessage = `Upload server not found: ${resolveUploadServiceUrl()}. Please check the server configuration.`;
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
    const publicUrl = toPublicMediaUrlFromUploadResponse(
      uploadedFile.url || "",
      uploadedFile.filename || uploadedFile.originalname
    );

    // Extract file path from URL for backward compatibility
    // URL format: …/uploads/{type}/{filename}
    const filePath =
      extractRelativeMediaPath(publicUrl) ||
      uploadedFile.filename ||
      uploadedFile.originalname;

    return {
      filePath: filePath,
      downloadURL: publicUrl,
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
    return resolveMediaBaseUrl();
  }

  /**
   * Download file from server (for backward compatibility with Firebase download)
   */
  async downloadFile(filePath: string): Promise<Buffer> {
    try {
      const rel = extractRelativeMediaPath(filePath);
      const url = `${resolveInternalMediaBaseUrl()}/${rel}`;

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


