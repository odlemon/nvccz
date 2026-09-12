/**
 * The message an API response may show a user for a caught error.
 *
 * Domain errors thrown on purpose ("Only department HEAD or DEPUTY can approve requisitions") are
 * meant to be read and pass through. Database, ORM and runtime failures are not: a Prisma message
 * such as "Invalid `prisma.procurementInvoice.count()` invocation: Can't reach database server at
 * 127.0.0.1:3306" names the infrastructure and tells the user nothing they can act on. Those are
 * logged by the caller and replaced with the fallback.
 */
const INTERNAL = /prisma|invocation|database server|ECONNREFUSED|ETIMEDOUT|ECONNRESET|connection pool|Unknown arg|Argument `|is not a function|Cannot read propert|undefined is not|stack/i

export function isInternalError(error: unknown): boolean {
  const e = error as { name?: string; message?: string; code?: string } | null
  if (!e) return false
  if (typeof e.name === "string" && e.name.startsWith("PrismaClient")) return true
  if (typeof e.code === "string" && /^P\d{4}$/.test(e.code)) return true
  return INTERNAL.test(String(e.message ?? ""))
}

export function publicErrorMessage(error: unknown, fallback: string): string {
  const message = (error as { message?: string } | null)?.message
  if (!message || isInternalError(error)) return fallback
  return message
}
