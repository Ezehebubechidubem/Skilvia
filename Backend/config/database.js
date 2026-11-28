const { Pool } = require("pg");
const { runMigrations } = require("../database/migrate");

// =====================================================
// DATABASE ENVIRONMENT VALIDATION
// =====================================================

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is missing from the environment variables."
  );
}


// =====================================================
// SAFE DATABASE LOGGING
// =====================================================

const logDatabaseEvent = (event, details = {}) => {
  console.info(JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    ...details
  }));
};

const getSafeErrorDetails = (error) => ({
  error_code: error?.code || null,
  error_message: String(
    error?.message || "Unknown database error."
  )
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URL]")
    .slice(0, 500)
});


// =====================================================
// POSTGRESQL CONNECTION POOL
// =====================================================

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  // Require encrypted connections in production.
  // Certificate verification remains enabled by default.
  ssl:
    process.env.NODE_ENV === "production"
      ? {
          rejectUnauthorized:
            process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false"
        }
      : false,

  // Connection pool limits
  max: 10,
  min: 0,

  // Connection timeouts
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,

  // Query protection
  query_timeout: 15000,
  statement_timeout: 15000,

  // Prevent indefinite waiting for an idle connection
  allowExitOnIdle: false
});


// =====================================================
// POOL ERROR HANDLING
// =====================================================

pool.on("error", (error) => {
  logDatabaseEvent(
    "unexpected_database_pool_error",
    getSafeErrorDetails(error)
  );
});


// =====================================================
// CONNECT AND INITIALIZE DATABASE
// =====================================================

const connectDatabase = async () => {
  let client;

  try {
    client = await pool.connect();

    // Verify that PostgreSQL is reachable.
    const result = await client.query(
      "SELECT NOW() AS current_time"
    );

    logDatabaseEvent("database_connection_verified", {
      database_time: result.rows[0].current_time
    });

    // Apply pending SQL migrations before the API starts.
    // The migration runner uses this same database connection.
    await runMigrations(client);

    logDatabaseEvent("database_startup_completed", {
      schema: "public",
      migrations: "completed"
    });

    return true;
  } catch (error) {
    logDatabaseEvent(
      "database_startup_failed",
      getSafeErrorDetails(error)
    );

    throw error;
  } finally {
    if (client) {
      client.release();
    }
  }
};


// =====================================================
// CLOSE DATABASE CONNECTION POOL
// =====================================================

const closeDatabase = async () => {
  try {
    await pool.end();

    logDatabaseEvent("database_connection_pool_closed");
  } catch (error) {
    logDatabaseEvent(
      "database_shutdown_failed",
      getSafeErrorDetails(error)
    );

    throw error;
  }
};


// =====================================================
// EXPORT DATABASE FUNCTIONS
// =====================================================

module.exports = {
  pool,
  connectDatabase,
  closeDatabase
};