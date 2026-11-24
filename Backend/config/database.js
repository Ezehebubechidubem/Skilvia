const { Pool } = require("pg");

// PostgreSQL connection configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,

  // Render PostgreSQL requires SSL for external connections.
  ssl:
    process.env.NODE_ENV === "production"
      ? {
          rejectUnauthorized: false
        }
      : false,

  // Connection pool configuration
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

// Monitor unexpected database errors
pool.on("error", (error) => {
  console.error(
    "Unexpected PostgreSQL connection error:",
    error.message
  );
});

// Test and initialize database connection
const connectDatabase = async () => {
  try {
    const client = await pool.connect();

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

    client.release();

    return true;
  } catch (error) {
    console.error(
      "PostgreSQL connection failed:",
      error.message
    );

    throw error;
  }
};

// Export database connection
module.exports = {
  pool,
  connectDatabase
};