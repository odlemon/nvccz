// @ts-nocheck
import express from "express"
import cors from "cors"
import helmet from "helmet"
import dotenv from "dotenv"
import swaggerUi from "swagger-ui-express"
import { errorMiddleware } from "./middleware/error"
import { dbConnection } from "./utils/database"
import { envConfig } from "./utils/env"
import { logger } from "./utils/logger"
import { specs } from "./config/swagger"
import authRoutes from "./routes/authRoutes"
import roleRoutes from "./routes/roleRoutes"
import userRoutes from "./routes/userRoutes"
import postRoutes from "./routes/postRoutes"
import newsletterRoutes from "./routes/newsletterRoutes"
import eventRoutes from "./routes/eventRoutes"
import homepageRoutes from "./routes/homepageRoutes"

dotenv.config()

const app = express()
const port = process.env.PORT || 3000

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "blob:"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https:"],
      frameSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      manifestSrc: ["'self'"],
    },
  },
}))
app.use(cors({
  origin: true, // Allow all origins
  credentials: true
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get("User-Agent"),
  })
  next()
})

// Serve Swagger UI static files
app.use('/swagger-ui', express.static(require('swagger-ui-dist').getAbsoluteFSPath()));

// Test endpoint to verify static files are served
app.get('/test-static', (req, res) => {
  res.json({
    message: 'Static files test',
    swaggerPath: require('swagger-ui-dist').getAbsoluteFSPath(),
    files: [
      '/swagger-ui/swagger-ui.css',
      '/swagger-ui/swagger-ui-bundle.js',
      '/swagger-ui/swagger-ui-standalone-preset.js'
    ]
  });
});

// Custom Swagger UI setup with inline CSS and JS
app.get('/api-docs', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>API Documentation</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <link rel="stylesheet" type="text/css" href="/swagger-ui/swagger-ui.css" />
      <style>
        html { box-sizing: border-box; overflow: -moz-scrollbars-vertical; overflow-y: scroll; }
        *, *:before, *:after { box-sizing: inherit; }
        body { margin:0; background: #fafafa; }
        .swagger-ui .topbar { display: none; }
        .swagger-ui .info .title { color: #3b4151; }
        .swagger-ui .info .title small { color: #606060; }
      </style>
    </head>
    <body>
      <div id="swagger-ui"></div>
      <script src="/swagger-ui/swagger-ui-bundle.js"></script>
      <script src="/swagger-ui/swagger-ui-standalone-preset.js"></script>
      <script>
        window.onload = function() {
          const ui = SwaggerUIBundle({
            spec: ${JSON.stringify(specs)},
            dom_id: '#swagger-ui',
            deepLinking: true,
            presets: [
              SwaggerUIBundle.presets.apis,
              SwaggerUIStandalonePreset
            ],
            plugins: [
              SwaggerUIBundle.plugins.DownloadUrl
            ],
            layout: "StandaloneLayout",
            persistAuthorization: true,
            displayRequestDuration: true,
            filter: true,
            showRequestHeaders: true,
            docExpansion: 'list',
            defaultModelsExpandDepth: 1,
            defaultModelExpandDepth: 1,
            tryItOutEnabled: true,
            requestInterceptor: function(request) {
              return request;
            },
            responseInterceptor: function(response) {
              return response;
            }
          });
        };
      </script>
    </body>
    </html>
  `);
});

// Completely self-contained Swagger UI (no external dependencies)
app.get('/docs', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>API Documentation</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        html { box-sizing: border-box; overflow: -moz-scrollbars-vertical; overflow-y: scroll; }
        *, *:before, *:after { box-sizing: inherit; }
        body { margin:0; background: #fafafa; }
        .swagger-ui .topbar { display: none; }
        .swagger-ui .info .title { color: #3b4151; }
        .swagger-ui .info .title small { color: #606060; }
      </style>
      <link rel="stylesheet" type="text/css" href="/swagger-ui/swagger-ui.css" />
    </head>
    <body>
      <div id="swagger-ui"></div>
      <script src="/swagger-ui/swagger-ui-bundle.js"></script>
      <script src="/swagger-ui/swagger-ui-standalone-preset.js"></script>
      <script>
        window.onload = function() {
          const ui = SwaggerUIBundle({
            spec: ${JSON.stringify(specs)},
            dom_id: '#swagger-ui',
            deepLinking: true,
            presets: [
              SwaggerUIBundle.presets.apis,
              SwaggerUIStandalonePreset
            ],
            plugins: [
              SwaggerUIBundle.plugins.DownloadUrl
            ],
            layout: "StandaloneLayout",
            persistAuthorization: true,
            displayRequestDuration: true,
            filter: true,
            showRequestHeaders: true,
            docExpansion: 'list',
            defaultModelsExpandDepth: 1,
            defaultModelExpandDepth: 1,
            tryItOutEnabled: true
          });
        };
      </script>
    </body>
    </html>
  `);
});

// Serve Swagger JSON
app.get('/api-docs/swagger.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json(specs);
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    environment: envConfig.get("NODE_ENV"),
    database: "connected", // Prisma handles connection status
  })
})

// Database test endpoint
app.get("/test-db", async (req, res) => {
  try {
    const prisma = dbConnection.getPrismaClient();
    await prisma.$connect();
    
    // Try a simple query
    const userCount = await prisma.user.count();
    
    res.status(200).json({
      success: true,
      message: "Database connection successful",
      userCount: userCount,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Database connection failed",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
})

// Auth routes
app.use("/api/auth", authRoutes)

// Role management routes
app.use("/api/roles", roleRoutes)

// User management routes
app.use("/api/users", userRoutes)

// Homepage features routes
app.use("/api/posts", postRoutes)
app.use("/api/newsletters", newsletterRoutes)
app.use("/api/events", eventRoutes)
app.use("/api/homepage", homepageRoutes)

app.use(errorMiddleware)

const startServer = async (): Promise<void> => {
  try {
    await dbConnection.connect()

    app.listen(port, () => {
      logger.info(`🚀 Server running on port ${port}`, {
        environment: envConfig.get("NODE_ENV"),
        port: port,
      })
      logger.info(`📚 API Documentation available at http://localhost:${port}/api-docs`)
    })
  } catch (error: any) {
    logger.error("Failed to start server", { error: error.message })
    process.exit(1)
  }
}

const gracefulShutdown = async (signal: string): Promise<void> => {
  logger.info(`Received ${signal}. Shutting down gracefully...`)

  try {
    await dbConnection.disconnect()
    logger.info("Server shut down successfully")
    process.exit(0)
  } catch (error: any) {
    logger.error("Error during shutdown", { error: error.message })
    process.exit(1)
  }
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"))
process.on("SIGINT", () => gracefulShutdown("SIGINT"))

// Start the server
startServer()

export default app
