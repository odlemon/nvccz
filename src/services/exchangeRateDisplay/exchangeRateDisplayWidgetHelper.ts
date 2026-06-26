// @ts-nocheck

export async function resolveExchangeRateWidgetForContext(context: string) {
  try {
    const { ExchangeRateDisplayResolverService } = await import("./ExchangeRateDisplayResolverService");
    return await ExchangeRateDisplayResolverService.resolveWidget({ context });
  } catch (e) {
    console.warn("[exchangeRateDisplay] widget resolve failed", context, (e as Error)?.message);
    return null;
  }
}
