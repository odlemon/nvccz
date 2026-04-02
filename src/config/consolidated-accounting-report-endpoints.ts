export const consolidatedAccountingReportEndpoints = {
  "/api/accounting/balance-sheet/consolidated": {
    post: {
      summary: "Generate consolidated balance sheet (all currencies converted to one target currency)",
      tags: ["Accounting - Balance Sheet"],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["asOfDate", "consolidationCurrencyId"],
              properties: {
                asOfDate: { type: "string", format: "date", example: "2026-03-31" },
                consolidationCurrencyId: { type: "string", description: "Target currency id" },
                startDate: { type: "string", format: "date", example: "2025-01-01" },
                endDate: { type: "string", format: "date", example: "2026-03-31" }
              }
            }
          }
        }
      },
      responses: { 200: { description: "Consolidated balance sheet generated successfully" } }
    }
  },
  "/api/accounting/income-statement/consolidated": {
    post: {
      summary: "Generate consolidated income statement (all currencies converted to one target currency)",
      tags: ["Accounting - Income Statement"],
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: "query", name: "periodType", schema: { type: "string", enum: ["month", "quarter", "year"] } },
        { in: "query", name: "periodValue", schema: { type: "string" } }
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["consolidationCurrencyId"],
              properties: {
                startDate: { type: "string", format: "date", example: "2025-01-01" },
                endDate: { type: "string", format: "date", example: "2026-03-31" },
                consolidationCurrencyId: { type: "string", description: "Target currency id" }
              }
            }
          }
        }
      },
      responses: { 200: { description: "Consolidated income statement generated successfully" } }
    }
  }
};

