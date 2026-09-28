// @ts-nocheck
// User-uploaded Daily Cover background images (design-refs/home-page/execution-plan.md
// Phase 2b). Queried with raw SQL for the same reason as the other new Home-hub tables this
// build added — see HomepageController.ts's preference-endpoints comment.
import { Response } from "express";
import { randomUUID } from "crypto";
import { prisma } from "../utils/database";
import { AuthRequest } from "../middleware/authenticate";
import { remoteUploadService } from "../services/RemoteUploadService";

const MAX_WALLPAPERS_PER_USER = 20;

export const homeWallpaperController = {
  async listMine(req: AuthRequest, res: Response) {
    try {
      const userId = req.user.id;
      const rows: any[] = await prisma.$queryRawUnsafe(
        `SELECT id, url, label, sort_order AS sortOrder, created_at AS createdAt
         FROM home_wallpapers WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC`,
        userId
      );
      res.status(200).json({ success: true, data: rows });
    } catch (error: any) {
      console.error("Error listing home wallpapers:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  },

  async upload(req: AuthRequest, res: Response) {
    try {
      const userId = req.user.id;
      const files = (req.files as Express.Multer.File[]) || [];
      if (!files.length) {
        res.status(400).json({ success: false, message: "No images provided" });
        return;
      }

      const existingCountRows: any[] = await prisma.$queryRawUnsafe(
        `SELECT COUNT(*) AS c FROM home_wallpapers WHERE user_id = ?`,
        userId
      );
      const existingCount = Number(existingCountRows[0]?.c ?? 0);
      if (existingCount + files.length > MAX_WALLPAPERS_PER_USER) {
        res.status(400).json({
          success: false,
          message: `You can keep at most ${MAX_WALLPAPERS_PER_USER} custom wallpapers (${existingCount} already saved).`,
        });
        return;
      }

      const uploadResult = await remoteUploadService.uploadFiles(files, "home-wallpapers");
      if (!uploadResult.success || !uploadResult.files) {
        res.status(502).json({ success: false, message: uploadResult.error || "Upload failed" });
        return;
      }

      const created: any[] = [];
      for (let i = 0; i < uploadResult.files.length; i++) {
        const f = uploadResult.files[i];
        const id = randomUUID();
        await prisma.$executeRawUnsafe(
          `INSERT INTO home_wallpapers (id, user_id, url, label, sort_order) VALUES (?, ?, ?, ?, ?)`,
          id,
          userId,
          f.url,
          (f.originalname || "").slice(0, 120) || null,
          existingCount + i
        );
        created.push({ id, url: f.url, label: f.originalname || null, sortOrder: existingCount + i });
      }

      res.status(201).json({ success: true, message: "Wallpaper(s) uploaded successfully", data: created });
    } catch (error: any) {
      console.error("Error uploading home wallpaper:", error);
      res.status(500).json({ success: false, message: error.message || "Internal server error" });
    }
  },

  // Only removes the DB row: RemoteUploadService.deleteFile() is explicitly not implemented
  // server-side yet ("Delete file not yet implemented for remote server") — the underlying
  // upload is orphaned on the remote host, same limitation every other feature using this
  // upload service already has. Not attempting the call avoids it just throwing.
  async remove(req: AuthRequest, res: Response) {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const rows: any[] = await prisma.$queryRawUnsafe(
        `SELECT id FROM home_wallpapers WHERE id = ? AND user_id = ?`,
        id,
        userId
      );
      if (!rows.length) {
        res.status(404).json({ success: false, message: "Wallpaper not found" });
        return;
      }
      await prisma.$executeRawUnsafe(`DELETE FROM home_wallpapers WHERE id = ?`, id);
      res.status(200).json({ success: true, message: "Wallpaper removed" });
    } catch (error: any) {
      console.error("Error deleting home wallpaper:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  }
};
