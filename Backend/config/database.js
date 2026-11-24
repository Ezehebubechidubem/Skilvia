
const { Pool } = require("pg");

// Ensure the database connection string exists
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is missing from the environment variables."
  );
}

// PostgreSQL connection configuration
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

// Monitor unexpected PostgreSQL connection errors
pool.on("error", (error) => {
  console.error(
    "Unexpected PostgreSQL connection error:",
    error.message
  );
});

// Connect and verify database availability
const connectDatabase = async () => {
  let client;

  try {
    client = await pool.connect();

    const result = await client.query(
      "SELECT NOW() AS current_time"
    );

    console.log("--------------------------------");
    console.log("SKILVIA DATABASE CONNECTED");
    console.log("--------------------------------");
    console.log(
      "Database time:",
      result.rows[0].current_time
    );

    return true;
  } catch (error) {
    console.error(
      "PostgreSQL connection failed:",
      error.message
    );

    throw error;
  } finally {
    if (client) {
      client.release();
    }
  }
};

// Close the database connection pool safely
const closeDatabase = async () => {
  try {
    await pool.end();
    console.log("PostgreSQL connection pool closed.");
  } catch (error) {
    console.error(
      "Database shutdown error:",
      error.message
    );

    throw error;
  }
};

// Export database functions
module.exports = {
  pool,
  connectDatabase,
  closeDatabase
};
