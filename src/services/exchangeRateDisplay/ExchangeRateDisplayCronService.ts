// @ts-nocheck
import { StreetRateIngestService } from "./StreetRateIngestService";

export class ExchangeRateDisplayCronService {
  static async refreshSnapshots() {
    return StreetRateIngestService.ingestLive();
  }
}
