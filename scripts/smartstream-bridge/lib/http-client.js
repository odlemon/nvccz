// @ts-nocheck
/**
 * Same bare http/https request pattern already used by
 * scripts/test-complete-po-grn-payment-flow.js — kept dependency-free
 * on purpose so this tool runs with nothing but `node`.
 */
const http = require("http");
const https = require("https");

function request({ baseUrl, path, method = "GET", token, body }) {
  return new Promise((resolve, reject) => {
    const url = new URL(path.startsWith("http") ? path : `${baseUrl}${path}`);
    const protocol = url.protocol === "https:" ? https : http;
    const payload = body ? JSON.stringify(body) : null;

    const req = protocol.request(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname + url.search,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          let parsed;
          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch (e) {
            parsed = { raw };
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function login(baseUrl, email, password) {
  const res = await request({
    baseUrl,
    path: "/api/auth/login",
    method: "POST",
    body: { email, password },
  });
  const token = res.body?.data?.token || res.body?.token;
  if (!token) {
    throw new Error(
      `Login failed for ${email} (HTTP ${res.status}): ${JSON.stringify(res.body)}`
    );
  }
  return token;
}

module.exports = { request, login };
