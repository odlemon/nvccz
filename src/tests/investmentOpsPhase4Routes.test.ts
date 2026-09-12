import router from "../routes/investmentOpsRoutes";

describe("Investment Ops Phase 4 route smoke", () => {
  const routes = (router as any).stack
    .filter((layer: any) => layer.route)
    .flatMap((layer: any) =>
      Object.keys(layer.route.methods).map(
        (method) => `${method.toUpperCase()} ${layer.route.path}`
      )
    );

  it.each([
    "GET /reports/templates",
    "GET /reports",
    "POST /reports/generate",
    "GET /reports/:id",
    "GET /reports/:id/audit",
    "POST /reports/:id/cancel",
    "POST /reports/:id/retry",
    "GET /reports/:id/download",
    "GET /jobs/:jobId",
    "POST /jobs/:jobId/cancel",
    "GET /outbox-events",
    "GET /outbox-events/poll",
    "GET /audit-events",
    "GET /capabilities",
  ])("registers %s", (route) => {
    expect(routes).toContain(route);
  });
});
