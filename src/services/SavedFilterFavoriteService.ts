import { Prisma } from "@prisma/client";
import { prisma } from "../utils/database";

const MAX_PRESETS_PER_USER = 200;
const NAME_MAX = 255;
const ROUTE_KEY_MAX = 191;

export type CreateSavedFilterFavoriteInput = {
  name: string;
  routeKey: string;
  filters: Prisma.InputJsonValue;
  sortOrder?: number;
};

export type UpdateSavedFilterFavoriteInput = {
  name?: string;
  routeKey?: string;
  filters?: Prisma.InputJsonValue;
  sortOrder?: number;
};

function trimName(name: string): string {
  return String(name ?? "").trim();
}

function trimRouteKey(key: string): string {
  return String(key ?? "").trim();
}

export class SavedFilterFavoriteService {
  static async listForUser(userId: string, routeKey?: string) {
    const where: Prisma.SavedFilterFavoriteWhereInput = { userId };
    const rk = routeKey != null ? trimRouteKey(routeKey) : "";
    if (rk) {
      where.routeKey = rk;
    }
    return prisma.savedFilterFavorite.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
  }

  static async getByIdForUser(userId: string, id: string) {
    return prisma.savedFilterFavorite.findFirst({
      where: { id, userId },
    });
  }

  static async createForUser(userId: string, input: CreateSavedFilterFavoriteInput) {
    const name = trimName(input.name);
    const routeKey = trimRouteKey(input.routeKey);

    if (!name || name.length > NAME_MAX) {
      throw new Error(`name is required and must be at most ${NAME_MAX} characters`);
    }
    if (!routeKey || routeKey.length > ROUTE_KEY_MAX) {
      throw new Error(`routeKey is required and must be at most ${ROUTE_KEY_MAX} characters`);
    }
    if (input.filters === undefined || input.filters === null) {
      throw new Error("filters is required (JSON object or value your UI can replay)");
    }

    const count = await prisma.savedFilterFavorite.count({ where: { userId } });
    if (count >= MAX_PRESETS_PER_USER) {
      throw new Error(`Maximum of ${MAX_PRESETS_PER_USER} saved filter favorites per user`);
    }

    try {
      return await prisma.savedFilterFavorite.create({
        data: {
          userId,
          name,
          routeKey,
          filters: input.filters as Prisma.InputJsonValue,
          sortOrder: input.sortOrder ?? 0,
        },
      });
    } catch (e: any) {
      if (e?.code === "P2002") {
        throw new Error(`You already have a favorite named "${name}". Choose a different name.`);
      }
      throw e;
    }
  }

  static async updateForUser(userId: string, id: string, input: UpdateSavedFilterFavoriteInput) {
    const existing = await this.getByIdForUser(userId, id);
    if (!existing) {
      throw new Error("Saved filter favorite not found");
    }

    const data: Prisma.SavedFilterFavoriteUpdateInput = {};

    if (input.name !== undefined) {
      const name = trimName(input.name);
      if (!name || name.length > NAME_MAX) {
        throw new Error(`name must be non-empty and at most ${NAME_MAX} characters`);
      }
      data.name = name;
    }
    if (input.routeKey !== undefined) {
      const routeKey = trimRouteKey(input.routeKey);
      if (!routeKey || routeKey.length > ROUTE_KEY_MAX) {
        throw new Error(`routeKey must be non-empty and at most ${ROUTE_KEY_MAX} characters`);
      }
      data.routeKey = routeKey;
    }
    if (input.filters !== undefined) {
      if (input.filters === null) {
        throw new Error("filters cannot be null");
      }
      data.filters = input.filters as Prisma.InputJsonValue;
    }
    if (input.sortOrder !== undefined) {
      data.sortOrder = input.sortOrder;
    }

    if (Object.keys(data).length === 0) {
      throw new Error("No fields to update");
    }

    try {
      return await prisma.savedFilterFavorite.update({
        where: { id },
        data,
      });
    } catch (e: any) {
      if (e?.code === "P2002") {
        throw new Error("That name is already used by another favorite");
      }
      throw e;
    }
  }

  static async deleteForUser(userId: string, id: string) {
    const existing = await this.getByIdForUser(userId, id);
    if (!existing) {
      throw new Error("Saved filter favorite not found");
    }
    await prisma.savedFilterFavorite.delete({ where: { id } });
    return { deleted: true };
  }
}
