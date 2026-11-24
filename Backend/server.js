
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
// ROUTE IMPORTS
// =====================================================

const authRoutes = require("./routes/authRoutes");
const accountRoutes = require("./routes/accountRoutes");
const sessionRoutes = require("./routes/sessionRoutes");

const professionalRoutes = require("./routes/professionalRoutes");
const serviceRoutes = require("./routes/serviceRoutes");
const categoryRoutes = require("./routes/categoryRoutes");

const adminCategoryRoutes = require("./routes/adminCategoryRoutes");
const adminAuditRoutes = require("./routes/adminAuditRoutes");


// =====================================================
// EXPRESS APPLICATION
// =====================================================

const app = express();

const server = http.createServer(app);

app.disable("x-powered-by");

// Render runs behind a reverse proxy.
// Trust one proxy hop for forwarded client information.
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

if (env.NODE_ENV !== "test") {
  app.use(
    morgan(
      env.NODE_ENV === "production"
        ? "combined"
        : "dev"
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
    console.error(
      "Health check database error:",
      error.message
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
// PROFESSIONAL SERVICE ROUTES
// =====================================================

app.use("/api/services", serviceRoutes);


// =====================================================
// PUBLIC CATEGORY ROUTES
// =====================================================

app.use("/api/categories", categoryRoutes);


// =====================================================
// ADMIN CATEGORY MANAGEMENT
// =====================================================

app.use("/api/admin/categories", adminCategoryRoutes);


// =====================================================
// ADMIN AUDIT LOGS
// =====================================================

app.use("/api/admin/audit-logs", adminAuditRoutes);


// =====================================================
// SOCKET CONNECTION EVENTS
// =====================================================

io.on("connection", (socket) => {
  console.log(
    `Authenticated socket connected: ${socket.auth.userId}`
  );

  socket.on("disconnect", (reason) => {
    console.log(
      `Socket disconnected: ${socket.auth.userId}`,
      reason
    );
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

    console.log("--------------------------------");
    console.log("SKILVIA BACKEND STARTED");
    console.log("--------------------------------");
    console.log(`Port: ${env.PORT}`);
    console.log(`Environment: ${env.NODE_ENV}`);
    console.log("--------------------------------");

  } catch (error) {
    console.error(
      "SKILVIA startup failed:",
      error.message
    );

    try {
      await closeDatabase();
    } catch (shutdownError) {
      console.error(
        "Database cleanup failed:",
        shutdownError.message
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

  console.log(
    `\nSKILVIA shutdown started: ${signal}`
  );

  const forceShutdownTimer = setTimeout(() => {
    console.error(
      "Graceful shutdown timed out. Forcing process exit."
    );

    process.exit(1);
  }, 15000);

  forceShutdownTimer.unref();

  try {
    await new Promise((resolve) => {
      io.close(() => resolve());
    });

    await closeDatabase();

    clearTimeout(forceShutdownTimer);

    console.log("SKILVIA shutdown completed.");

  } catch (error) {
    console.error(
      "SKILVIA shutdown error:",
      error.message
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
