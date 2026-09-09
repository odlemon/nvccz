/**
 * Performance module settings.
 *
 * A namespaced key/value store over `performance_settings`. See
 * `scripts/run-performance-settings-migration.ts` for why it is keyed rather than a wide
 * table: there is no written specification for these settings yet, and freezing one reading
 * of a mock form into 25 columns would be worse than keeping the schema stable.
 *
 * Two rules the callers depend on:
 *
 *   1. **An unset key is absent, not defaulted.** `getAll()` returns only what has actually
 *      been saved. A caller that wants a default must apply it knowingly; this layer never
 *      invents one, because a default rendered as a stored choice is indistinguishable from
 *      a real decision.
 *   2. **Writes are atomic across the batch.** The settings form saves many keys at once, and
 *      a half-applied save would leave a configuration nobody chose. `updateMany` runs in a
 *      single transaction.
 */
import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Namespaces the settings page writes into. Enforced so a typo cannot silently create an
 * orphan key that nothing ever reads back.
 */
export const SETTING_NAMESPACES = [
  "general", // organisation name, timezone, date format, objective cascade
  "workflow", // performance cycle, KPI/review approval levels, self-appraisal, KPI lock
  "notifications", // review reminders, approval alerts, KPI threshold alerts, announcements, summaries
  "calendar", // financial-year start, review window, calibration, results publish
  "security", // audit trail, data versioning, manual overrides, privileged access reviews
  "rbac", // role policy checkpoint, previously localStorage-only
  "ratingScales", // rating scale definitions
] as const;

export type SettingNamespace = (typeof SETTING_NAMESPACES)[number];

/** `general.organisationName` -> namespace `general`. */
const KEY_PATTERN = /^([a-zA-Z][a-zA-Z0-9]*)\.([a-zA-Z0-9][a-zA-Z0-9._-]{0,120})$/;

export interface SettingEntry {
  key: string;
  value: unknown;
}

export class SettingsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettingsValidationError";
  }
}

function assertValidKey(key: string): void {
  const match = KEY_PATTERN.exec(key);
  if (!match) {
    throw new SettingsValidationError(
      `Invalid setting key "${key}". Expected "<namespace>.<name>", e.g. "general.timezone".`
    );
  }
  if (!SETTING_NAMESPACES.includes(match[1] as SettingNamespace)) {
    throw new SettingsValidationError(
      `Unknown settings namespace "${match[1]}". Known: ${SETTING_NAMESPACES.join(", ")}.`
    );
  }
}

export class PerformanceSettingsService {
  /**
   * Every stored setting, as a flat `{ key: value }` map plus per-key provenance.
   *
   * Provenance matters on a governance screen: "who last changed the approval workflow, and
   * when" is exactly the question a settings page is asked in an audit.
   */
  static async getAll(): Promise<{
    settings: Record<string, unknown>;
    meta: Record<string, { updatedAt: Date; updatedBy: string | null }>;
  }> {
    const rows = await prisma.performanceSetting.findMany({
      orderBy: { settingKey: "asc" },
      include: { updatedBy: { select: { id: true, firstName: true, lastName: true, email: true } } },
    });

    const settings: Record<string, unknown> = {};
    const meta: Record<string, { updatedAt: Date; updatedBy: string | null }> = {};

    for (const row of rows) {
      settings[row.settingKey] = row.value ?? null;
      const u = row.updatedBy;
      meta[row.settingKey] = {
        updatedAt: row.updatedAt,
        updatedBy: u ? [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email : null,
      };
    }

    return { settings, meta };
  }

  /** One setting, or `undefined` when it has never been saved. Never a default. */
  static async get(key: string): Promise<unknown | undefined> {
    assertValidKey(key);
    const row = await prisma.performanceSetting.findUnique({ where: { settingKey: key } });
    return row ? (row.value ?? null) : undefined;
  }

  /**
   * Upsert a batch of settings in one transaction.
   *
   * Returns the full settings map afterwards so the caller can render from what was actually
   * persisted rather than from what it hoped it sent — the same reason the frontend re-reads
   * after every write.
   */
  static async updateMany(entries: SettingEntry[], userId: string | null) {
    if (!Array.isArray(entries) || entries.length === 0) {
      throw new SettingsValidationError("No settings supplied.");
    }
    if (entries.length > 200) {
      throw new SettingsValidationError("Too many settings in one request (max 200).");
    }

    const seen = new Set<string>();
    for (const entry of entries) {
      if (!entry || typeof entry.key !== "string") {
        throw new SettingsValidationError("Each setting needs a string `key`.");
      }
      assertValidKey(entry.key);
      if (seen.has(entry.key)) {
        throw new SettingsValidationError(`Duplicate key "${entry.key}" in one request.`);
      }
      seen.add(entry.key);
    }

    await prisma.$transaction(
      entries.map((entry) =>
        prisma.performanceSetting.upsert({
          where: { settingKey: entry.key },
          create: {
            settingKey: entry.key,
            value: (entry.value ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            updatedById: userId,
          },
          update: {
            value: (entry.value ?? Prisma.JsonNull) as Prisma.InputJsonValue,
            updatedById: userId,
          },
        })
      )
    );

    return this.getAll();
  }

  /** Remove a setting entirely, returning it to "never chosen" rather than to a default. */
  static async remove(key: string): Promise<boolean> {
    assertValidKey(key);
    const existing = await prisma.performanceSetting.findUnique({ where: { settingKey: key } });
    if (!existing) return false;
    await prisma.performanceSetting.delete({ where: { settingKey: key } });
    return true;
  }
}

export default PerformanceSettingsService;
