/**
 * HTTP smoke test for /api/users/me/saved-filter-favorites
 * Run: npx ts-node scripts/test-saved-filter-favorites-http.ts
 *
 * Uses admin@nts.com / admin123 and BASE_URL (default http://localhost:3009)
 */
import "dotenv/config";

const BASE = process.env.API_BASE_URL || `http://127.0.0.1:${process.env.PORT || "3009"}`;
const EMAIL = process.env.TEST_ADMIN_EMAIL || "admin@nts.com";
const PASSWORD = process.env.TEST_ADMIN_PASSWORD || "admin123";

async function req(
  method: string,
  path: string,
  opts: { token?: string; body?: object } = {}
): Promise<{ status: number; json: any; text: string }> {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (opts.token) {
    headers.Authorization = `Bearer ${opts.token}`;
  }
  const r = await fetch(url, {
    method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await r.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _raw: text };
  }
  return { status: r.status, json, text };
}

function fail(msg: string) {
  console.error("FAIL:", msg);
  process.exit(1);
}

async function main() {
  console.log("BASE:", BASE);
  console.log("Login as", EMAIL);

  const login = await req("POST", "/api/auth/login", {
    body: { email: EMAIL, password: PASSWORD },
  });
  if (login.status !== 200 || !login.json?.token) {
    fail(`Login expected 200 + token, got ${login.status} ${login.text.slice(0, 500)}`);
  }
  const token = login.json.token as string;
  console.log("OK login, user id:", login.json.user?.id);

  const list0 = await req("GET", "/api/users/me/saved-filter-favorites", { token });
  if (list0.status !== 200 || !Array.isArray(list0.json?.data)) {
    fail(`GET list expected 200 + data array, got ${list0.status} ${JSON.stringify(list0.json).slice(0, 400)}`);
  }
  console.log("OK GET list (count)", list0.json.data.length);

  const listScoped = await req(
    "GET",
    "/api/users/me/saved-filter-favorites?routeKey=sales-invoices-test",
    { token }
  );
  if (listScoped.status !== 200 || !Array.isArray(listScoped.json?.data)) {
    fail(`GET list routeKey failed ${listScoped.status}`);
  }
  console.log("OK GET list ?routeKey= (count)", listScoped.json.data.length);

  const name = `HTTP Test Favorite ${Date.now()}`;
  const createBody = {
    name,
    routeKey: "sales-invoices-test",
    filters: { region: "Western", status: "SENT" },
    sortOrder: 1,
  };
  const created = await req("POST", "/api/users/me/saved-filter-favorites", {
    token,
    body: createBody,
  });
  if (created.status !== 201 || !created.json?.data?.id) {
    fail(`POST create expected 201 + data.id, got ${created.status} ${JSON.stringify(created.json).slice(0, 500)}`);
  }
  const presetId = created.json.data.id as string;
  console.log("OK POST create id:", presetId);

  const getOne = await req("GET", `/api/users/me/saved-filter-favorites/${presetId}`, { token });
  if (getOne.status !== 200 || getOne.json?.data?.name !== name) {
    fail(`GET by id failed ${getOne.status} ${JSON.stringify(getOne.json).slice(0, 400)}`);
  }
  console.log("OK GET by id");

  const patched = await req("PATCH", `/api/users/me/saved-filter-favorites/${presetId}`, {
    token,
    body: { name: `${name} (updated)`, filters: { region: "Western", status: "PAID" } },
  });
  if (patched.status !== 200 || patched.json?.data?.name !== `${name} (updated)`) {
    fail(`PATCH failed ${patched.status} ${JSON.stringify(patched.json).slice(0, 400)}`);
  }
  console.log("OK PATCH");

  const del = await req("DELETE", `/api/users/me/saved-filter-favorites/${presetId}`, { token });
  if (del.status !== 200) {
    fail(`DELETE failed ${del.status} ${JSON.stringify(del.json)}`);
  }
  console.log("OK DELETE");

  const gone = await req("GET", `/api/users/me/saved-filter-favorites/${presetId}`, { token });
  if (gone.status !== 404) {
    fail(`Expected 404 after delete, got ${gone.status}`);
  }
  console.log("OK GET after delete -> 404");

  console.log("\nAll saved-filter-favorites endpoint checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
