/** Structured timing logs for listed-equity market data ingest (watch server console). */

function ts(): string {
  return new Date().toISOString();
}

export function ingestLog(phase: string, detail?: string | Record<string, unknown>) {
  const suffix =
    detail == null
      ? ""
      : typeof detail === "string"
        ? ` — ${detail}`
        : ` — ${JSON.stringify(detail)}`;
  console.log(`[listed-equity-ingest ${ts()}] ${phase}${suffix}`);
}

export async function ingestTimed<T>(
  phase: string,
  fn: () => Promise<T>,
  detail?: Record<string, unknown>
): Promise<T> {
  const start = Date.now();
  ingestLog(`${phase} start`, detail);
  try {
    const result = await fn();
    ingestLog(`${phase} done`, { ...detail, ms: Date.now() - start });
    return result;
  } catch (e: any) {
    ingestLog(`${phase} failed`, { ...detail, ms: Date.now() - start, error: e?.message || String(e) });
    throw e;
  }
}
