
const { z } = require("zod");

const requestSchema = (
  bodySchema = z.object({}).strict(),
  paramsSchema = z.object({}).strict(),
  querySchema = z.object({}).strict()
) =>
  z.object({
    body: bodySchema,
    params: paramsSchema,
    query: querySchema
  });

const getAdminCategoryByIdSchema = requestSchema(
  z.object({}).strict(),
  z.object({
    categoryId: z.string().uuid()
  }).strict(),
  z.object({}).strict()
);

module.exports = {
  getAdminCategoryByIdSchema
};
