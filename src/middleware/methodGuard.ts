/**
 * Permission guard keyed off HTTP method — GET/HEAD get the `view` set, everything else
 * (POST/PUT/PATCH/DELETE) gets the `manage` set.
 *
 * Built for the Performance module's second guarding pass: `requireAnyPermission` on every
 * route works, but writing one call per route across ~19 route files (118 write endpoints)
 * makes every route file's route list untouched — this is applied once, router-wide, right
 * after `authenticate`, so a route added later inherits the guard automatically instead of
 * shipping unguarded by omission (the exact way these files ended up unguarded the first
 * time).
 *
 * `viewKeys` should include the matching `manageKeys` too (a manager who can write can also
 * read) — call sites pass `[...viewKeys, ...manageKeys]` for reads.
 */
import { Response, NextFunction } from "express";
import { AuthRequest } from "./authenticate";
import { requireAnyPermission } from "./permissionAuth";

const READ_METHODS = new Set(["GET", "HEAD"]);

export function methodGuard(viewOrManageKeys: string[], manageKeys: string[]) {
  const readGuard = requireAnyPermission(viewOrManageKeys);
  const writeGuard = requireAnyPermission(manageKeys);
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const guard = READ_METHODS.has(req.method) ? readGuard : writeGuard;
    guard(req, res, next);
  };
}
