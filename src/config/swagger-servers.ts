/**
 * OpenAPI server list for Swagger UI Try it out.
 */

export function resolveSwaggerServersForRequest(req: {
  get(name: string): string | undefined;
  protocol?: string;
}): Array<{ url: string; description: string }> {
  const port = process.env.PORT || "3009";
  const hostHeader = req.get("x-forwarded-host") || req.get("host") || `localhost:${port}`;
  const proto = (req.get("x-forwarded-proto") || req.protocol || "http").split(",")[0].trim();
  const base = `${proto}://${hostHeader}`.replace(/\/$/, "");
  const currentUrl = base.endsWith("/api") ? base : `${base}/api`;

  const raw = (process.env.SWAGGER_SERVER_URL || process.env.BASE_URL || "").trim().replace(/\/$/, "");
  const configured = raw ? (raw.endsWith("/api") ? raw : `${raw}/api`) : null;
  const localUrl = `http://localhost:${port}/api`;

  const extras: Array<{ url: string; description: string }> = [];
  if (configured && configured !== currentUrl) {
    extras.push({ url: configured, description: "Configured remote API (SWAGGER_SERVER_URL)" });
  }
  if (localUrl !== currentUrl && !extras.some((e) => e.url === localUrl)) {
    extras.push({ url: localUrl, description: "Local development API" });
  }

  return [{ url: currentUrl, description: "This server — use for Try it out" }, ...extras];
}
