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
