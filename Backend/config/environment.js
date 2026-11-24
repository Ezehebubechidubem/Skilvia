
require("dotenv").config();

const { z } = require("zod");

// =====================================
// ENVIRONMENT VALIDATION SCHEMA
// =====================================

const environmentSchema = z.object({

  // SERVER
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(5000),

  // DATABASE
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required."),

  DATABASE_SSL_REJECT_UNAUTHORIZED: z
    .enum(["true", "false"])
    .default("true"),

  // FRONTEND AND CORS
  CLIENT_URL: z
    .string()
    .default(""),

  FRONTEND_URL: z
    .string()
    .url("FRONTEND_URL must be a valid URL.")
    .default("http://localhost:3000"),

  // JWT AUTHENTICATION
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must contain at least 32 characters."),

  JWT_ACCESS_EXPIRES_IN: z
    .string()
    .default("15m"),

  JWT_REFRESH_SECRET: z
    .string()
    .min(32, "JWT_REFRESH_SECRET must contain at least 32 characters."),

  JWT_REFRESH_EXPIRES_IN: z
    .string()
    .default("7d"),

  // PASSWORD SECURITY
  BCRYPT_SALT_ROUNDS: z.coerce
    .number()
    .int()
    .min(10)
    .max(15)
    .default(12),

  // CLOUDINARY
  CLOUDINARY_CLOUD_NAME: z
    .string()
    .optional(),

  CLOUDINARY_API_KEY: z
    .string()
    .optional(),

  CLOUDINARY_API_SECRET: z
    .string()
    .optional(),

  // FLUTTERWAVE
  FLUTTERWAVE_PUBLIC_KEY: z
    .string()
    .optional(),

  FLUTTERWAVE_SECRET_KEY: z
    .string()
    .optional(),

  FLUTTERWAVE_ENCRYPTION_KEY: z
    .string()
    .optional(),

  FLUTTERWAVE_WEBHOOK_HASH: z
    .string()
    .optional(),

  // RESEND EMAIL
  RESEND_API_KEY: z
    .string()
    .optional(),

  RESEND_FROM_EMAIL: z
    .string()
    .optional(),

  RESEND_REPLY_TO: z
    .string()
    .optional()

});

// =====================================
// VALIDATE ENVIRONMENT VARIABLES
// =====================================

const result = environmentSchema.safeParse(process.env);

if (!result.success) {
  console.error("\nSKILVIA ENVIRONMENT CONFIGURATION ERROR:\n");

  for (const issue of result.error.issues) {
    console.error(
      `- ${issue.path.join(".")}: ${issue.message}`
    );
  }

  process.exit(1);
}

const env = result.data;

// =====================================
// CHECK JWT SECRET SEPARATION
// =====================================

if (env.JWT_SECRET === env.JWT_REFRESH_SECRET) {
  console.error(
    "JWT_SECRET and JWT_REFRESH_SECRET must be different."
  );

  process.exit(1);
}

// =====================================
// CHECK PRODUCTION FRONTEND URL
// =====================================

if (env.NODE_ENV === "production") {
  if (!env.FRONTEND_URL.startsWith("https://")) {
    console.error(
      "Production FRONTEND_URL must use HTTPS."
    );

    process.exit(1);
  }

  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    console.error(
      "Production requires RESEND_API_KEY and RESEND_FROM_EMAIL."
    );

    process.exit(1);
  }
}

// =====================================
// CHECK CLOUDINARY CONFIGURATION
// =====================================

const cloudinaryCredentials = [
  env.CLOUDINARY_CLOUD_NAME,
  env.CLOUDINARY_API_KEY,
  env.CLOUDINARY_API_SECRET
];

if (
  cloudinaryCredentials.some(Boolean) &&
  !cloudinaryCredentials.every(Boolean)
) {
  console.error(
    "All three Cloudinary credentials must be configured together."
  );

  process.exit(1);
}

// =====================================
// CHECK FLUTTERWAVE CONFIGURATION
// =====================================

const flutterwaveCredentials = [
  env.FLUTTERWAVE_PUBLIC_KEY,
  env.FLUTTERWAVE_SECRET_KEY,
  env.FLUTTERWAVE_ENCRYPTION_KEY,
  env.FLUTTERWAVE_WEBHOOK_HASH
];

if (
  flutterwaveCredentials.some(Boolean) &&
  !flutterwaveCredentials.every(Boolean)
) {
  console.error(
    "All four Flutterwave credentials must be configured together."
  );

  process.exit(1);
}

// =====================================
// CHECK RESEND CONFIGURATION
// =====================================

if (
  Boolean(env.RESEND_API_KEY) !==
  Boolean(env.RESEND_FROM_EMAIL)
) {
  console.error(
    "RESEND_API_KEY and RESEND_FROM_EMAIL must be configured together."
  );

  process.exit(1);
}

if (
  env.RESEND_REPLY_TO &&
  !z.string().email().safeParse(env.RESEND_REPLY_TO).success
) {
  console.error(
    "RESEND_REPLY_TO must be a valid email address."
  );

  process.exit(1);
}

// =====================================
// EXPORT VALIDATED CONFIGURATION
// =====================================

module.exports = Object.freeze(env);
