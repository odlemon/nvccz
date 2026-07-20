import router from "../routes/investmentOpsRoutes";



describe("Investment Ops Phase 2 route smoke", () => {

  const routes = (router as any).stack

    .filter((layer: any) => layer.route)

    .flatMap((layer: any) =>

      Object.keys(layer.route.methods).map(

        (method) => `${method.toUpperCase()} ${layer.route.path}`

      )

    );



  it.each([

    "POST /orders/preview",

    "POST /orders",

    "GET /orders/:id",

    "PATCH /orders/:id",

    "DELETE /orders/:id",

    "GET /orders/:id/history",

    "POST /orders/:id/submit",

    "POST /orders/:id/approve",

    "POST /orders/:id/reject",

    "POST /orders/:id/cancel",

    "POST /orders/:id/send-to-broker",

    "POST /orders/:id/executions",

    "GET /orders/:id/executions",

    "GET /orders/:id/fills",

    "POST /orders/:id/fills",

    "POST /orders/:id/documents",

    "POST /orders/:id/trade-confirmation",

    "POST /orders/:id/settlement",

    "POST /orders/:id/compliance-check",

    "GET /orders/:id/applicable-approval-routes",

    "GET /orders/approval-routes",

    "POST /orders/approval-routes",

    "GET /approval-routes",

    "POST /approval-routes",

    "PATCH /orders/approval-routes/:id",

    "DELETE /orders/approval-routes/:id",

    "GET /orders/configuration/:fundId",

    "PATCH /orders/configuration/:fundId",

    "GET /blotters",

    "POST /blotters",

    "GET /blotters/:id",

    "PATCH /blotters/:id",

    "POST /blotters/:id/orders",

    "DELETE /blotters/:id/orders/:orderId",

    "GET /compliance/rules",

    "POST /compliance/rules",

    "GET /compliance/rules/:id",

    "PATCH /compliance/rules/:id",

    "DELETE /compliance/rules/:id",

    "GET /compliance/runs",

    "GET /compliance/runs/:id",

    "GET /compliance/overrides",

    "POST /compliance/overrides/requests",

    "POST /compliance/overrides/:id/approve",

    "POST /compliance/overrides/:id/reject",

    "GET /trading/portfolios/:fundId/positions",

    "GET /trading/portfolios/:fundId/positions/summary",

    "POST /trading/portfolios/:fundId/positions/recalculate",

    "GET /trading/positions",

    "GET /trading/summary",

    "POST /trading/recalculate",

    "GET /trading/saved-views",

    "POST /trading/saved-views",

    "PATCH /trading/saved-views/:id",

    "DELETE /trading/saved-views/:id",

    "GET /simulation/runs",

    "POST /simulation/run",

    "GET /simulation/runs/:id",

    "GET /model-portfolios",

    "GET /model-portfolios/:id",

    "PATCH /model-portfolios/:id",

    "POST /model-portfolios/:id/activate",

    "POST /model-portfolios/:id/archive",

    "GET /model-portfolios/:id/drift",

    "POST /model-portfolios/:id/rebalance-recommendations",

    "POST /rebalance-runs/:id/convert-to-draft-orders",

    "GET /portfolio-folders",

    "POST /portfolio-folders",

    "GET /instruments/:id/market-context",

    "POST /trades/:id/confirm",

    "POST /trades/:id/settle",

  ])("registers %s", (route) => {

    expect(routes).toContain(route);

  });

});


