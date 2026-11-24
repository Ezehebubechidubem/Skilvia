
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
// 1. EMAIL VERIFICATION
// =====================================

const verifyEmailSchema = requestSchema(
  z.object({
    token: z
      .string()
      .min(20, "Verification token is required.")
      .max(200, "Invalid verification token.")
  }).strict()
);

// =====================================
// 2. RESEND EMAIL VERIFICATION
// =====================================

const resendVerificationSchema = requestSchema(
  z.object({}).strict()
);

// =====================================
// 3. REQUEST PASSWORD RESET
// =====================================

const requestPasswordResetSchema = requestSchema(
  z.object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Please provide a valid email address.")
      .max(254, "Email address is too long.")
  }).strict()
);

// =====================================
// 4. COMPLETE PASSWORD RESET
// =====================================

const resetPasswordSchema = requestSchema(
  z.object({
    token: z
      .string()
      .min(20, "Password reset token is required.")
      .max(200, "Invalid password reset token."),

    newPassword: z
      .string()
      .min(8, "Password must contain at least 8 characters.")
      .max(256, "Password is too long.")
  }).strict()
);

// =====================================
// 5. CHANGE PASSWORD WHILE LOGGED IN
// =====================================

const changePasswordSchema = requestSchema(
  z.object({
    currentPassword: z
      .string()
      .min(1, "Current password is required.")
      .max(256, "Password is too long."),

    newPassword: z
      .string()
      .min(8, "New password must contain at least 8 characters.")
      .max(256, "Password is too long.")
  }).strict().refine(
    (data) => data.currentPassword !== data.newPassword,
    {
      message: "Your new password must be different from your current password.",
      path: ["newPassword"]
    }
  )
);

// =====================================
// EXPORT VALIDATION SCHEMAS
// =====================================

module.exports = {
  verifyEmailSchema,
  resendVerificationSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  changePasswordSchema
};
