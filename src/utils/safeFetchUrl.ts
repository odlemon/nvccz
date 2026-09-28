// @ts-nocheck
/**
 * Server-side fetch safety for URLs that an outside party (a supplier, through the portal) can influence.
 *
 * A supplier-supplied "document path" is later downloaded by the server for text extraction. Without a guard that is a
 * server-side request forgery: any http(s) URL, including internal hosts and cloud metadata, would be fetched.
 * The rule: a URL is fetched only if its host is one of the platform's own media hosts, or it resolves to a public address.
 */
import dns from "node:dns/promises";
import net from "node:net";

function hostOf(u?: string | null) {
  try {
    // host = hostname + port, so 127.0.0.1:3050 (the media store) is not 127.0.0.1:3009 (the API).
    return u ? new URL(u).host.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Hosts the platform itself serves media from (configuration, never request data). */
export function trustedMediaHosts(): Set<string> {
  const hosts = new Set<string>();
  for (const v of [
    process.env.REMOTE_MEDIA_BASE_URL,
    process.env.REMOTE_MEDIA_INTERNAL_BASE,
    process.env.REMOTE_UPLOAD_SERVICE_URL,
    process.env.API_INTERNAL_BASE_URL,
    process.env.BASE_URL,
  ]) {
    const h = hostOf(v);
    if (h) hosts.add(h);
  }
  for (const h of String(process.env.ALLOWED_DOCUMENT_HOSTS || "").split(",")) if (h.trim()) hosts.add(h.trim().toLowerCase());
  return hosts;
}

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127)
    );
  }
  if (net.isIPv6(ip)) {
    const s = ip.toLowerCase();
    return s === "::1" || s === "::" || s.startsWith("fc") || s.startsWith("fd") || s.startsWith("fe80") || s.startsWith("::ffff:127.") || s.startsWith("::ffff:10.") || s.startsWith("::ffff:192.168.") || s.startsWith("::ffff:169.254.");
  }
  return true;
}

/** Throws unless the URL is safe for the server to fetch. */
export async function assertSafeFetchUrl(url: string): Promise<void> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error("The document URL is not valid");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Only http(s) document URLs are allowed");
  const host = u.hostname.toLowerCase();
  if (trustedMediaHosts().has(u.host.toLowerCase())) return;
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new Error("The document host could not be resolved");
  if (addrs.some((a: any) => isPrivateAddress(a.address))) {
    throw new Error("The document URL points to a private or internal address and cannot be fetched");
  }
}

/** Paths under which the platform serves uploaded files. */
const MEDIA_PATH = /^\/(api\/)?(public-media|uploads|media)\//i;

/**
 * A supplier's document reference must be a platform media URL or path, never an arbitrary external address, and never an
 * internal API endpoint on the platform's own host (only its media paths).
 */
export function isPlatformMediaReference(ref: string): boolean {
  const v = String(ref || "").trim();
  if (!v) return true;
  if (v.startsWith("//")) return false;
  if (v.startsWith("/")) return MEDIA_PATH.test(v.split("?")[0]);
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return false;
  }
  const h = u.host.toLowerCase();
  if (!trustedMediaHosts().has(h)) return false;
  // The remote media store may serve any path; the platform's own API host only its media paths.
  const remoteHosts = new Set<string>();
  for (const e of [process.env.REMOTE_MEDIA_BASE_URL, process.env.REMOTE_MEDIA_INTERNAL_BASE, process.env.REMOTE_UPLOAD_SERVICE_URL]) {
    const x = hostOf(e);
    if (x) remoteHosts.add(x);
  }
  return remoteHosts.has(h) || MEDIA_PATH.test(u.pathname);
}
