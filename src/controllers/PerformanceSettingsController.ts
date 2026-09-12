/**
 * Performance module settings.
 *
 * Envelope matches the rest of the module: `{ success, message?, data, timestamp }` on
 * success, `{ success: false, message }` on failure.
 */
import { Response } from "express";
import { AuthRequest } from "../middleware/authenticate";
import PerformanceSettingsService, {
  SettingsValidationError,
  SETTING_NAMESPACES,
} from "../services/PerformanceSettingsService";

function fail(res: Response, status: number, message: string) {
  res.status(status).json({ success: false, message });
}

export class PerformanceSettingsController {
  /** GET /api/performance/settings */
  static async getAll(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { settings, meta } = await PerformanceSettingsService.getAll();
      res.json({
        success: true,
        message: "Performance settings retrieved successfully",
        data: {
          settings,
          meta,
          // Told to the client explicitly so a settings screen can distinguish "no value
          // saved" from "namespace does not exist", rather than guessing from an empty map.
          namespaces: SETTING_NAMESPACES,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("[performance-settings] getAll failed:", error?.message || error);
      fail(res, 500, "Failed to retrieve performance settings");
    }
  }

  /**
   * PUT /api/performance/settings
   *
   * Body: `{ settings: { "general.timezone": "…", … } }`
   *   or  `{ entries: [{ key, value }, …] }`
   *
   * Both forms are accepted because the object form is what a form serialiser naturally
   * produces, while the array form preserves ordering and allows an explicit null.
   */
  static async update(req: AuthRequest, res: Response): Promise<void> {
    try {
      const body = req.body || {};
      let entries: Array<{ key: string; value: unknown }>;

      if (Array.isArray(body.entries)) {
        entries = body.entries;
      } else if (body.settings && typeof body.settings === "object" && !Array.isArray(body.settings)) {
        entries = Object.entries(body.settings).map(([key, value]) => ({ key, value }));
      } else {
        fail(res, 400, "Body must contain `settings` (object) or `entries` (array of {key,value}).");
        return;
      }

      const result = await PerformanceSettingsService.updateMany(entries, req.user?.id ?? null);
      res.json({
        success: true,
        message: `${entries.length} setting${entries.length === 1 ? "" : "s"} saved`,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      if (error instanceof SettingsValidationError) {
        fail(res, 400, error.message);
        return;
      }
      console.error("[performance-settings] update failed:", error?.message || error);
      fail(res, 500, "Failed to save performance settings");
    }
  }

  /** DELETE /api/performance/settings/:key — returns the setting to "never chosen". */
  static async remove(req: AuthRequest, res: Response): Promise<void> {
    try {
      const removed = await PerformanceSettingsService.remove(String(req.params.key || ""));
      if (!removed) {
        fail(res, 404, "Setting not found");
        return;
      }
      res.json({ success: true, message: "Setting cleared", timestamp: new Date().toISOString() });
    } catch (error: any) {
      if (error instanceof SettingsValidationError) {
        fail(res, 400, error.message);
        return;
      }
      console.error("[performance-settings] remove failed:", error?.message || error);
      fail(res, 500, "Failed to clear the setting");
    }
  }
}

export default PerformanceSettingsController;
