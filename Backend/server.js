
require("dotenv").config();

const env = require("./config/environment");

const express = require("express");
const http = require("http");
const morgan = require("morgan");
const { Server } = require("socket.io");

const {
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

const authRoutes = require("./routes/authRoutes");
const accountRoutes = require("./routes/accountRoutes");
const sessionRoutes = require("./routes/sessionRoutes");

// =====================================
// INITIALIZE APPLICATION
// =====================================

const app = express();
const server = http.createServer(app);

app.set("trust proxy", 1);
app.disable("x-powered-by");

// =====================================
// SOCKET.IO CONFIGURATION
// =====================================

const allowedOrigins = env.CLIENT_URL
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(
        new Error("Socket connection origin not allowed.")
      );
    },
    methods: ["GET", "POST"],
    credentials: true
  },
  transports: ["websocket", "polling"]
});

// =====================================
// SOCKET AUTHENTICATION
// =====================================

io.use(socketAuthenticate);

// =====================================
// SECURITY MIDDLEWARE
// =====================================

app.use(securityHeaders);
app.use(corsMiddleware);

// =====================================
// REQUEST BODY PARSING
// =====================================

app.use(express.json({ limit: "2mb" }));

app.use(
  express.urlencoded({
    extended: true,
    limit: "2mb"
  })
);

// =====================================
// REQUEST LOGGING
// =====================================

if (env.NODE_ENV !== "test") {
  app.use(morgan("combined"));
}

// =====================================
// API RATE LIMITING
// =====================================

app.use("/api", apiLimiter);

// =====================================
// HEALTH CHECK
// =====================================

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "SKILVIA API is running.",
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

// =====================================
// AUTHENTICATION ROUTES
// =====================================

app.use("/api/auth", authRoutes);

// =====================================
// ACCOUNT ROUTES
// =====================================

app.use("/api/account", accountRoutes);

// =====================================
// SESSION MANAGEMENT ROUTES
// =====================================

app.use("/api/sessions", sessionRoutes);

// =====================================
// SOCKET CONNECTION EVENTS
// =====================================

io.on("connection", (socket) => {
  console.log(
    `Authenticated socket connected: ${socket.id}`
  );

  console.log(
    `SKILVIA user connected: ${socket.auth.userId}`
  );

  socket.on("disconnect", (reason) => {
    console.log(
      `Socket disconnected: ${socket.id}. Reason: ${reason}`
    );
  });
});

// =====================================
// 404 HANDLER
// =====================================

app.use(notFoundHandler);

// =====================================
// GLOBAL ERROR HANDLER
// =====================================

app.use(errorHandler);

// =====================================
// SERVER STARTUP
// =====================================

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
    console.log("SKILVIA BACKEND");
    console.log("--------------------------------");
    console.log(`Server running on port ${env.PORT}`);
    console.log(`Environment: ${env.NODE_ENV}`);
    console.log(`API: http://localhost:${env.PORT}/api`);
    console.log(
      `Health: http://localhost:${env.PORT}/api/health`
    );
    console.log("--------------------------------");

  } catch (error) {
    console.error(
      "SKILVIA STARTUP FAILED:",
      error.message
    );

    await closeDatabase().catch(() => {});

    process.exitCode = 1;
  }
};

// =====================================
// GRACEFUL SHUTDOWN
// =====================================

const shutdown = async (signal) => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;

  console.log(
    `${signal} received. Shutting down SKILVIA...`
  );

  const forceExit = setTimeout(() => {
    console.error("Forced shutdown after timeout.");
    process.exit(1);
  }, 15000);

  forceExit.unref();

  try {
    // Closing Socket.IO also closes its HTTP server.
    await new Promise((resolve) => {
      io.close(() => resolve());
    });

    await closeDatabase();

    clearTimeout(forceExit);

    console.log("SKILVIA shutdown completed.");

  } catch (error) {
    console.error(
      "SKILVIA shutdown error:",
      error.message
    );

    process.exitCode = 1;

  } finally {
    clearTimeout(forceExit);
  }
};

// =====================================
// PROCESS SIGNAL HANDLERS
// =====================================

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// =====================================
// START APPLICATION
// =====================================

if (require.main === module) {
  startServer();
}

// =====================================
// EXPORT APPLICATION
// =====================================

module.exports = {
  app,
  server,
  io,
  startServer,
  shutdown
};
