const { z } = require("zod");

// =====================================
// SHARED REQUEST STRUCTURE
// =====================================

const requestSchema = (bodySchema) =>
  z.object({
    body: bodySchema,
    params: z.unknown(),
    query: z.unknown()
  });

// =====================================
// 1. REGISTRATION VALIDATION
// =====================================

const registerSchema = requestSchema(
  z.object({
    full_name: z
      .string()
      .trim()
      .min(2, "Full name must contain at least 2 characters.")
      .max(100, "Full name cannot exceed 100 characters."),

    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Please provide a valid email address.")
      .max(254, "Email address is too long."),

    phone: z
      .string()
      .trim()
      .min(7, "Phone number is too short.")
      .max(32, "Phone number is too long.")
      .regex(
        /^[+0-9()\-\s]+$/,
        "Please provide a valid phone number."
      )
      .optional(),

    password: z
      .string()
      .min(8, "Password must contain at least 8 characters.")
      .max(256, "Password is too long."),

    role: z
      .enum(["customer", "professional"])
      .default("customer")
  }).strict()
);

// =====================================
// 2. LOGIN VALIDATION
// =====================================

const loginSchema = requestSchema(
  z.object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Please provide a valid email address.")
      .max(254, "Email address is too long."),

    password: z
      .string()
      .min(1, "Password is required.")
      .max(256, "Password is too long.")
  }).strict()
);

// =====================================
// 3. REFRESH TOKEN VALIDATION
// =====================================

const refreshTokenSchema = requestSchema(
  z.object({
    refreshToken: z
      .string()
      .min(1, "Refresh token is required.")
      .max(4096, "Invalid refresh token.")
  }).strict()
);

// =====================================
// 4. LOGOUT VALIDATION
// =====================================

const logoutSchema = requestSchema(
  z.object({
    refreshToken: z
      .string()
      .min(1, "Refresh token is required.")
      .max(4096, "Invalid refresh token.")
  }).strict()
);

// =====================================
// EXPORT VALIDATION SCHEMAS
// =====================================

module.exports = {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  logoutSchema
};