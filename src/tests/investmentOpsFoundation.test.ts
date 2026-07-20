import { Decimal } from "@prisma/client/runtime/library";
import {
  getExpectedVersion,
  getIdempotencyKey,
  investmentOpsContract,
  parseInvestmentListQuery,
  requireInvestmentPermission,
} from "../middleware/investmentOpsFoundation";

function responseMock() {
  const delivered: any[] = [];
  const res: any = {
    locals: {},
    statusCode: 200,
    setHeader: jest.fn(),
    status: jest.fn(function status(code: number) {
      this.statusCode = code;
      return this;
    }),
    json: jest.fn((body) => {
      delivered.push(body);
      return res;
    }),
  };
  return { res, delivered };
}

describe("Investment Ops foundation contract", () => {
  it("parses and caps shared list parameters", () => {
    expect(
      parseInvestmentListQuery({
        page: "2",
        pageSize: "999",
        search: "  bond  ",
        sortBy: "updatedAt",
        sortDirection: "ASC",
        from: "2026-01-01",
        to: "2026-12-31",
      })
    ).toEqual({
      page: 2,
      pageSize: 200,
      skip: 200,
      take: 200,
      search: "bond",
      sortBy: "updatedAt",
      sortDirection: "asc",
      sortDir: "asc",
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-12-31T00:00:00.000Z",
    });
  });

  it("accepts optional Idempotency-Key and mints when absent", () => {
    const req: any = {
      headers: {
        "idempotency-key": "execute-order-123",
        "if-match": 'W/"7"',
      },
      body: { expectedVersion: "7" },
    };
    expect(getIdempotencyKey(req)).toBe("execute-order-123");
    expect(getExpectedVersion(req)).toBe("7");

    const bare: any = { headers: {} };
    const minted = getIdempotencyKey(bare);
    expect(minted.startsWith("auto-")).toBe(true);
    expect(minted.length).toBeGreaterThanOrEqual(8);
  });

  it("adds correlation metadata and serializes decimals as strings", () => {
    const req: any = { headers: { "x-request-id": "client-request-42" } };
    const { res, delivered } = responseMock();
    investmentOpsContract(req, res, jest.fn());

    res.json({
      success: true,
      data: {
        items: [{ amount: new Decimal("123456789012345678.123456") }],
        page: 1,
        pageSize: 50,
        total: 1,
        totalPages: 1,
      },
    });

    expect(res.setHeader).toHaveBeenCalledWith("X-Request-Id", "client-request-42");
    expect(delivered[0].data.items[0].amount).toBe("123456789012345678.123456");
    expect(delivered[0].meta.requestId).toBe("client-request-42");
    expect(delivered[0].meta.pagination.total).toBe(1);
    expect(delivered[0].meta.serverTime).toEqual(expect.any(String));
  });

  it("uses Role.permissions and preserves admin access", () => {
    const permission = requireInvestmentPermission("investments.execute");
    const next = jest.fn();
    const granted = responseMock().res;
    permission(
      {
        user: {
          role: {
            name: "trader",
            permissions: [{ name: "investments.execute", value: true }],
          },
        },
      } as any,
      granted,
      next
    );
    expect(next).toHaveBeenCalledTimes(1);

    const adminNext = jest.fn();
    permission(
      { user: { role: { name: "System Administrator", permissions: [] } } } as any,
      responseMock().res,
      adminNext
    );
    expect(adminNext).toHaveBeenCalledTimes(1);
  });
});
