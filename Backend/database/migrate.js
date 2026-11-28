const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const MIGRATIONS_DIRECTORY = path.join(
  __dirname,
  "migrations"
);

const MIGRATION_LOCK_KEY = 731904261;

const logMigration = (event, details = {}) => {
  console.info(JSON.stringify({
    event,
    timestamp: new Date().toISOString(),
    ...details
  }));
};

const sanitizeDatabaseMessage = (message) => {
  if (typeof message !== "string") {
    return "Unknown PostgreSQL migration error.";
  }

  return message
    .replace(/\([^)]+\)=\([^)]+\)/g, "([column])=([redacted])")
    .replace(/DETAIL:\s*.+/gi, "DETAIL: [redacted]")
    .slice(0, 500);
};

const getMigrationFiles = () => {
  if (!fs.existsSync(MIGRATIONS_DIRECTORY)) {
    throw new Error("Database migrations directory is missing.");
  }

  return fs.readdirSync(MIGRATIONS_DIRECTORY)
    .filter((filename) => /^\d+_[a-z0-9_-]+\.sql$/i.test(filename))
    .sort((a, b) => {
      const aNumber = Number(a.match(/^\d+/)[0]);
      const bNumber = Number(b.match(/^\d+/)[0]);

      return aNumber - bNumber || a.localeCompare(b);
    });
};

const normalizeMigrationSql = (sql) => {
  // The migration runner manages transactions itself.
  // Remove transaction wrappers already present in SQL files.
  return sql.replace(
    /^\s*(BEGIN|COMMIT)\s*;\s*$/gim,
    ""
  );
};

const hasUntrackedApplicationSchema = async (client) => {
  const result = await client.query(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name IN (
          'users',
          'refresh_tokens',
          'email_verification_tokens',
          'password_reset_tokens',
          'professional_profiles',
          'service_categories',
          'professional_services',
          'admin_audit_logs',
          'platform_settings',
          'admin_permissions',
          'professional_verification_applications'
        )
    ) AS has_application_tables
  `);

  return result.rows[0].has_application_tables === true;
};

const runMigrations = async (client) => {
  let lockAcquired = false;

  try {
    // Ensure migrations run in the expected schema.
    const schemaResult = await client.query(
      "SELECT current_schema() AS schema_name"
    );

    if (schemaResult.rows[0]?.schema_name !== "public") {
      throw new Error(
        "SKILVIA migrations require the PostgreSQL public schema. Check the database search_path."
      );
    }

    // Prevent two application instances from migrating simultaneously.
    await client.query(
      "SELECT pg_advisory_lock($1)",
      [MIGRATION_LOCK_KEY]
    );

    lockAcquired = true;

    // Check whether migration history already exists.
    const ledgerExistsResult = await client.query(
      "SELECT to_regclass('public.skilvia_schema_migrations') IS NOT NULL AS exists"
    );

    const ledgerExists =
      ledgerExistsResult.rows[0]?.exists === true;

    if (!ledgerExists) {
      const hasExistingSchema =
        await hasUntrackedApplicationSchema(client);

      // Never blindly apply migrations to an existing database
      // without migration history.
      if (hasExistingSchema) {
        throw new Error(
          "SKILVIA found existing application tables but no migration history. Automatic migration stopped to protect existing data; reconcile the database migration history before retrying."
        );
      }

      await client.query(`
        CREATE TABLE public.skilvia_schema_migrations (
          filename VARCHAR(255) PRIMARY KEY,
          checksum CHAR(64) NOT NULL,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      logMigration("database_migration_ledger_created");
    }

    // Load previously applied migrations.
    const appliedResult = await client.query(`
      SELECT filename, checksum
      FROM public.skilvia_schema_migrations
    `);

    const applied = new Map(
      appliedResult.rows.map((row) => [
        row.filename,
        row.checksum.trim()
      ])
    );

    const migrationFiles = getMigrationFiles();

    // Execute migrations in numerical order.
    for (const filename of migrationFiles) {
      const migrationPath = path.join(
        MIGRATIONS_DIRECTORY,
        filename
      );

      const source = fs.readFileSync(
        migrationPath,
        "utf8"
      );

      const checksum = crypto
        .createHash("sha256")
        .update(source)
        .digest("hex");

      // Verify previously applied migrations have not changed.
      if (applied.has(filename)) {
        if (applied.get(filename) !== checksum) {
          throw new Error(
            `Applied migration checksum mismatch for ${filename}. Do not edit an already-applied migration; create a new forward migration instead.`
          );
        }

        continue;
      }

      const migrationSql = normalizeMigrationSql(source).trim();

      if (!migrationSql) {
        throw new Error(
          `Migration ${filename} is empty after transaction normalization.`
        );
      }

      // Each migration and its history entry must succeed together.
      await client.query("BEGIN");

      try {
        await client.query(migrationSql);

        await client.query(
          `INSERT INTO public.skilvia_schema_migrations
             (filename, checksum)
           VALUES ($1, $2)`,
          [filename, checksum]
        );

        await client.query("COMMIT");

        logMigration("database_migration_applied", {
          migration: filename
        });
      } catch (error) {
        await client.query("ROLLBACK");

        logMigration("database_migration_failed", {
          migration: filename,
          error_code: error.code || null,
          error_message: sanitizeDatabaseMessage(error.message)
        });

        throw new Error(
          `Database migration ${filename} failed: ${sanitizeDatabaseMessage(error.message)}`
        );
      }
    }

    // Confirm that essential SKILVIA tables exist.
    const requiredTablesResult = await client.query(`
      SELECT
        to_regclass('public.users') IS NOT NULL AS users,
        to_regclass('public.refresh_tokens') IS NOT NULL AS refresh_tokens,
        to_regclass('public.professional_profiles') IS NOT NULL AS professional_profiles,
        to_regclass('public.service_categories') IS NOT NULL AS service_categories
    `);

    const requiredTables = requiredTablesResult.rows[0];

    if (
      !requiredTables.users ||
      !requiredTables.refresh_tokens ||
      !requiredTables.professional_profiles ||
      !requiredTables.service_categories
    ) {
      throw new Error(
        "Database migrations finished without all required SKILVIA core tables."
      );
    }

    logMigration("database_migrations_completed", {
      migration_count: migrationFiles.length,
      applied_migration_count: migrationFiles.filter(
        (filename) => !applied.has(filename)
      ).length,
      schema: "public"
    });

    return true;
  } finally {
    // Always release the PostgreSQL advisory lock.
    if (lockAcquired) {
      try {
        await client.query(
          "SELECT pg_advisory_unlock($1)",
          [MIGRATION_LOCK_KEY]
        );
      } catch (error) {
        logMigration("database_migration_lock_release_failed", {
          error_code: error.code || null
        });
      }
    }
  }
};

module.exports = {
  runMigrations
};