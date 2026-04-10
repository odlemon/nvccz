/**
 * Capital call email subject per product spec:
 * `Capital Call Notice , {Fund Name} , {Date}` (spaces around commas).
 */
export function capitalCallNoticeEmailSubject(fundName: string, dateLabel: string): string {
  return `Capital Call Notice , ${fundName} , ${dateLabel}`;
}
