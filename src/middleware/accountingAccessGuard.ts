// @ts-nocheck
/**
 * One guard in front of every Accounting and Cashbook router (mounted in app.ts before them): the caller must be signed
 * in, must be internal staff (not an LP, investee or applicant portal account), and must hold the permission the route's
 * rule names in `config/accountingAccess.ts` — read keys for GET, write keys otherwise. Routers keep their own checks on
 * top (period locks, maker-checker in the posting service), so this only ever narrows access.
 */
import { authenticate } from "./authenticate";
import { isExternalPortalUser } from "../utils/portalAuth";
import { userHasEffectivePermission } from "../config/cfoModulePermissions";
import { ACCOUNTING_EXEMPT, ACCOUNTING_RULES, ACCOUNTING_DEFAULT } from "../config/accountingAccess";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function accountingRuleFor(path: string) {
  for (const [re, rule] of ACCOUNTING_RULES) if (re.test(path)) return rule;
  return ACCOUNTING_DEFAULT;
}

/** The keys a request needs (null = exempt: the router's own checks apply). */
export function accountingKeysFor(method: string, path: string): string[] | null {
  if (ACCOUNTING_EXEMPT.some((re) => re.test(path))) return null;
  const rule = accountingRuleFor(path);
  if (rule.any) return rule.any;
  return READ_METHODS.has(method.toUpperCase()) ? rule.read || ACCOUNTING_DEFAULT.read : rule.write || ACCOUNTING_DEFAULT.write;
}

export function accountingAccessGuard(req: any, res: any, next: any) {
  if (req.method === "OPTIONS") return next();
  const path = (req.originalUrl || req.url || "").split("?")[0];
  const keys = accountingKeysFor(req.method, path);
  if (keys === null) return next();
  authenticate(req, res, () => {
    const user = req.user;
    if (!user) return res.status(401).json({ success: false, message: "Unauthorized" });
    if (isExternalPortalUser(user)) return res.status(403).json({ success: false, message: "Accounting is not available to portal accounts." });
    if (!keys.some((k) => userHasEffectivePermission(user, k))) {
      return res.status(403).json({ success: false, message: "Your role does not include this part of Accounting.", code: "ACCOUNTING_FORBIDDEN" });
    }
    next();
  });
}
