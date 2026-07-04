import { TaxReturnPackAccessService } from "../src/services/taxReturnPack/TaxReturnPackAccessService";

describe("TaxReturnPack maker-checker", () => {
  test("blocks checker same as maker", async () => {
    await expect(TaxReturnPackAccessService.assertCheckerNotMaker("user-1", "user-1")).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  test("allows different checker", async () => {
    await expect(TaxReturnPackAccessService.assertCheckerNotMaker("user-1", "user-2")).resolves.toBeUndefined();
  });
});
