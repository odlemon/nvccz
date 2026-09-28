//@ts-nocheck
/**
 * The organisation's approved branding for an environment: Matanho on dev, NVCCZ on production. The environment says which
 * (`APP_BRAND`), and the logo is the approved file bundled with the API, so a document never depends on a logo address in a
 * database that might belong to another environment.
 */
import fs from "fs";
import path from "path";

export type BrandKey = "matanho" | "nvccz";

const NAMES: Record<BrandKey, string> = { matanho: "Matanho", nvccz: "NVCCZ" };

export function brandKey(): BrandKey {
  // 1. Stated outright. 2. The public address this environment is served from (dev.matanho.com is Matanho; an nvccz address is
  // NVCCZ). 3. Only then the mode: production is NVCCZ, anything else Matanho.
  const explicit = String(process.env.APP_BRAND || "").trim().toLowerCase();
  if (explicit === "matanho" || explicit === "nvccz") return explicit;
  const addresses = [process.env.FRONTEND_URL, process.env.APP_BASE_URL, process.env.API_PUBLIC_BASE_URL, process.env.BASE_URL].map((v) => String(v || "").toLowerCase());
  if (addresses.some((a) => a.includes("matanho"))) return "matanho";
  if (addresses.some((a) => a.includes("nvccz"))) return "nvccz";
  return String(process.env.NODE_ENV || "").toLowerCase() === "production" ? "nvccz" : "matanho";
}

export function brandName(): string {
  return NAMES[brandKey()];
}

const cache = new Map<BrandKey, Buffer | null>();

export function brandLogoBuffer(): Buffer | null {
  const key = brandKey();
  if (cache.has(key)) return cache.get(key) ?? null;
  const candidates = [
    path.join(process.cwd(), "assets", "brands", `${key}.png`),
    path.join(__dirname, "..", "..", "..", "assets", "brands", `${key}.png`),
  ];
  for (const file of candidates) {
    try {
      const buf = fs.readFileSync(file);
      cache.set(key, buf);
      return buf;
    } catch {
      /* try the next place */
    }
  }
  cache.set(key, null);
  return null;
}

/** For the screens: which brand this environment is, so a preview can show exactly what the document will carry. */
export function brandInfo() {
  const key = brandKey();
  return { key, name: NAMES[key], hasLogo: !!brandLogoBuffer() };
}
