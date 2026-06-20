/**
 * Stock Price Collector & Multi-Module Transaction Router — Swagger paths.
 * Requirements: docs/stock-price-collector-backend-requirements.md
 * Design session: design-sessions/stock-price-collector.md
 *
 * Cron/schedule HTTP routes are intentionally omitted from Swagger — they remain
 * callable for ops (crontab + secret headers) but are not part of the frontend API surface.
 * See docs/stock-price-collector-ubuntu-cron-setup.md.
 */

export const STOCK_PRICE_COLLECTOR_TAG = "Stock Price Collector";

/** @deprecated Use STOCK_PRICE_COLLECTOR_TAG */
export const LISTED_EQUITY_MARKET_DATA_TAG = STOCK_PRICE_COLLECTOR_TAG;
/** @deprecated Use STOCK_PRICE_COLLECTOR_TAG */
export const LISTED_EQUITY_PORTFOLIO_TAG = STOCK_PRICE_COLLECTOR_TAG;
/** @deprecated Use STOCK_PRICE_COLLECTOR_TAG */
export const LISTED_EQUITY_TRADE_TAG = STOCK_PRICE_COLLECTOR_TAG;

const TAG = [STOCK_PRICE_COLLECTOR_TAG];
const bearer = [{ bearerAuth: [] }];

type StoryDocInput = {
  section: string;
  id: string;
  title: string;
  persona: string;
  want: string;
  soThat: string;
  acceptance: string[];
  whatHappens: string;
  notes?: string;
};

function storyDoc(s: StoryDocInput): string {
  const lines = [
    `**${s.section} User Story ${s.id}: ${s.title}**`,
    "",
    `**As a** ${s.persona}, **I want** ${s.want}, **so that** ${s.soThat}.`,
    "",
    "**Acceptance criteria (this endpoint):**",
    ...s.acceptance.map((a) => `- ${a}`),
    "",
    "**What happens when you call this:**",
    s.whatHappens,
  ];
  if (s.notes) {
    lines.push("", "**Implementation notes:**", s.notes);
  }
  return lines.join("\n");
}

function usOp(
  storyRef: string,
  summary: string,
  description: string,
  extra: Record<string, unknown> = {}
) {
  return { summary: `${storyRef} — ${summary}`, tags: TAG, description, security: bearer, ...extra };
}

const STORY_341 = {
  section: "2.1.1",
  id: "US-3.4.1",
  title: "SECZIM, ZSE, and VFEX Data Scraping",
  persona: "Asset Management Operations Lead",
  want: "automated scraping of official daily opening, closing, and reference prices from SECZIM, ZSE, and VFEX",
  soThat: "portfolio valuations use validated domestic pricing data without requiring manual entry",
};

const STORY_342 = {
  section: "2.1.2",
  id: "US-3.4.2",
  title: "Real-Time International Market Integration",
  persona: "Global Fund Manager",
  want: "near-live pricing feeds for international stocks (LSE, NYSE, NASDAQ) using approved API feeds",
  soThat: "I can manage global holdings and spot market trends as they develop",
};

const STORY_343 = {
  section: "2.2.1",
  id: "US-3.4.3",
  title: "Straight-Through Broker and Custodian Instruction Dispatch",
  persona: "Investment Officer",
  want: "automated settlement notifications to brokers and custodian banks directly from trade execution",
  soThat: "we eliminate manual email instructions and minimize settlement mismatch risks",
};

const STORY_344 = {
  section: "2.2.2",
  id: "US-3.4.4",
  title: "Core Banking and Accounting Ledger Updates",
  persona: "Fund Accountant",
  want: "confirmed trade executions to update core banking liquidity lines and write balancing double-entry ledger records automatically",
  soThat: "internal asset ratios and financial registers remain in continuous sync",
};

const STORY_345 = {
  section: "2.3.1",
  id: "US-3.4.5",
  title: "Dynamic Multi-Currency P&L Dashboard",
  persona: "Institutional Portfolio Manager",
  want: "realized and unrealized P&L across holdings split by USD and ZiG valuation lines",
  soThat: "I can report fund valuations to investors and align hedging strategies with real-time currency ratios",
};

const exchangeFilterParam = {
  name: "exchange",
  in: "query",
  required: false,
  description:
    "Filter by listing exchange / market-data source. Omit to return all active securities across ZSE, VFEX, NASDAQ, NYSE, etc.",
  schema: {
    type: "string",
    enum: ["ZSE", "VFEX", "SECZIM", "NASDAQ", "NYSE", "LSE"],
    example: "ZSE",
  },
};

const listedEquitySecuritySchema = {
  type: "object",
  properties: {
    id: { type: "string", example: "clx9k2m8n0000qz8x9y8z7w6v" },
    symbol: { type: "string", example: "ARIS" },
    isin: { type: "string", nullable: true, example: "ZW0009012345" },
    exchangeCode: { type: "string", example: "ZSE", description: "Market source: ZSE | VFEX | NASDAQ | NYSE | …" },
    name: { type: "string", example: "Ariston Holdings Limited" },
    listingCurrencyCode: { type: "string", example: "ZWG", description: "ZWG (ZSE), USD (VFEX/NASDAQ/NYSE)" },
    isActive: { type: "boolean", example: true },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
};

const successListResponse = (itemExample: Record<string, unknown>) => ({
  type: "object",
  properties: {
    success: { type: "boolean", example: true },
    data: { type: "array", items: { type: "object", example: itemExample } },
  },
});

export const stockPriceCollectorSwaggerPaths: Record<string, unknown> = {
  "/investments/market-data/securities": {
    get: usOp(
      "US-3.4.1",
      "List securities master (domestic + international)",
      storyDoc({
        ...STORY_341,
        acceptance: [
          "Securities registry supports ZSE, VFEX, and SECZIM listing codes used by domestic scrapers.",
          "Each row exposes symbol, exchange, currency, and ISIN for downstream ingest and valuation.",
        ],
        whatHappens:
          "Returns active listed-equity securities. Filter `?exchange=ZSE|VFEX|SECZIM` for domestic boards; " +
          "`?exchange=NASDAQ|NYSE` for international watchlist symbols. Rows are auto-created by ingest jobs or registered manually.",
      }),
      {
        parameters: [exchangeFilterParam],
        responses: {
          "200": {
            description: "Active securities, optionally filtered by exchange",
            content: {
              "application/json": {
                schema: successListResponse({
                  id: "clx9k2m8n0000qz8x9y8z7w6v",
                  symbol: "ARIS",
                  exchangeCode: "ZSE",
                  name: "Ariston Holdings Limited",
                  listingCurrencyCode: "ZWG",
                  isActive: true,
                }),
              },
            },
          },
        },
      }
    ),
    post: usOp(
      "US-3.4.1",
      "Register security (admin)",
      storyDoc({
        ...STORY_341,
        acceptance: [
          "Operations can register a domestic or cross-listed security before first ingest/trade.",
          "Symbol + exchangeCode must be unique across the master.",
        ],
        whatHappens:
          "Creates a security row in the master. Required before manual price ingress or trade capture when scrapers have not yet auto-created the symbol.",
      }),
      {
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["symbol", "exchangeCode", "name", "listingCurrencyCode"],
                properties: {
                  symbol: { type: "string", example: "ARIS" },
                  exchangeCode: {
                    type: "string",
                    enum: ["ZSE", "VFEX", "SECZIM", "NASDAQ", "NYSE", "LSE"],
                    example: "ZSE",
                  },
                  name: { type: "string", example: "Ariston Holdings Limited" },
                  listingCurrencyCode: { type: "string", example: "ZWG" },
                  isin: { type: "string", nullable: true },
                  isActive: { type: "boolean", default: true },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Security created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: listedEquitySecuritySchema,
                  },
                },
              },
            },
          },
        },
      }
    ),
  },
  "/investments/market-data/securities/{id}": {
    put: usOp(
      "US-3.4.1",
      "Update security",
      storyDoc({
        ...STORY_341,
        acceptance: ["Security master can be corrected without re-ingest."],
        whatHappens: "Updates name, ISIN, currency, or active flag on an existing security row.",
      }),
      { parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }] }
    ),
  },
  "/investments/market-data/securities/{id}/prices": {
    get: usOp(
      "US-3.4.2",
      "Price tick history (timestamp + frequency)",
      storyDoc({
        ...STORY_342,
        acceptance: [
          "Each tick includes pricedAt (last captured time) and tickFrequency (LIVE | DELAYED_15M | EOD).",
          "UI can derive direction vs previousClose for gain/loss indicators.",
        ],
        whatHappens:
          "Returns up to 200 price ticks newest-first for one security. Includes OPEN/CLOSE/REFERENCE types from domestic scrapers (ZSE/VFEX) " +
          "and international feeds (NASDAQ/NYSE). Ticks with validationStatus PENDING_REVIEW are excluded from valuation until approved.",
      }),
      { parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }] }
    ),
  },
  "/investments/market-data/prices/latest": {
    get: usOp(
      "US-3.4.2",
      "Latest approved prices (bulk / watchlist feed)",
      storyDoc({
        ...STORY_342,
        acceptance: [
          "Near-live board shows last approved tick per symbol with pricedAt timestamp.",
          "When live feed unavailable, returns last confirmed close (sourceStatus may be FALLBACK on ingest batch).",
        ],
        whatHappens:
          "Returns `{ security, latestTick }` pairs for all active securities or a comma-separated `?symbols=` filter. " +
          "Only APPROVED ticks are returned — use validation-queue endpoints when domestic scrape flags >15% deviation.",
      })
    ),
  },
  "/investments/market-data/ingest/run": {
    post: usOp(
      "US-3.4.1",
      "Run ingest / scrape (ZSE · VFEX · SECZIM · NASDAQ · NYSE)",
      storyDoc({
        ...STORY_341,
        acceptance: [
          "Automated jobs parse official daily market reports at market open (09:00 CAT) and market close (16:00 CAT). " +
          "Production scheduling is server-side (crontab — ops only, not in Swagger).",
          "Scraper applies exponential backoff; unreachable sources fall back to last validated close (sourceStatus: FALLBACK).",
          "Each batch stores SHA-256 checksum; >15% deviation vs prior close → PENDING_REVIEW.",
        ],
        whatHappens:
          "Triggers one ingest batch for `sourceCode`. **Domestic:** `ZSE` (Mansa API), `VFEX` (price sheet scrape), `SECZIM` (URL when configured). " +
          "**International:** `NASDAQ` / `NYSE` (Yahoo + FastBull). Pass optional `ticks[]` for manual admin ingress. " +
          "Approved ticks trigger PortfolioValuationEngine recalc for affected holdings.",
        notes:
          "International near-live feeds (US-3.4.2) use DELAYED_15M metadata; licensed Refinitiv/Bloomberg webhooks use POST /webhooks/:providerCode.",
      }),
      {
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  sourceCode: {
                    type: "string",
                    example: "ZSE",
                    enum: ["ZSE", "VFEX", "SECZIM", "NASDAQ", "NYSE", "MANUAL"],
                  },
                  ticks: {
                    type: "array",
                    description: "Optional manual ticks — skips scraper when non-empty",
                    items: {
                      type: "object",
                      properties: {
                        symbol: { type: "string" },
                        exchangeCode: { type: "string" },
                        priceType: { type: "string", enum: ["OPEN", "CLOSE", "REFERENCE", "LIVE"] },
                        price: { type: "number" },
                        pricedAt: { type: "string", format: "date-time" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }
    ),
  },
  "/investments/market-data/ingest/batches": {
    get: usOp(
      "US-3.4.1",
      "List ingest batches (SHA-256 audit trail)",
      storyDoc({
        ...STORY_341,
        acceptance: ["System calculates and logs SHA-256 hash for every ingested dataset."],
        whatHappens:
          "Returns recent ingest batches with sourceCode, recordCount, sha256Checksum, sourceStatus (OK | FALLBACK), and status. " +
          "Use for ops audit of domestic scrape runs.",
      })
    ),
  },
  "/investments/market-data/ingest/batches/{id}": {
    get: usOp(
      "US-3.4.1",
      "Verify batch checksum + tick detail",
      storyDoc({
        ...STORY_341,
        acceptance: ["File integrity verifiable by recomputing SHA-256 over canonical tick JSON."],
        whatHappens:
          "Returns batch metadata, all price ticks, `checksumValid` boolean, and `recomputedChecksum` for tamper detection.",
      }),
      { parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }] }
    ),
  },
  "/investments/market-data/validation-queue": {
    get: usOp(
      "US-3.4.1",
      "Admin validation queue (>15% price deviation)",
      storyDoc({
        ...STORY_341,
        acceptance: [
          "If scraped price deviates >15% from previous close, record is held for manual validation before valuation use.",
        ],
        whatHappens:
          "Lists price ticks in PENDING_REVIEW with security context. Excluded from auto-valuation until approved or rejected.",
      })
    ),
  },
  "/investments/market-data/validation-queue/{tickId}/approve": {
    post: usOp(
      "US-3.4.1",
      "Approve pending price tick",
      storyDoc({
        ...STORY_341,
        acceptance: ["Approved ticks enter valuation engine and holdings marks."],
        whatHappens:
          "Sets validationStatus APPROVED, logs audit event, and recalculates fund valuations for securities with holdings.",
      }),
      { parameters: [{ name: "tickId", in: "path", required: true, schema: { type: "string" } }] }
    ),
  },
  "/investments/market-data/validation-queue/{tickId}/reject": {
    post: usOp(
      "US-3.4.1",
      "Reject pending price tick",
      storyDoc({
        ...STORY_341,
        acceptance: ["Rejected ticks never affect portfolio marks."],
        whatHappens: "Sets validationStatus REJECTED and logs audit event. Prior approved close remains in effect.",
      }),
      { parameters: [{ name: "tickId", in: "path", required: true, schema: { type: "string" } }] }
    ),
  },
  "/investments/market-data/webhooks/{providerCode}": {
    post: {
      summary: "US-3.4.2 — Licensed feed webhook ingress (HMAC)",
      tags: TAG,
      description: storyDoc({
        ...STORY_342,
        acceptance: [
          "Approved API feeds (Refinitiv, Bloomberg, AlphaVantage, etc.) push ticks via signed webhook.",
          "Vendor symbols mapped to internal Security via vendorSymbol cross-reference.",
          "HTTP 202 returned immediately; ingest processed asynchronously.",
        ],
        whatHappens:
          "Accepts JSON tick payload from external market-data vendor. Verifies `X-Market-Data-Signature` HMAC when MARKET_DATA_WEBHOOK_SECRET is set. " +
          "Normalises ticks and enqueues ingest batch. No JWT — webhook HMAC only.",
      }),
      parameters: [{ name: "providerCode", in: "path", required: true, schema: { type: "string", example: "REFINITIV" } }],
    },
  },
  "/investments/portfolio/funds": {
    get: usOp(
      "US-3.4.5",
      "List funds with latest NAV snapshot",
      storyDoc({
        ...STORY_345,
        acceptance: ["Fund-level NAV aggregate available for dashboard header."],
        whatHappens:
          "Returns funds accessible to the user with baseCurrencyCode and latest valuation snapshot (navBaseCurrency, unrealized P&L lines).",
      })
    ),
  },
  "/investments/portfolio/funds/{fundId}/holdings": {
    get: usOp(
      "US-3.4.5",
      "Holdings grid (WAC · market value · unrealized P&L)",
      storyDoc({
        ...STORY_345,
        acceptance: [
          "Average cost bases calculated dynamically using Weighted Average Cost (WAC) across multi-lot purchase paths.",
          "Unrealized P&L updates when latest approved market prices change.",
        ],
        whatHappens:
          "Returns each position with quantity, WAC, currentPrice (latest approved tick), marketValue, and unrealizedPnl. " +
          "WAC recomputed on each custodian-confirmed buy lot (see US-3.4.4).",
      }),
      { parameters: [{ name: "fundId", in: "path", required: true, schema: { type: "string" } }] }
    ),
  },
  "/investments/portfolio/funds/{fundId}/pnl": {
    get: usOp(
      "US-3.4.5",
      "Realized + unrealized P&L (USD + ZiG lines)",
      storyDoc({
        ...STORY_345,
        acceptance: [
          "P&L split by USD and ZiG valuation lines using daily FX (fxRateUsed + fxRateSource logged).",
          "Realized P&L accumulates on trade settlement; unrealized from latest valuation snapshot.",
        ],
        whatHappens:
          "Returns `{ unrealized: { usd, zig, fxRateUsed, fxRateSource }, realized: { usd, zig }, snapshot }` for the fund. " +
          "ZiG line uses Zimrate/scraped USD↔ZWG rate at snapshot time.",
        notes: "Capital Gains Tax accrual (cgtAmount) is schema-ready; statutory CGT engine not yet wired.",
      }),
      { parameters: [{ name: "fundId", in: "path", required: true, schema: { type: "string" } }] }
    ),
  },
  "/investments/portfolio/funds/{fundId}/valuations": {
    get: usOp(
      "US-3.4.5",
      "Valuation snapshot history",
      storyDoc({
        ...STORY_345,
        acceptance: ["Historical NAV and dual-currency unrealized P&L for investor reporting."],
        whatHappens: "Returns last 100 valuation snapshots (asOf, navBaseCurrency, unrealizedPnlUsd, unrealizedPnlZig, fxRateUsed).",
      }),
      { parameters: [{ name: "fundId", in: "path", required: true, schema: { type: "string" } }] }
    ),
  },
  "/investments/portfolio/funds/{fundId}/valuations/run": {
    post: usOp(
      "US-3.4.5",
      "Force valuation run (recalc NAV + unrealized P&L)",
      storyDoc({
        ...STORY_345,
        acceptance: ["Unrealized P&L recalculates on demand from latest approved prices."],
        whatHappens:
          "Runs PortfolioValuationEngine for the fund: marks each holding at latest approved tick, sums NAV, stores new snapshot with FX conversion to ZiG.",
      }),
      { parameters: [{ name: "fundId", in: "path", required: true, schema: { type: "string" } }] }
    ),
  },
  "/investments/portfolio/watchlist": {
    get: usOp(
      "US-3.4.2",
      "User watchlist with price + frequency badge",
      storyDoc({
        ...STORY_342,
        acceptance: [
          "Near-live pricing with tickFrequency badge (LIVE | DELAYED_15M | EOD) and pricedAt timestamp.",
          "UI renders direction from price vs previousClose; stale FALLBACK ticks should show warning banner.",
        ],
        whatHappens:
          "Returns user's watchlist securities each with latestTick and indicator (tickFrequency). " +
          "Supports domestic and international symbols for the left-pane market monitor wireframe.",
      })
    ),
    put: usOp(
      "US-3.4.2",
      "Replace watchlist symbols",
      storyDoc({
        ...STORY_342,
        acceptance: ["Portfolio manager can curate symbols to monitor."],
        whatHappens: "Replaces the authenticated user's watchlist with the provided securityIds array.",
      })
    ),
  },
  "/investments/trades": {
    get: usOp(
      "US-3.4.3",
      "List trades + routing status",
      storyDoc({
        ...STORY_343,
        acceptance: ["Trade dashboard lists execution and quad-routing hop badges."],
        whatHappens:
          "Returns trades with security and routingHops summary. Filter by fundId/status. Statuses: DRAFT → EXECUTED → ROUTING → SETTLED | SETTLEMENT_FAILED.",
      })
    ),
    post: usOp(
      "US-3.4.3",
      "Create draft trade",
      storyDoc({
        ...STORY_343,
        acceptance: ["Investment officer captures trade intent before execution window dispatch."],
        whatHappens:
          "Creates DRAFT trade with fundId, securityId, side (BUY|SELL), quantity, executionPrice, currency, fees. " +
          "Assigns tradeRef (TXN-…). Execute via POST /trades/{id}/execute.",
      })
    ),
  },
  "/investments/trades/{id}": {
    get: usOp(
      "US-3.4.3",
      "Trade detail + quad routing board",
      storyDoc({
        ...STORY_343,
        acceptance: [
          "Transaction router displays STAGED → DISPATCHED → CONFIRMED badges per hop (BROKER, CUSTODIAN, CORE_BANKING, ACCOUNTING_GL).",
        ],
        whatHappens:
          "Returns full trade with routingHops (status, dispatchedAt, confirmedAt, externalRef, lastError), settlement (journalEntryId, realizedPnl), and cashHolds.",
      }),
      { parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }] }
    ),
  },
  "/investments/trades/{id}/execute": {
    post: usOp(
      "US-3.4.3",
      "Execute trade + start settlement routing",
      storyDoc({
        ...STORY_343,
        acceptance: [
          "Executing a trade triggers the routing engine to compile and send transaction payloads to broker (and custodian when enabled).",
          "US-3.4.4: BUY places cash hold on trust account; settlement releases hold, updates holdings, posts balanced GL.",
        ],
        whatHappens:
          "1. Marks trade EXECUTED → ROUTING and creates four hops.\n" +
          "2. **BROKER:** JSON payload saved locally; optional SMTP email to broker profile.\n" +
          "3. **CUSTODIAN:** Skipped by default (`LISTED_EQUITY_CUSTODIAN_ENABLED=true` to enable PDF/email). Internal mode auto-confirms custodian hop and updates holdings.\n" +
          "4. **CORE_BANKING:** Places cash hold (BUY) on fund trust bank via cashbook; releases hold when settlement completes.\n" +
          "5. **ACCOUNTING_GL:** Posts balanced journal (DR listed securities / CR bank clearing on BUY; inverse + realized P&L on SELL).\n" +
          "6. Trade becomes SETTLED when GL is posted (internal settlement mode — no manual hop confirms required).",
        notes:
          "Broker email may fail locally (SMTP relay) — payload still saved under storage/local-upload-mock/. " +
          "Use Idempotency-Key header to prevent duplicate execution.",
      }),
      {
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "Idempotency-Key", in: "header", schema: { type: "string" } },
        ],
      }
    ),
  },
  "/investments/trades/{id}/cancel": {
    post: usOp(
      "US-3.4.3",
      "Cancel draft or in-flight trade",
      storyDoc({
        ...STORY_343,
        acceptance: ["Cannot cancel after SETTLED."],
        whatHappens: "Sets status CANCELLED for DRAFT/EXECUTED/ROUTING trades.",
      }),
      { parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }] }
    ),
  },
  "/investments/trades/{id}/routing-hops": {
    get: usOp(
      "US-3.4.3",
      "Quad-target routing status board",
      storyDoc({
        ...STORY_343,
        acceptance: [
          "Real-time tracking badges: STAGED, DISPATCHED, CONFIRMED, FAILED, RETRYING with attemptCount and lastError.",
        ],
        whatHappens:
          "Returns the four routing hops for settlement tracking UI (broker → custodian → core banking → GL stepper).",
      }),
      { parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }] }
    ),
  },
  "/investments/trades/{id}/routing-hops/{hopId}/retry": {
    post: usOp(
      "US-3.4.3",
      "Retry failed routing hop",
      storyDoc({
        ...STORY_343,
        acceptance: ["Failed downstream dispatches can be retried with backoff."],
        whatHappens: "Resets hop to STAGED and re-runs processRouting for the trade.",
      }),
      {
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "hopId", in: "path", required: true, schema: { type: "string" } },
        ],
      }
    ),
  },
  "/investments/trades/{id}/routing-hops/{hopId}/confirm": {
    post: usOp(
      "US-3.4.3",
      "Manual stakeholder confirm (broker / custodian / bank / GL)",
      storyDoc({
        ...STORY_343,
        acceptance: [
          "Verify delivery confirmation receipts when external broker/custodian ACK is received.",
          "US-3.4.4: Custodian confirm updates holdings; bank confirm releases hold; GL confirm posts journal.",
        ],
        whatHappens:
          "Confirms one routing hop with optional externalRef (broker/custodian receipt ID). " +
          "Advances the orchestrator chain. Required when LISTED_EQUITY_CUSTODIAN_ENABLED=true or for manual broker ACK. " +
          "Not required for bank/GL in internal settlement mode (auto-completes on execute).",
      }),
      {
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "hopId", in: "path", required: true, schema: { type: "string" } },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { externalRef: { type: "string", example: "BRK-ACK-2026-001" } },
              },
            },
          },
        },
      }
    ),
  },
  "/investments/trades/{id}/settlement-document": {
    get: usOp(
      "US-3.4.3",
      "Download settlement PDF",
      storyDoc({
        ...STORY_343,
        acceptance: [
          "System generates PDF settlement instruction for custodian (when custodian routing enabled).",
        ],
        whatHappens:
          "Streams the settlement PDF generated at custodian dispatch. Returns 404 if custodian routing disabled or PDF not yet created.",
        notes: "Digital fund signing and PGP/SFTP delivery planned — PDF is basic PDFKit output today.",
      }),
      { parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }] }
    ),
  },
};

export const STOCK_PRICE_COLLECTOR_TAG_DEFINITION = {
  name: STOCK_PRICE_COLLECTOR_TAG,
  description:
    "**Stock Price Collector & Multi-Module Transaction Router** — listed-equity market data, portfolio valuation, and quad-target trade settlement for Arcus.\n\n" +
    "**User stories covered (client sections 2.1–2.3):**\n" +
    "- **2.1.1 · US-3.4.1** — Domestic scraping (ZSE, VFEX, SECZIM): ingest batches, SHA-256, >15% validation queue (scheduled scrape is ops/cron — omitted from Swagger)\n" +
    "- **2.1.2 · US-3.4.2** — International feeds (LSE, NYSE, NASDAQ): webhooks, latest prices, watchlist\n" +
    "- **2.2.1 · US-3.4.3** — Broker & custodian dispatch: trade execute, routing hop status, settlement PDF\n" +
    "- **2.2.2 · US-3.4.4** — Core banking & GL: cash holds, holdings update, balanced journal entries on settle\n" +
    "- **2.3.1 · US-3.4.5** — Multi-currency P&L: WAC holdings, unrealized/realized P&L (USD + ZiG), NAV snapshots\n\n" +
    "Each endpoint description includes the user story, acceptance criteria, and runtime behaviour. " +
    "See `docs/stock-price-collector-backend-requirements.md` and `design-sessions/stock-price-collector.md`.",
};
