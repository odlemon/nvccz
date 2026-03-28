// @ts-nocheck
import { Response } from "express";
import { AuthRequest } from "../middleware/authenticate";
import { ResponseHelper } from "../utils/responseHelper";
import { SavedFilterFavoriteService } from "../services/SavedFilterFavoriteService";

export class SavedFilterFavoriteController {
  /** GET /api/users/me/saved-filter-favorites?routeKey=optional */
  static async list(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return ResponseHelper.unauthorized(res);
      }
      const routeKey = req.query.routeKey as string | undefined;
      const data = await SavedFilterFavoriteService.listForUser(userId, routeKey);
      return ResponseHelper.success(res, "Saved filter favorites retrieved", data);
    } catch (error: any) {
      console.error("SavedFilterFavoriteController.list:", error);
      return ResponseHelper.error(res, error?.message || "Failed to list favorites", undefined, 500);
    }
  }

  /** GET /api/users/me/saved-filter-favorites/:presetId */
  static async getById(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return ResponseHelper.unauthorized(res);
      }
      const row = await SavedFilterFavoriteService.getByIdForUser(userId, req.params.presetId);
      if (!row) {
        return ResponseHelper.notFound(res, "Saved filter favorite not found");
      }
      return ResponseHelper.success(res, "Saved filter favorite retrieved", row);
    } catch (error: any) {
      console.error("SavedFilterFavoriteController.getById:", error);
      return ResponseHelper.error(res, error?.message || "Failed to get favorite", undefined, 500);
    }
  }

  /** POST /api/users/me/saved-filter-favorites */
  static async create(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return ResponseHelper.unauthorized(res);
      }
      const { name, routeKey, filters, sortOrder } = req.body ?? {};
      const row = await SavedFilterFavoriteService.createForUser(userId, {
        name,
        routeKey,
        filters,
        sortOrder,
      });
      return ResponseHelper.created(res, "Saved filter favorite created", row);
    } catch (error: any) {
      const msg = error?.message || "Failed to create favorite";
      if (msg.includes("already") || msg.includes("Maximum")) {
        return ResponseHelper.badRequest(res, msg);
      }
      console.error("SavedFilterFavoriteController.create:", error);
      return ResponseHelper.error(res, msg, undefined, 500);
    }
  }

  /** PATCH /api/users/me/saved-filter-favorites/:presetId */
  static async update(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return ResponseHelper.unauthorized(res);
      }
      const { name, routeKey, filters, sortOrder } = req.body ?? {};
      const row = await SavedFilterFavoriteService.updateForUser(userId, req.params.presetId, {
        name,
        routeKey,
        filters,
        sortOrder,
      });
      return ResponseHelper.success(res, "Saved filter favorite updated", row);
    } catch (error: any) {
      const msg = error?.message || "Failed to update favorite";
      if (msg.includes("not found")) {
        return ResponseHelper.notFound(res, msg);
      }
      if (msg.includes("No fields") || msg.includes("already")) {
        return ResponseHelper.badRequest(res, msg);
      }
      console.error("SavedFilterFavoriteController.update:", error);
      return ResponseHelper.error(res, msg, undefined, 500);
    }
  }

  /** DELETE /api/users/me/saved-filter-favorites/:presetId */
  static async remove(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return ResponseHelper.unauthorized(res);
      }
      await SavedFilterFavoriteService.deleteForUser(userId, req.params.presetId);
      return ResponseHelper.success(res, "Saved filter favorite deleted", { deleted: true });
    } catch (error: any) {
      const msg = error?.message || "Failed to delete favorite";
      if (msg.includes("not found")) {
        return ResponseHelper.notFound(res, msg);
      }
      console.error("SavedFilterFavoriteController.remove:", error);
      return ResponseHelper.error(res, msg, undefined, 500);
    }
  }
}
