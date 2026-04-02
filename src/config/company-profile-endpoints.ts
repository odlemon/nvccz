export const companyProfileEndpoints = {
  "/api/company-profile/addresses": {
    get: {
      summary: "List all letterhead addresses",
      tags: ["Company Profile"],
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: "Addresses retrieved",
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  success: { type: "boolean", example: true },
                  data: {
                    type: "array",
                    items: { $ref: "#/components/schemas/CompanyProfileAddress" }
                  }
                }
              }
            }
          }
        }
      }
    },
    post: {
      summary: "Create a letterhead address (with optional logo)",
      tags: ["Company Profile"],
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              required: ["line1"],
              properties: {
                logo: { type: "string", format: "binary" },
                label: { type: "string" },
                line1: { type: "string" },
                line2: { type: "string" },
                city: { type: "string" },
                state: { type: "string" },
                postalCode: { type: "string" },
                country: { type: "string" },
                isActive: { type: "string", enum: ["true", "false"] }
              }
            }
          }
        }
      },
      responses: { 201: { description: "Address created" } }
    }
  },

  "/api/company-profile/addresses/{id}": {
    put: {
      summary: "Update a letterhead address (with optional new logo)",
      tags: ["Company Profile"],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      requestBody: {
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              properties: {
                logo: { type: "string", format: "binary" },
                label: { type: "string" },
                line1: { type: "string" },
                line2: { type: "string" },
                city: { type: "string" },
                state: { type: "string" },
                postalCode: { type: "string" },
                country: { type: "string" },
                isActive: { type: "string", enum: ["true", "false"] }
              }
            }
          }
        }
      },
      responses: { 200: { description: "Address updated" }, 404: { description: "Address not found" } }
    },
    delete: {
      summary: "Delete a letterhead address",
      tags: ["Company Profile"],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "Address deleted" }, 404: { description: "Address not found" } }
    }
  },

  "/api/company-profile/addresses/{id}/set-active": {
    post: {
      summary: "Set an address as the active (letterhead) address",
      tags: ["Company Profile"],
      security: [{ bearerAuth: [] }],
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "Active address updated" }, 404: { description: "Address not found" } }
    }
  }
};
