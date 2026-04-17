// @ts-nocheck
/**
 * Dev / opt-in smoke test for RemoteUploadService + public URL shaping.
 * Do not enable ALLOW_PUBLIC_MEDIA_TEST_UPLOAD on public internet without extra auth.
 */
import { Router } from "express";
import multer from "multer";
import { remoteUploadService } from "../services/RemoteUploadService";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const router = Router();

router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file?.buffer?.length) {
      return res.status(400).json({
        success: false,
        message: "multipart file required (field name: file)",
      });
    }

    const r = await remoteUploadService.uploadSingleFile(req.file, "temp");
    return res.json({
      success: true,
      data: {
        publicUrl: r.downloadURL,
        filePath: r.filePath,
        hint: "Open publicUrl in a browser; on HTTPS it must start with https: (uses FRONTEND_URL → …/api/public-media/…).",
      },
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e?.message || "Upload failed" });
  }
});

export default router;
