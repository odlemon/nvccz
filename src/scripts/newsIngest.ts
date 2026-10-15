import { ingestNewsArticles } from "../services/NewsFeedService";
import { prisma } from "../utils/database";
import { mkdir, readFile, rm, stat, writeFile } from "fs/promises";

const lockPath = "/tmp/arcus-news-ingest.lockdir";

async function acquireLock() {
  try {
    await mkdir(lockPath, { mode: 0o700 });
    await writeFile(`${lockPath}/pid`, String(process.pid), { flag: "wx", mode: 0o600 });
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    try {
      const [pidText, lockStat] = await Promise.all([readFile(`${lockPath}/pid`, "utf8"), stat(lockPath)]);
      const oldPid = Number(pidText.trim());
      if (Date.now() - lockStat.mtimeMs < 60 * 60 * 1000 && Number.isInteger(oldPid)) {
        try { process.kill(oldPid, 0); return null; } catch (processError) {
          if ((processError as NodeJS.ErrnoException).code !== "ESRCH") return null;
        }
      }
      await rm(lockPath, { recursive: true, force: true });
      await mkdir(lockPath, { mode: 0o700 });
      await writeFile(`${lockPath}/pid`, String(process.pid), { flag: "wx", mode: 0o600 });
      return true;
    } catch {
      return null;
    }
  }
}

async function main() {
  const lock = await acquireLock();
  if (!lock) {
    console.log("[news-ingest] another run is active; skipping this tick");
    await prisma.$disconnect();
    return;
  }
  try {
    const report = await ingestNewsArticles();
    if (report.failedSources.length === report.publishersAttempted) process.exitCode = 1;
  } catch (error) {
    console.error("[news-ingest] job failed", error);
    process.exitCode = 1;
  } finally {
    await rm(lockPath, { recursive: true, force: true });
    await prisma.$disconnect();
  }
}

void main();
