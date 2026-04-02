export const vatRateEndpoints = {
  "/api/accounting/vat-rates": {
    get: {
      summary: "List all VAT rates",
      tags: ["VAT Rates"],
      security: [{ bearerAuth: [] }],
      responses: { 200: { description: "List of VAT rates" } }
    },
    post: {
      summary: "Create a new VAT rate",
      tags: ["VAT Rates"],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name", "rateDecimal"],
              properties: {
                name: { type: "string", example: "Standard VAT 15%" },
                rateDecimal: { type: "number", example: 0.15 },
                isActive: { type: "boolean", example: false }
              }
            }
          }
        }
      },
      responses: { 201: { description: "VAT rate created" }, 409: { description: "Another VAT rate is already active" } }
    }
  },
  "/api/accounting/vat-rates/active": {
    get: {
      summary: "Get the currently active VAT rate",
      tags: ["VAT Rates"],
      security: [{ bearerAuth: [] }],
      responses: { 200: { description: "Active VAT rate" } }
    }
  },
  "/api/accounting/vat-rates/{id}": {
    put: {
      summary: "Update a VAT rate",
      tags: ["VAT Rates"],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string" },
                rateDecimal: { type: "number" },
                isActive: { type: "boolean" }
              }
            }
          }
        }
      },
      responses: { 200: { description: "VAT rate updated" }, 404: { description: "VAT rate not found" }, 409: { description: "Another VAT rate is already active" } }
    },
    delete: {
      summary: "Delete a VAT rate",
      tags: ["VAT Rates"],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "VAT rate deleted" }, 400: { description: "Cannot delete active VAT rate" }, 404: { description: "VAT rate not found" } }
    }
  },
  "/api/accounting/vat-rates/{id}/set-active": {
    post: {
      summary: "Switch the active VAT rate",
      tags: ["VAT Rates"],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "Active VAT rate switched" }, 404: { description: "VAT rate not found" }, 409: { description: "Another VAT rate is already active" } }
    }
  }
};

