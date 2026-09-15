// @ts-nocheck
// Employee's own profile documents (Home hub's My Profile "Add document" flow) — certifications,
// education records, etc. Mirrors HomeWallpaperController's upload pattern (RemoteUploadService),
// generalized to accept any file type instead of images-only.
import { Response } from "express";
import { randomUUID } from "crypto";
import { prisma } from "../utils/database";
import { AuthRequest } from "../middleware/authenticate";
import { remoteUploadService } from "../services/RemoteUploadService";

const MAX_DOCUMENTS_PER_USER = 50;
const MAX_NAME_LENGTH = 255;
const MAX_CATEGORY_LENGTH = 64;

export const profileDocumentController = {
  async listMine(req: AuthRequest, res: Response) {
    try {
      const userId = req.user.id;
      const rows: any[] = await prisma.$queryRawUnsafe(
        `SELECT id, name, category, url, size_bytes AS sizeBytes, mime_type AS mimeType, created_at AS createdAt
         FROM profile_documents WHERE user_id = ? ORDER BY created_at DESC`,
        userId
      );
      res.status(200).json({ success: true, data: rows });
    } catch (error: any) {
      console.error("Error listing profile documents:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  },

  async upload(req: AuthRequest, res: Response) {
    try {
      const userId = req.user.id;
      const files = (req.files as Express.Multer.File[]) || [];
      if (!files.length) {
        res.status(400).json({ success: false, message: "No file provided" });
        return;
      }
      const { name, category } = req.body || {};
      if (!name || typeof name !== "string" || !name.trim() || name.length > MAX_NAME_LENGTH) {
        res.status(400).json({ success: false, message: `name is required (max ${MAX_NAME_LENGTH} chars)` });
        return;
      }
      if (!category || typeof category !== "string" || !category.trim() || category.length > MAX_CATEGORY_LENGTH) {
        res.status(400).json({ success: false, message: `category is required (max ${MAX_CATEGORY_LENGTH} chars)` });
        return;
      }

      const existingCountRows: any[] = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*) AS c FROM profile_documents WHERE user_id = ?`,
        userId
      );
      const existingCount = Number(existingCountRows[0]?.c ?? 0);
      if (existingCount >= MAX_DOCUMENTS_PER_USER) {
        res.status(400).json({
          success: false,
          message: `You can keep at most ${MAX_DOCUMENTS_PER_USER} profile documents (${existingCount} already saved).`,
        });
        return;
      }

      const uploadResult = await remoteUploadService.uploadFiles(files, "profile-documents");
      if (!uploadResult.success || !uploadResult.files || !uploadResult.files[0]) {
        res.status(502).json({ success: false, message: uploadResult.error || "Upload failed" });
        return;
      }

      const f = uploadResult.files[0];
      const originalFile = files[0];
      const id = randomUUID();
      await prisma.$executeRawUnsafe(
        `INSERT INTO profile_documents (id, user_id, name, category, url, size_bytes, mime_type)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        id,
        userId,
        name.trim(),
        category.trim(),
        f.url,
        originalFile.size ?? null,
        originalFile.mimetype ?? null
      );
      const rows: any[] = await prisma.$queryRawUnsafe(
        `SELECT id, name, category, url, size_bytes AS sizeBytes, mime_type AS mimeType, created_at AS createdAt
         FROM profile_documents WHERE id = ?`,
        id
      );
      res.status(201).json({ success: true, message: "Document uploaded successfully", data: rows[0] });
    } catch (error: any) {
      console.error("Error uploading profile document:", error);
      res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
  },

  // Only removes the DB row — see HomeWallpaperController.remove's comment: RemoteUploadService
  // has no delete-on-remote-host support yet, same pre-existing limitation as every other
  // feature using this upload service.
  async remove(req: AuthRequest, res: Response) {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const rows: any[] = await prisma.$queryRawUnsafe(
        `SELECT id FROM profile_documents WHERE id = ? AND user_id = ?`,
        id,
        userId
      );
      if (!rows.length) {
        res.status(404).json({ success: false, message: "Document not found" });
        return;
      }
      await prisma.$executeRawUnsafe(`DELETE FROM profile_documents WHERE id = ?`, id);
      res.status(200).json({ success: true, message: "Document removed" });
    } catch (error: any) {
      console.error("Error deleting profile document:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }
};
