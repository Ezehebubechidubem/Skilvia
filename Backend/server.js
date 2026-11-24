
require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const { Server } = require("socket.io");

// Initialize Express
const app = express();

// Create HTTP server
const server = http.createServer(app);

// Configure allowed frontend origins
const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(",").map(origin => origin.trim())
  : [];

const originChecker = (origin, callback) => {
  if (
    !origin ||
    allowedOrigins.length === 0 ||
    allowedOrigins.includes(origin)
  ) {
    return callback(null, true);
  }

  return callback(new Error("Origin not allowed by CORS"));
};

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: originChecker,
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Trust Render's reverse proxy
app.set("trust proxy", 1);

// Disable Express identification header
app.disable("x-powered-by");

// Security middleware
app.use(helmet());

// CORS middleware
app.use(
  cors({
    origin: originChecker,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"]
  })
);

// Request body parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// HTTP request logging
app.use(morgan("dev"));

// API rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please try again later."
  }
});

app.use("/api", apiLimiter);

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Skillvia API is running",
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString()
  });
});

// Socket.IO connection event
io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found"
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Server error:", err.message);

  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.status || err.statusCode || 500;

  res.status(statusCode).json({
    success: false,
    message:
      process.env.NODE_ENV === "production"
        ? "An internal server error occurred"
        : err.message
  });
});

// Server port
const PORT = process.env.PORT || 5000;

// Start server
server.listen(PORT, () => {
  console.log("--------------------------------");
  console.log("SKILVIA BACKEND");
  console.log("--------------------------------");
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`API: http://localhost:${PORT}/api`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
  console.log("--------------------------------");
});

// Graceful shutdown
const shutdown = (signal) => {
  console.log(`${signal} received. Shutting down server...`);

  server.close(() => {
    console.log("HTTP server closed.");
    process.exit(0);
  });
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Export application objects
module.exports = {
  app,
  server,
  io
};
