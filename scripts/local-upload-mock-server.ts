/**
 * Minimal local upload microservice for dev/UAT when remote :3050 is unreachable.
 * Run: npx ts-node --transpile-only scripts/local-upload-mock-server.ts
 */
import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";

const PORT = Number(process.env.LOCAL_UPLOAD_PORT || 3050);
const ROOT = path.join(__dirname, "..", "storage", "local-upload-mock");

if (!fs.existsSync(ROOT)) fs.mkdirSync(ROOT, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const type = String(req.body?.type || "temp").replace(/[^a-zA-Z0-9._-]/g, "_");
    const dir = path.join(ROOT, type);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "") || ".bin";
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});

const upload = multer({ storage, limits: { fileSize: 150 * 1024 * 1024 } });

const app = express();
app.use("/uploads", express.static(ROOT));

app.post("/upload", upload.array("images", 20), (req, res) => {
  const files = (req.files as Express.Multer.File[]) || [];
  const type = String(req.body?.type || "temp");
  const base = `http://127.0.0.1:${PORT}/uploads`;
  res.json({
    success: true,
    files: files.map((f) => ({
      url: `${base}/${type}/${f.filename}`,
      filename: f.filename,
      originalname: f.originalname,
      size: f.size,
      mimetype: f.mimetype
    }))
  });
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Local upload mock listening on http://127.0.0.1:${PORT}/upload`);
  console.log(`Files stored under ${ROOT}`);
});
