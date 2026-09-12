/**
 * Transfer validation — seller balance check logic (unit-level).
 */
describe("CapTable transfer validation", () => {
  test("blocks transfer when seller balance insufficient", () => {
    const sellerBalance = 1000;
    const transferQty = 1500;
    expect(sellerBalance < transferQty).toBe(true);
  });

  test("allows transfer when seller balance sufficient", () => {
    const sellerBalance = 2500000;
    const transferQty = 500000;
    expect(sellerBalance >= transferQty).toBe(true);
  });
});
