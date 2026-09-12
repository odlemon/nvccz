/**
 * Default OpenAPI responses for Swagger Try it out (Swagger UI 5 requires responses).
 */
export const SWAGGER_JSON_RESPONSES = {
  200: {
    description: "Success",
    content: {
      "application/json": {
        schema: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            data: {},
            message: { type: "string" },
          },
        },
      },
    },
  },
  201: {
    description: "Created",
    content: {
      "application/json": {
        schema: { type: "object" },
      },
    },
  },
  400: { description: "Bad request" },
  401: { description: "Unauthorized" },
  403: { description: "Forbidden" },
  404: { description: "Not found" },
  500: { description: "Server error" },
};

export function withSwaggerResponses(extra: Record<string, unknown> = {}) {
  if (extra.responses) return extra;
  return { responses: SWAGGER_JSON_RESPONSES, ...extra };
}
