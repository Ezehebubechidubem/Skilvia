
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
// START SERVER
// =====================================

let isShuttingDown = false;

const startServer = async () => {
  try {
    await connectDatabase();

    await new Promise((resolve, reject) => {
      server.once("error", reject);

      server.listen(env.PORT, () => {
        server.removeListener("error", reject);
        resolve();
      });
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

    process.exit(1);
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

  console.log(`${signal} received. Shutting down SKILVIA...`);

  const forceExit = setTimeout(() => {
    console.error("Forced shutdown after timeout.");
    process.exit(1);
  }, 15000);

  forceExit.unref();

  try {
    await new Promise((resolve) => {
      io.close(() => resolve());
    });

    if (server.listening) {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    }

    await closeDatabase();

    clearTimeout(forceExit);

    console.log("SKILVIA shutdown completed.");

    process.exit(0);

  } catch (error) {
    console.error(
      "SKILVIA shutdown error:",
      error.message
    );

    process.exit(1);
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
