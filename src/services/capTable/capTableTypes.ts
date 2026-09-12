// @ts-nocheck

export const CAP_TABLE_TX_STATUS = ["DRAFT", "PENDING_APPROVAL", "EXECUTED", "REJECTED"] as const;
export const CAP_TABLE_TX_TYPES = [
  "ISSUANCE",
  "TRANSFER",
  "CONVERSION",
  "REPURCHASE",
  "CANCELLATION",
  "OPTION_EXERCISE",
  "IMPORT",
] as const;

export type CapTableTxStatus = (typeof CAP_TABLE_TX_STATUS)[number];
export type CapTableTxType = (typeof CAP_TABLE_TX_TYPES)[number];

export type DilutionNoteInput = {
  principal: number;
  annualInterestRate: number;
  valuationCap?: number | null;
  discountRate?: number | null;
  daysAccrued?: number;
};

export type DilutionSimInput = {
  preMoneyValuation: number;
  roundInvestment: number;
  optionPoolTopUpPct?: number;
  preMoneyFullyDilutedShares: number;
  notes?: DilutionNoteInput[];
};

export type WaterfallClassInput = {
  classCode: string;
  seniorityIndex: number;
  liquidationMultiplier: number;
  isParticipating: boolean;
  issuedShares: number;
  originalCostPerShare: number;
};

export type DealExecutionClosedEvent = {
  dealExecutionPackId: string;
  portfolioCompanyId: string;
  closedAt: string;
  spaMetadata: Array<{
    shareClassCode: string;
    quantity: number;
    pricePerShare: number;
    investorStakeholderRef?: string;
  }>;
};
