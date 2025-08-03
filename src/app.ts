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

// Serve static files from public directory
app.use(express.static('public'));

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

// Interactive Swagger UI setup
app.get('/api-docs', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Interactive API Documentation</title>
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
    </head>
    <body>
      <div id="swagger-ui"></div>
      <script>
        // Load Swagger UI CSS dynamically
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = '/swagger-ui/swagger-ui.css';
        document.head.appendChild(link);
        
        // Load Swagger UI JS
        const script1 = document.createElement('script');
        script1.src = '/swagger-ui/swagger-ui-bundle.js';
        script1.onload = function() {
          const script2 = document.createElement('script');
          script2.src = '/swagger-ui/swagger-ui-standalone-preset.js';
          script2.onload = function() {
            // Initialize Swagger UI
            fetch('/api-docs/swagger.json')
              .then(response => response.json())
              .then(spec => {
                const ui = SwaggerUIBundle({
                  spec: spec,
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
              });
          };
          document.head.appendChild(script2);
        };
        document.head.appendChild(script1);
      </script>
    </body>
    </html>
  `);
});

// Interactive documentation route (backup)
app.get('/swagger', (req, res) => {
  res.sendFile('public/swagger-interactive.html', { root: '.' });
});

// Alternative documentation route (static view)
app.get('/docs', (req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>API Documentation - Alternative</title>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .endpoint { border: 1px solid #ddd; margin: 10px 0; padding: 15px; border-radius: 5px; background: white; }
        .method { font-weight: bold; color: #fff; padding: 3px 8px; border-radius: 3px; display: inline-block; margin-right: 10px; }
        .get { background: #61affe; }
        .post { background: #49cc90; }
        .put { background: #fca130; }
        .delete { background: #f93e3e; }
        .path { font-family: monospace; font-size: 16px; }
        .description { margin-top: 10px; color: #666; }
        .auth { background: #ffeb3b; padding: 2px 6px; border-radius: 3px; font-size: 12px; }
        h1 { color: #333; border-bottom: 2px solid #61affe; padding-bottom: 10px; }
        h2 { color: #555; margin-top: 30px; }
        .section { margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>API Documentation</h1>
        <p>Complete API reference for the ERP System</p>
        
        <div class="section">
          <h2>🔐 Authentication</h2>
          <div class="endpoint">
            <span class="method post">POST</span>
            <span class="path">/api/auth/login</span>
            <div class="description">Login with email and password to get JWT token</div>
          </div>
        </div>
        
        <div class="section">
          <h2>👥 Users</h2>
          <div class="endpoint">
            <span class="method get">GET</span>
            <span class="path">/api/users</span>
            <span class="auth">Auth Required</span>
            <div class="description">Get all users with pagination</div>
          </div>
          <div class="endpoint">
            <span class="method post">POST</span>
            <span class="path">/api/users</span>
            <span class="auth">Admin Only</span>
            <div class="description">Create a new user</div>
          </div>
        </div>
        
        <div class="section">
          <h2>📝 Posts</h2>
          <div class="endpoint">
            <span class="method get">GET</span>
            <span class="path">/api/posts</span>
            <span class="auth">Auth Required</span>
            <div class="description">Get all posts with replies</div>
          </div>
          <div class="endpoint">
            <span class="method post">POST</span>
            <span class="path">/api/posts</span>
            <span class="auth">Auth Required</span>
            <div class="description">Create a new post</div>
          </div>
          <div class="endpoint">
            <span class="method post">POST</span>
            <span class="path">/api/posts/{id}/replies</span>
            <span class="auth">Auth Required</span>
            <div class="description">Add reply to a post</div>
          </div>
        </div>
        
        <div class="section">
          <h2>📰 Newsletters</h2>
          <div class="endpoint">
            <span class="method get">GET</span>
            <span class="path">/api/newsletters</span>
            <span class="auth">Auth Required</span>
            <div class="description">Get all newsletters</div>
          </div>
          <div class="endpoint">
            <span class="method post">POST</span>
            <span class="path">/api/newsletters</span>
            <span class="auth">Admin Only</span>
            <div class="description">Create a new newsletter</div>
          </div>
        </div>
        
        <div class="section">
          <h2>📅 Events</h2>
          <div class="endpoint">
            <span class="method get">GET</span>
            <span class="path">/api/events</span>
            <span class="auth">Auth Required</span>
            <div class="description">Get all events</div>
          </div>
          <div class="endpoint">
            <span class="method post">POST</span>
            <span class="path">/api/events</span>
            <span class="auth">Admin Only</span>
            <div class="description">Create a new event</div>
          </div>
        </div>
        
        <div class="section">
          <h2>🏠 Homepage</h2>
          <div class="endpoint">
            <span class="method get">GET</span>
            <span class="path">/api/homepage</span>
            <span class="auth">Auth Required</span>
            <div class="description">Get homepage data (posts, events, newsletters, online activity)</div>
          </div>
        </div>
        
        <div class="section">
          <h2>🔔 Notifications</h2>
          <div class="endpoint">
            <span class="method get">GET</span>
            <span class="path">/api/homepage/notifications</span>
            <span class="auth">Auth Required</span>
            <div class="description">Get user notifications</div>
          </div>
        </div>
        
        <p><a href="/api-docs/swagger.json">📄 View Full API Specification (JSON)</a></p>
        <p><a href="/test-static">🧪 Test Static Files</a></p>
      </div>
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
