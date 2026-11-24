
require("dotenv").config();

const { z } = require("zod");

// Environment variable validation schema
const environmentSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(5000),

  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required"),

  DATABASE_SSL_REJECT_UNAUTHORIZED: z
    .enum(["true", "false"])
    .default("true"),

  CLIENT_URL: z.string().default(""),

  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must contain at least 32 characters"),

  JWT_ACCESS_EXPIRES_IN: z
    .string()
    .default("15m"),

  JWT_REFRESH_SECRET: z
    .string()
    .min(32, "JWT_REFRESH_SECRET must contain at least 32 characters"),

  JWT_REFRESH_EXPIRES_IN: z
    .string()
    .default("7d"),

  BCRYPT_SALT_ROUNDS: z.coerce
    .number()
    .int()
    .min(10)
    .max(15)
    .default(12),

  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  FLUTTERWAVE_PUBLIC_KEY: z.string().optional(),
  FLUTTERWAVE_SECRET_KEY: z.string().optional(),
  FLUTTERWAVE_ENCRYPTION_KEY: z.string().optional(),
  FLUTTERWAVE_WEBHOOK_HASH: z.string().optional()
});

// Validate environment variables
const result = environmentSchema.safeParse(process.env);

if (!result.success) {
  console.error("SKILVIA ENVIRONMENT CONFIGURATION ERROR:");

  for (const issue of result.error.issues) {
    console.error(`- ${issue.path.join(".")}: ${issue.message}`);
  }

  process.exit(1);
}

const env = Object.freeze(result.data);

// Ensure Cloudinary credentials are supplied together
const cloudinaryCredentials = [
  env.CLOUDINARY_CLOUD_NAME,
  env.CLOUDINARY_API_KEY,
  env.CLOUDINARY_API_SECRET
];

if (
  cloudinaryCredentials.some(Boolean) &&
  !cloudinaryCredentials.every(Boolean)
) {
  throw new Error(
    "All Cloudinary environment variables must be configured together."
  );
}

// Export validated configuration
module.exports = env;
