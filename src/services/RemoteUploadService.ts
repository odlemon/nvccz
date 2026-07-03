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
/** Local mock used when the remote upload service is unreachable (dev/UAT). */
const LOCAL_FALLBACK_UPLOAD_SERVICE_URL = "http://127.0.0.1:3050/upload";
const LOCAL_FALLBACK_MEDIA_INTERNAL_BASE = "http://127.0.0.1:3050/uploads";

function usingDefaultRemoteUploadUrl(): boolean {
  const configured = process.env.REMOTE_UPLOAD_SERVICE_URL?.trim();
  return !configured || configured.replace(/\/+$/, "") === DEFAULT_REMOTE_UPLOAD_SERVICE_URL.replace(/\/+$/, "");
}

function usingDefaultRemoteMediaInternalBase(): boolean {
  const configured = process.env.REMOTE_MEDIA_INTERNAL_BASE?.trim();
  return (
    !configured ||
    configured.replace(/\/+$/, "") === DEFAULT_REMOTE_MEDIA_INTERNAL_BASE.replace(/\/+$/, "")
  );
}

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
export function resolveMediaBaseUrl(): string {
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
  "vendor-record-attachments": "financial-reports",
  
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
  "portfolio-company-letterhead-logos": "application-documents",

  // Payroll employee profile photos
  "payroll-employee-pictures": "application-documents",
  "payroll-employee-picture": "application-documents",

  // Deal execution pack documents
  "deal-execution-pack": "financial-reports",
  "deal-execution-packs": "financial-reports",
  
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

interface NormalizedUploadFile {
  buffer: Buffer;
  filename: string;
  mimetype: string;
}

function normalizeUploadFiles(
  files: UploadFileInput | UploadFileInput[] | Express.Multer.File | Express.Multer.File[]
): NormalizedUploadFile[] {
  const fileArray = Array.isArray(files) ? files : [files];
  return fileArray.map((file) => {
    let buffer: Buffer;
    let filename: string;
    let mimetype = "application/octet-stream";

    if ("buffer" in file && file.buffer) {
      buffer = file.buffer;
      filename = file.originalname || `file-${Date.now()}`;
      mimetype = file.mimetype || mimetype;
    } else if (file instanceof Buffer || (file as any).buffer) {
      buffer = (file as any).buffer || file;
      filename = (file as any).originalname || `file-${Date.now()}`;
      mimetype = (file as any).mimetype || mimetype;
    } else {
      throw new Error(`Invalid file format: ${JSON.stringify(file)}`);
    }

    return { buffer, filename, mimetype };
  });
}

function buildUploadFormData(
  normalizedFiles: NormalizedUploadFile[],
  serverType: string
): FormData {
  const formData = new FormData();
  formData.append("type", serverType);
  for (const file of normalizedFiles) {
    formData.append("images", file.buffer, {
      filename: file.filename,
      contentType: file.mimetype,
    });
  }
  return formData;
}

function isUploadNetworkError(error: any): boolean {
  const code = error?.code;
  return (
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "ECONNABORTED" ||
    code === "ENOTFOUND" ||
    code === "EHOSTUNREACH"
  );
}

async function postUploadFormData(
  formData: FormData,
  uploadUrl: string,
  timeoutMs = 60000
): Promise<{ success: boolean; files?: any[]; message?: string; error?: string }> {
  const response = await axios.post(uploadUrl, formData, {
    headers: {
      ...formData.getHeaders(),
    },
    timeout: timeoutMs,
  });
  return response.data;
}

function buildDownloadPathCandidates(filePath: string): string[] {
  const rel = extractRelativeMediaPath(filePath);
  const candidates: string[] = [];
  if (rel) candidates.push(rel);
  const trimmed = String(filePath || "").replace(/^\/+/, "");
  if (trimmed && !candidates.includes(trimmed)) candidates.push(trimmed);
  const fileName = (rel || trimmed).split("/").pop();
  if (fileName) {
    const tempCandidate = `temp/${fileName}`;
    if (!candidates.includes(tempCandidate)) candidates.push(tempCandidate);
  }
  return candidates;
}

async function fetchMediaBuffer(url: string): Promise<Buffer> {
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 30000,
    validateStatus: (status) => status < 500,
  });
  if (response.status >= 400) {
    throw new Error(`Request failed with status code ${response.status}`);
  }
  return Buffer.from(response.data);
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
      const normalizedFiles = normalizeUploadFiles(files);

      if (normalizedFiles.length === 0) {
        return {
          success: false,
          error: "No files to upload",
        };
      }

      // Map upload type to server directory
      const serverType = this.mapUploadType(uploadType);
      const formData = buildUploadFormData(normalizedFiles, serverType);

      logger.info(`Uploading ${normalizedFiles.length} file(s) to remote server`, {
        uploadType: serverType,
        fileCount: normalizedFiles.length,
      });

      const primaryUploadUrl = resolveUploadServiceUrl();
      const canUseLocalFallback = usingDefaultRemoteUploadUrl();
      let uploadData: { success: boolean; files?: any[]; message?: string; error?: string };
      let usedUploadUrl = primaryUploadUrl;

      try {
        uploadData = await postUploadFormData(
          formData,
          primaryUploadUrl,
          canUseLocalFallback ? 5000 : 60000
        );
      } catch (primaryError: any) {
        if (!canUseLocalFallback || !isUploadNetworkError(primaryError)) throw primaryError;
        logger.warn(
          `Remote upload unreachable at ${primaryUploadUrl} (${primaryError?.code || primaryError?.message}); retrying local mock at ${LOCAL_FALLBACK_UPLOAD_SERVICE_URL}`
        );
        usedUploadUrl = LOCAL_FALLBACK_UPLOAD_SERVICE_URL;
        uploadData = await postUploadFormData(
          buildUploadFormData(normalizedFiles, serverType),
          LOCAL_FALLBACK_UPLOAD_SERVICE_URL
        );
      }

      if (uploadData.success && uploadData.files) {
        logger.info(`Successfully uploaded ${uploadData.files.length} file(s) via ${usedUploadUrl}`);
        const files = uploadData.files.map((f: any) => ({
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
        logger.error("Upload failed", { response: uploadData, uploadUrl: usedUploadUrl });
        return {
          success: false,
          error: uploadData.message || uploadData.error || "Upload failed",
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
    const candidates = buildDownloadPathCandidates(filePath);
    const bases = [resolveInternalMediaBaseUrl()];
    if (usingDefaultRemoteMediaInternalBase()) {
      bases.push(LOCAL_FALLBACK_MEDIA_INTERNAL_BASE);
    }

    let lastError: any;
    for (let baseIndex = 0; baseIndex < bases.length; baseIndex++) {
      const base = bases[baseIndex];
      if (baseIndex > 0) {
        logger.warn(`Retrying download via alternate media base ${base}`);
      }
      for (const rel of candidates) {
        const url = `${base}/${rel}`;
        try {
          logger.info(`Downloading file from remote server: ${url}`);
          const buffer = await fetchMediaBuffer(url);
          logger.info(`Successfully downloaded file: ${filePath}`);
          return buffer;
        } catch (error: any) {
          lastError = error;
        }
      }
    }

    logger.error("Error downloading file from remote server:", {
      error: lastError?.message,
      filePath,
    });
    throw new Error(`Failed to download file: ${lastError?.message || "unknown error"}`);
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


