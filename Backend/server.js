
require("dotenv").config();

const env = require("./config/environment");

const express = require("express");
const http = require("http");
const morgan = require("morgan");
const { Server } = require("socket.io");

const {
  pool,
  connectDatabase,
  closeDatabase
} = require("./config/database");

const {
  securityHeaders,
  corsMiddleware,
  apiLimiter
} = require("./middleware/security");

const {
  notFoundHandler,
  errorHandler
} = require("./middleware/errorHandler");

const socketAuthenticate = require("./middleware/socketAuthenticate");


// =====================================================
// SAFE DIAGNOSTIC LOGGING
// =====================================================

const logServerError = (event, error) => {
  console.error(JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    error_name: error?.name || "Error",
    error_code: error?.code || null
  }));
};


// =====================================================
// ROUTE IMPORTS
// =====================================================

const authRoutes = require("./routes/authRoutes");
const accountRoutes = require("./routes/accountRoutes");
const sessionRoutes = require("./routes/sessionRoutes");

const professionalRoutes = require("./routes/professionalRoutes");

const professionalVerificationRoutes =
  require("./routes/professionalVerificationRoutes");

const adminProfessionalVerificationRoutes =
  require("./routes/adminProfessionalVerificationRoutes");

const serviceRoutes = require("./routes/serviceRoutes");
const publicServiceRoutes = require("./routes/publicServiceRoutes");
const categoryRoutes = require("./routes/categoryRoutes");

const adminCategoryRoutes = require("./routes/adminCategoryRoutes");
const adminAuditRoutes = require("./routes/adminAuditRoutes");

const publicPlatformSettingsRoutes =
  require("./routes/publicPlatformSettingsRoutes");

const adminPlatformSettingsRoutes =
  require("./routes/adminPlatformSettingsRoutes");

const adminPermissionRoutes =
  require("./routes/adminPermissionRoutes");

const adminHierarchyRoutes =
  require("./routes/adminHierarchyRoutes");


// =====================================================
// EXPRESS APPLICATION
// =====================================================

const app = express();

const server = http.createServer(app);

app.disable("x-powered-by");

// Render runs behind a reverse proxy.
app.set("trust proxy", 1);


// =====================================================
// SOCKET.IO CONFIGURATION
// =====================================================

const allowedOrigins = (env.CLIENT_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(
        new Error("Socket connection origin is not allowed.")
      );
    },
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ["websocket", "polling"],
  allowEIO3: false
});

io.use(socketAuthenticate);


// =====================================================
// GLOBAL MIDDLEWARE
// =====================================================

app.use(securityHeaders);

app.use(corsMiddleware);

app.use(
  express.json({
    limit: "2mb"
  })
);

app.use(
  express.urlencoded({
    extended: false,
    limit: "2mb"
  })
);

// Log request paths without query-string values.
// This prevents tokens or other sensitive query parameters
// from accidentally appearing in Render logs.
morgan.token("safe-path", (req) => req.path);

if (env.NODE_ENV !== "test") {
  app.use(
    morgan(
      ":method :safe-path :status :res[content-length] - :response-time ms"
    )
  );
}

app.use("/api", apiLimiter);


// =====================================================
// HEALTH CHECK
// =====================================================

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    return res.status(200).json({
      success: true,
      message: "SKILVIA API is running.",
      database: "connected",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logServerError(
      "health_check_database_failed",
      error
    );

    return res.status(503).json({
      success: false,
      message: "SKILVIA service is temporarily unavailable.",
      database: "unavailable"
    });
  }
});


// =====================================================
// AUTHENTICATION ROUTES
// =====================================================

app.use("/api/auth", authRoutes);


// =====================================================
// ACCOUNT ROUTES
// =====================================================

app.use("/api/account", accountRoutes);


// =====================================================
// SESSION MANAGEMENT ROUTES
// =====================================================

app.use("/api/sessions", sessionRoutes);


// =====================================================
// PROFESSIONAL ROUTES
// =====================================================

app.use("/api/professionals", professionalRoutes);


// =====================================================
// PROFESSIONAL VERIFICATION ROUTES
// =====================================================

app.use(
  "/api/professional-verification",
  professionalVerificationRoutes
);


// =====================================================
// ADMIN PROFESSIONAL VERIFICATION ROUTES
// =====================================================

app.use(
  "/api/admin/professional-verification",
  adminProfessionalVerificationRoutes
);


// =====================================================
// PROFESSIONAL SERVICE MANAGEMENT
// =====================================================

app.use("/api/services", serviceRoutes);


// =====================================================
// PUBLIC SERVICE DISCOVERY
// =====================================================

app.use(
  "/api/discovery/services",
  publicServiceRoutes
);


// =====================================================
// PUBLIC CATEGORY ROUTES
// =====================================================

app.use("/api/categories", categoryRoutes);


// =====================================================
// PUBLIC PLATFORM SETTINGS
// =====================================================

app.use(
  "/api/settings",
  publicPlatformSettingsRoutes
);


// =====================================================
// ADMIN CATEGORY MANAGEMENT
// =====================================================

app.use(
  "/api/admin/categories",
  adminCategoryRoutes
);


// =====================================================
// ADMIN AUDIT LOGS
// =====================================================

app.use(
  "/api/admin/audit-logs",
  adminAuditRoutes
);


// =====================================================
// ADMIN PLATFORM SETTINGS
// =====================================================

app.use(
  "/api/admin/platform-settings",
  adminPlatformSettingsRoutes
);


// =====================================================
// ADMIN PERMISSION MANAGEMENT
// =====================================================

app.use(
  "/api/admin/permissions",
  adminPermissionRoutes
);


// =====================================================
// ADMIN HIERARCHY MANAGEMENT
// =====================================================

app.use(
  "/api/admin/hierarchy",
  adminHierarchyRoutes
);


// =====================================================
// SOCKET CONNECTION EVENTS
// =====================================================

io.on("connection", (socket) => {
  console.info(JSON.stringify({
    event: "socket_connected",
    timestamp: new Date().toISOString(),
    user_id: socket.auth.userId
  }));

  socket.on("disconnect", (reason) => {
    console.info(JSON.stringify({
      event: "socket_disconnected",
      timestamp: new Date().toISOString(),
      user_id: socket.auth.userId,
      reason
    }));
  });
});


// =====================================================
// ERROR HANDLING
// =====================================================

app.use(notFoundHandler);

app.use(errorHandler);


// =====================================================
// START SERVER
// =====================================================

let isShuttingDown = false;

const startServer = async () => {
  try {
    await connectDatabase();

    await new Promise((resolve, reject) => {
      const onError = (error) => {
        server.removeListener("listening", onListening);
        reject(error);
      };

      const onListening = () => {
        server.removeListener("error", onError);
        resolve();
      };

      server.once("error", onError);
      server.once("listening", onListening);

      server.listen(env.PORT);
    });

    console.info(JSON.stringify({
      event: "server_started",
      timestamp: new Date().toISOString(),
      port: env.PORT,
      environment: env.NODE_ENV
    }));
  } catch (error) {
    logServerError(
      "server_startup_failed",
      error
    );

    try {
      await closeDatabase();
    } catch (shutdownError) {
      logServerError(
        "startup_database_cleanup_failed",
        shutdownError
      );
    }

    process.exitCode = 1;
  }
};


// =====================================================
// GRACEFUL SHUTDOWN
// =====================================================

const shutdown = async (signal = "MANUAL") => {
  if (isShuttingDown) return;

  isShuttingDown = true;

  console.info(JSON.stringify({
    event: "server_shutdown_started",
    timestamp: new Date().toISOString(),
    signal
  }));

  const forceShutdownTimer = setTimeout(() => {
    console.error(JSON.stringify({
      event: "server_shutdown_timeout",
      timestamp: new Date().toISOString()
    }));

    process.exit(1);
  }, 15000);

  forceShutdownTimer.unref();

  try {
    await new Promise((resolve) => {
      io.close(() => resolve());
    });

    await closeDatabase();

    clearTimeout(forceShutdownTimer);

    console.info(JSON.stringify({
      event: "server_shutdown_completed",
      timestamp: new Date().toISOString()
    }));
  } catch (error) {
    logServerError(
      "server_shutdown_failed",
      error
    );

    clearTimeout(forceShutdownTimer);

    process.exitCode = 1;
  }
};


// =====================================================
// PROCESS SIGNAL HANDLERS
// =====================================================

process.once("SIGTERM", () => {
  shutdown("SIGTERM");
});

process.once("SIGINT", () => {
  shutdown("SIGINT");
});


// =====================================================
// START WHEN EXECUTED DIRECTLY
// =====================================================

if (require.main === module) {
  startServer();
}


// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  app,
  server,
  io,
  startServer,
  shutdown
};
