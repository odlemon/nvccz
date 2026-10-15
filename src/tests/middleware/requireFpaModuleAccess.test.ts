import { requireFpaModuleAccess } from "../../middleware/permissionAuth";

function runGuard(user: any) {
  const req: any = { user };
  const res: any = {
    statusCode: 200,
    body: undefined,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  };
  const next = jest.fn();
  requireFpaModuleAccess()(req, res, next);
  return { res, next };
}

describe("requireFpaModuleAccess", () => {
  it.each(["CEO", "CFO", "FIN_MGR", "FIN_OFF", "ACCOUNTANT", "SYSADMIN"])(
    "allows configured FP&A role %s",
    (roleCode) => {
      const { res, next } = runGuard({ id: "local-test", roleCode });
      expect(res.statusCode).toBe(200);
      expect(next).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["INV_ANALYST", "PORTFOLIO_MGR", "PROC_OFF", "EMPLOYEE"])(
    "denies role without FP&A access: %s",
    (roleCode) => {
      const { res, next } = runGuard({ id: "local-test", roleCode });
      expect(res.statusCode).toBe(403);
      expect(next).not.toHaveBeenCalled();
    },
  );

  it("requires authentication", () => {
    const { res, next } = runGuard(undefined);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});
