
const { z } = require("zod");

// =====================================
// REQUEST SCHEMA HELPER
// =====================================

const requestSchema = (bodySchema, paramsSchema) =>
  z.object({
    body: bodySchema,
    params: paramsSchema,
    query: z.unknown()
  });

// =====================================
// REVOKE SESSION VALIDATION
// =====================================

const revokeSessionSchema = requestSchema(
  z.object({}).strict(),
  z.object({
    sessionId: z
      .string()
      .uuid("Invalid session ID.")
  }).strict()
);

// =====================================
// EXPORT VALIDATION SCHEMAS
// =====================================

module.exports = {
  revokeSessionSchema
};
