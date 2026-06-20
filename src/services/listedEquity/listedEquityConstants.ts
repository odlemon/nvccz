export const DEVIATION_THRESHOLD = 0.15;
export const ROUTING_TARGETS = ["BROKER", "CUSTODIAN", "CORE_BANKING", "ACCOUNTING_GL"] as const;
export type RoutingTarget = (typeof ROUTING_TARGETS)[number];

export const RETRY_BACKOFF_MINUTES = [1, 5, 15, 60, 240];
export const MAX_ROUTING_ATTEMPTS = 5;

export const DEFAULT_COA_MAPPING = {
  listedSecuritiesAsset: "1210",
  bankClearing: "1105",
  realizedGain: "4200",
  realizedLoss: "5200",
  cgtPayable: "2180",
};

export type CoaMapping = typeof DEFAULT_COA_MAPPING & Record<string, string>;
