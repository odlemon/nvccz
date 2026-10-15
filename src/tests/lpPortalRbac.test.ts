// @ts-nocheck
import { describe, it, expect } from "@jest/globals";
import { LpPortalAccessService } from "../services/lpPortal/LpPortalAccessService";

describe("LpPortalAccessService.fundAllowed", () => {
  it("allows all funds when fundScope is null", () => {
    const ctx = { clientId: "c1", lpRole: "VIEWER", membershipId: null, fundScope: null, isStaff: false };
    expect(LpPortalAccessService.fundAllowed(ctx, "fund-a")).toBe(true);
  });

  it("restricts to fundScope when set", () => {
    const ctx = {
      clientId: "c1",
      lpRole: "VIEWER",
      membershipId: "m1",
      fundScope: ["fund-a"],
      isStaff: false,
    };
    expect(LpPortalAccessService.fundAllowed(ctx, "fund-a")).toBe(true);
    expect(LpPortalAccessService.fundAllowed(ctx, "fund-b")).toBe(false);
  });
});
