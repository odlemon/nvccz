import { InvestmentOpsError } from "../middleware/investmentOpsFoundation";

import {

  assertCumulativeFill,

  assertOrderTransition,

  investmentOrderInputHash,

  ORDER_TRANSITIONS,

} from "../services/investmentOps/InvestmentOrderPhase2Service";



describe("Investment Ops Phase 2 order invariants", () => {

  it("hashes canonical input independently of object key order", () => {

    expect(investmentOrderInputHash({ quantity: "10.000", side: "BUY" })).toBe(

      investmentOrderInputHash({ side: "BUY", quantity: "10.000" })

    );

    expect(investmentOrderInputHash({ side: "BUY", quantity: "10" })).not.toBe(

      investmentOrderInputHash({ side: "BUY", quantity: "11" })

    );

  });



  it("allows only canonical lifecycle transitions", () => {

    expect(() => assertOrderTransition("DRAFT", "SUBMITTED")).not.toThrow();

    expect(() => assertOrderTransition("SENT_TO_BROKER", "PARTIALLY_EXECUTED")).not.toThrow();

    expect(() => assertOrderTransition("PARTIALLY_EXECUTED", "EXECUTED")).not.toThrow();

    expect(() => assertOrderTransition("EXECUTED", "PENDING_SETTLEMENT")).not.toThrow();

    expect(() => assertOrderTransition("EXECUTED", "SETTLED")).not.toThrow();

    expect(() => assertOrderTransition("DRAFT", "SETTLED")).toThrow(

      expect.objectContaining<Partial<InvestmentOpsError>>({

        code: "INVALID_ORDER_TRANSITION",

        status: 409,

      })

    );

    expect(ORDER_TRANSITIONS.APPROVED).toEqual(["SENT_TO_BROKER", "CANCELLED"]);

  });



  it("supports partial fills but rejects cumulative overfills", () => {

    expect(assertCumulativeFill("100", "40", "60").toString()).toBe("100");

    expect(assertCumulativeFill("100", "25", "25").toString()).toBe("50");

    expect(() => assertCumulativeFill("100", "80", "20.0001")).toThrow(

      expect.objectContaining<Partial<InvestmentOpsError>>({

        code: "OVERFILL_NOT_ALLOWED",

      })

    );

  });



  it("keeps approval and reject independent of cancel transitions", () => {

    expect(ORDER_TRANSITIONS.SUBMITTED).toEqual(

      expect.arrayContaining(["APPROVED", "REJECTED", "CANCELLED", "COMPLIANCE_REVIEW"])

    );

    expect(ORDER_TRANSITIONS.COMPLIANCE_REVIEW).toEqual(

      expect.arrayContaining(["APPROVED", "REJECTED", "CANCELLED"])

    );

    expect(ORDER_TRANSITIONS.APPROVED).not.toContain("REJECTED");

  });

});


