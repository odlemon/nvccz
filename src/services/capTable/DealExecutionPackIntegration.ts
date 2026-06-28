// @ts-nocheck
/**
 * Deal Execution Pack (Section 3.11) — PLACEHOLDER integration.
 * When the Deal Execution module ships, replace the stub handler with a real webhook listener.
 */
import type { DealExecutionClosedEvent } from "./capTableTypes";
import { CapTableRegistryService } from "./CapTableRegistryService";
import { CapTableTransactionService } from "./CapTableTransactionService";

export class DealExecutionPackIntegration {
  /**
   * Called when a deal pack reaches CLOSED_EXECUTED.
   * Currently creates DRAFT issuance transactions from SPA metadata.
   */
  static async onDealPackClosed(event: DealExecutionClosedEvent, userId: string) {
    await CapTableRegistryService.bootstrap(event.portfolioCompanyId);
    return CapTableTransactionService.createFromDealPack(
      event.portfolioCompanyId,
      userId,
      event.dealExecutionPackId,
      event.spaMetadata
    );
  }
}
