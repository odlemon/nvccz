/** Custodian dispatch is off until external SFTP/PGP integration is ready. */
export function isCustodianRoutingEnabled(): boolean {
  return process.env.LISTED_EQUITY_CUSTODIAN_ENABLED === "true";
}

export function isInternalSettlementMode(): boolean {
  return !isCustodianRoutingEnabled();
}
