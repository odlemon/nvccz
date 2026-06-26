jest.mock("../utils/database", () => ({
  prisma: {
    forecastScenario: {
      findUnique: jest.fn(),
      update: jest.fn()
    },
    forecastAuditLog: {
      create: jest.fn()
    },
    user: {
      findUnique: jest.fn()
    }
  }
}));

import { prisma } from "../utils/database";
import { ForecastingAccessService } from "../services/ForecastingAccessService";
import { ForecastingError } from "../services/ForecastingError";

const mockFind = prisma.forecastScenario.findUnique as jest.Mock;

describe("ForecastingAccessService admin and lock", () => {
  test("isAdminViewer admin role is treated as forecasting admin", () => {
    expect(
      ForecastingAccessService.isAdminUser({ role: { name: "admin" }, roleCode: null })
    ).toBe(true);
    expect(ForecastingAccessService.canLockScenario({ role: { name: "Admin" } })).toBe(true);
  });

  test("CFO roleCode is treated as forecasting admin", () => {
    expect(
      ForecastingAccessService.isAdminUser({
        role: { name: "Chief Financial Officer" },
        roleCode: "CFO",
      })
    ).toBe(true);
    expect(() =>
      ForecastingAccessService.assertLockRole({
        role: { name: "Chief Financial Officer" },
        roleCode: "CFO",
      })
    ).not.toThrow();
  });

  test("CFO by role name only is treated as forecasting admin", () => {
    const cfoByName = { role: { name: "Chief Financial Officer" }, roleCode: null };
    expect(ForecastingAccessService.isAdminUser(cfoByName)).toBe(true);
    expect(() =>
      ForecastingAccessService.assertScenarioAccess(cfoByName, { createdById: "other-user" })
    ).not.toThrow();
  });

  test("regular user is not forecasting admin", () => {
    expect(
      ForecastingAccessService.isAdminUser({ role: { name: "Employee" }, roleCode: "FIN_ASST" })
    ).toBe(false);
  });

  test("assertLockRole allows admin", () => {
    expect(() =>
      ForecastingAccessService.assertLockRole({ role: { name: "admin" } })
    ).not.toThrow();
  });

  test("assertLockRole rejects unprivileged user", () => {
    expect(() =>
      ForecastingAccessService.assertLockRole({ role: { name: "Employee" }, roleCode: "FIN_ASST" })
    ).toThrow(ForecastingError);
  });
});

describe("ForecastingAccessService scenario and audit access", () => {
  test("assertScenarioAccess allows admin on any scenario", () => {
    expect(() =>
      ForecastingAccessService.assertScenarioAccess(
        { role: { name: "admin" }, id: "admin1" },
        { createdById: "someone-else" }
      )
    ).not.toThrow();
  });

  test("assertScenarioAccess allows owner", () => {
    expect(() =>
      ForecastingAccessService.assertScenarioAccess(
        { id: "u1", roleCode: "FIN_ASST" },
        { createdById: "u1" }
      )
    ).not.toThrow();
  });

  test("assertScenarioAccess rejects non-owner non-admin", () => {
    expect(() =>
      ForecastingAccessService.assertScenarioAccess(
        { id: "u1", roleCode: "FIN_ASST" },
        { createdById: "u2" }
      )
    ).toThrow(ForecastingError);
  });

  test("assertAdminAuditAccess allows admin", () => {
    expect(() =>
      ForecastingAccessService.assertAdminAuditAccess({ role: { name: "admin" } })
    ).not.toThrow();
  });
});

describe("ForecastingAccessService lock immutability", () => {
  test("assertScenarioEditable throws on LOCKED", () => {
    expect(() => ForecastingAccessService.assertScenarioEditable({ status: "LOCKED" })).toThrow(
      ForecastingError
    );
    try {
      ForecastingAccessService.assertScenarioEditable({ status: "LOCKED" });
    } catch (e: any) {
      expect(e.code).toBe("FORECAST_LOCKED");
      expect(e.statusCode).toBe(403);
    }
  });

  test("assertScenarioEditable allows DRAFT and ACTIVE", () => {
    expect(() => ForecastingAccessService.assertScenarioEditable({ status: "DRAFT" })).not.toThrow();
    expect(() => ForecastingAccessService.assertScenarioEditable({ status: "ACTIVE" })).not.toThrow();
  });
});

describe("LOCK_VIOLATION audit priority", () => {
  test("locked scenario blocks mutation path", async () => {
    mockFind.mockResolvedValue({ id: "s1", status: "LOCKED", dimensions: [], drivers: [] });
    await expect(ForecastingAccessService.loadScenarioOrThrow("s1")).resolves.toBeTruthy();
    const scenario = await ForecastingAccessService.loadScenarioOrThrow("s1");
    expect(() => ForecastingAccessService.assertScenarioEditable(scenario)).toThrow(/locked/i);
  });
});
