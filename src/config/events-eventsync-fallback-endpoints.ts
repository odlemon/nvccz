/**
 * Fallback OpenAPI paths for EventSync — fills gaps if swagger-jsdoc omits route blocks.
 * Tags match docs/events-uat.md. Merged with mergeOpenApiPathItemsPreferExisting in swagger.ts.
 */
const CORE = "Events — Core & calendar (EventSync)";

export const eventsEventsyncFallbackEndpoints: Record<string, Record<string, unknown>> = {
  "/events/public/upcoming": {
    get: {
      summary: "Get upcoming events (PUBLIC)",
      description: "No authentication. Events with startDate >= now.",
      tags: [CORE],
      security: [],
      responses: { 200: { description: "OK" } },
    },
  },
  "/events/public/{id}": {
    get: {
      summary: "Get event by ID (PUBLIC)",
      tags: [CORE],
      security: [],
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "OK" }, 404: { description: "Not found" } },
    },
  },
};
