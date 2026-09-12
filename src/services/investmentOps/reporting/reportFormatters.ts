export function num(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function fmtMoney(n: number | null | undefined, currency = "USD"): string {
  const v = n == null || Number.isNaN(n) ? 0 : n;
  return `${currency} ${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtPct(n: number | null | undefined): string {
  const v = n == null || Number.isNaN(n) ? 0 : n;
  return `${v.toFixed(2)}%`;
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return new Date().toISOString().slice(0, 10);
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return new Date().toISOString().slice(0, 10);
  return dt.toISOString().slice(0, 10);
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return new Date().toISOString();
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return new Date().toISOString();
  return dt.toISOString();
}

export function userDisplayName(user: any): string {
  if (!user) return "Investment Operations";
  const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  return name || user.email || "Investment Operations";
}

export const DASH = "—";
