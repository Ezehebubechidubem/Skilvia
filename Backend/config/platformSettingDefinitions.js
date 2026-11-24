
const { z } = require("zod");


// =====================================================
// COMMON VALIDATION RULES
// =====================================================

const currencySchema = z.string()
  .length(3)
  .regex(/^[A-Z]{3}$/);

const moneySchema = z.number()
  .finite()
  .min(0)
  .max(1000000000);

const percentageSchema = z.number()
  .finite()
  .min(0)
  .max(100);

const textSchema = (min = 1, max = 500) =>
  z.string().trim().min(min).max(max);

const urlSchema = z.string()
  .url()
  .max(2048);

const idSchema = z.string()
  .uuid();


// =====================================================
// PLATFORM IDENTITY
// =====================================================

const platformNameSchema = textSchema(2, 100);

const platformLogoSchema = z.object({
  url: urlSchema.nullable(),
  public_id: textSchema(1, 255).nullable()
}).strict();

const supportEmailSchema = z.string()
  .email()
  .max(254);

const supportPhoneSchema = z.string()
  .trim()
  .min(7)
  .max(25);


// =====================================================
// BOOKING SETTINGS
// =====================================================

const customerFeeSchema = z.object({
  enabled: z.boolean(),
  calculation: z.enum(["fixed", "percentage"]),
  amount: moneySchema,
  currency: currencySchema
}).strict().superRefine((value, context) => {
  if (
    value.calculation === "percentage" &&
    value.amount > 100
  ) {
    context.addIssue({
      code: "custom",
      path: ["amount"],
      message: "Percentage fees cannot exceed 100%."
    });
  }
});

const cancellationRulesSchema = z.object({
  customer_can_cancel: z.boolean(),
  professional_can_cancel: z.boolean(),
  free_cancellation_hours: z.number()
    .int()
    .min(0)
    .max(720),
  cancellation_fee_enabled: z.boolean(),
  cancellation_fee: moneySchema,
  cancellation_fee_currency: currencySchema
}).strict();

const confirmationRulesSchema = z.object({
  professional_response_minutes: z.number()
    .int()
    .min(1)
    .max(10080),
  auto_expire_pending_booking: z.boolean(),
  pending_booking_expiry_minutes: z.number()
    .int()
    .min(1)
    .max(10080)
}).strict();


// =====================================================
// PROFESSIONAL COMMISSION
// =====================================================

const professionalCommissionSchema = z.object({
  enabled: z.boolean(),
  calculation: z.literal("percentage"),
  rate: percentageSchema
}).strict();


// =====================================================
// ADVERTISEMENT PACKAGES
// =====================================================

const advertisementPackageSchema = z.object({
  id: idSchema,
  name: textSchema(2, 100),
  description: textSchema(2, 500),
  price: moneySchema,
  currency: currencySchema,
  duration_days: z.number()
    .int()
    .min(1)
    .max(365),
  is_active: z.boolean(),
  placements: z.array(textSchema(2, 80))
    .min(1)
    .max(20)
}).strict();

const advertisementPackagesSchema = z.array(
  advertisementPackageSchema
).max(100);

const advertisementPlacementsSchema = z.array(
  z.object({
    key: textSchema(2, 80)
      .regex(/^[a-z0-9_]+$/),
    name: textSchema(2, 100),
    description: textSchema(2, 300),
    is_active: z.boolean()
  }).strict()
).max(50);


// =====================================================
// FEATURED PROFESSIONAL PRICING
// =====================================================

const featuredProfessionalPricingSchema = z.object({
  enabled: z.boolean(),
  packages: z.array(
    z.object({
      id: idSchema,
      name: textSchema(2, 100),
      price: moneySchema,
      currency: currencySchema,
      duration_days: z.number()
        .int()
        .min(1)
        .max(365),
      is_active: z.boolean()
    }).strict()
  ).max(100)
}).strict();


// =====================================================
// SUBSCRIPTION PACKAGES
// =====================================================

const subscriptionPackagesSchema = z.array(
  z.object({
    id: idSchema,
    name: textSchema(2, 100),
    description: textSchema(2, 500),
    price: moneySchema,
    currency: currencySchema,
    duration_days: z.number()
      .int()
      .min(1)
      .max(3650),
    benefits: z.array(textSchema(2, 200))
      .max(50),
    is_active: z.boolean()
  }).strict()
).max(100);


// =====================================================
// PROMOTIONAL COUPONS
// =====================================================

const promotionCouponsSchema = z.array(
  z.object({
    id: idSchema,
    code: z.string()
      .trim()
      .min(3)
      .max(40)
      .regex(/^[A-Z0-9_-]+$/),
    discount_type: z.enum([
      "fixed",
      "percentage"
    ]),
    discount_value: moneySchema,
    currency: currencySchema.nullable(),
    usage_limit: z.number()
      .int()
      .min(1)
      .max(10000000)
      .nullable(),
    starts_at: z.string().datetime({
      offset: true
    }),
    expires_at: z.string().datetime({
      offset: true
    }),
    is_active: z.boolean()
  }).strict().superRefine((coupon, context) => {
    if (
      coupon.discount_type === "percentage" &&
      coupon.discount_value > 100
    ) {
      context.addIssue({
        code: "custom",
        path: ["discount_value"],
        message: "Percentage discounts cannot exceed 100%."
      });
    }

    if (
      coupon.discount_type === "fixed" &&
      !coupon.currency
    ) {
      context.addIssue({
        code: "custom",
        path: ["currency"],
        message: "Fixed discounts require a currency."
      });
    }

    if (
      new Date(coupon.expires_at) <=
      new Date(coupon.starts_at)
    ) {
      context.addIssue({
        code: "custom",
        path: ["expires_at"],
        message: "Coupon expiry must be after its start date."
      });
    }
  })
).max(1000);


// =====================================================
// MAINTENANCE MODE
// =====================================================

const maintenanceSchema = z.object({
  enabled: z.boolean(),
  message: textSchema(2, 500)
}).strict();


// =====================================================
// ANNOUNCEMENTS
// =====================================================

const announcementsSchema = z.array(
  z.object({
    id: idSchema,
    title: textSchema(2, 150),
    message: textSchema(2, 2000),
    type: z.enum([
      "information",
      "warning",
      "important",
      "promotion"
    ]),
    starts_at: z.string().datetime({
      offset: true
    }),
    expires_at: z.string().datetime({
      offset: true
    }),
    is_active: z.boolean()
  }).strict().superRefine((announcement, context) => {
    if (
      new Date(announcement.expires_at) <=
      new Date(announcement.starts_at)
    ) {
      context.addIssue({
        code: "custom",
        path: ["expires_at"],
        message: "Announcement expiry must be after its start date."
      });
    }
  })
).max(100);


// =====================================================
// HOMEPAGE CONTENT
// =====================================================

const homepageContentSchema = z.object({
  hero_title: textSchema(2, 150),
  hero_description: textSchema(2, 1000),
  hero_image: urlSchema.nullable(),
  primary_button_text: textSchema(2, 50),
  secondary_button_text: textSchema(2, 50).nullable(),
  featured_category_ids: z.array(idSchema)
    .max(30),
  show_featured_professionals: z.boolean(),
  show_featured_services: z.boolean()
}).strict();


// =====================================================
// SETTING DEFINITIONS
// =====================================================

const platformSettingDefinitions = Object.freeze({
  "platform.name": platformNameSchema,

  "platform.logo": platformLogoSchema,

  "platform.support_email": supportEmailSchema,

  "platform.support_phone": supportPhoneSchema,

  "booking.customer_fee": customerFeeSchema,

  "booking.cancellation_rules": cancellationRulesSchema,

  "booking.confirmation_rules": confirmationRulesSchema,

  "commission.professional": professionalCommissionSchema,

  "advertising.packages": advertisementPackagesSchema,

  "advertising.placements": advertisementPlacementsSchema,

  "featured_professional.pricing":
    featuredProfessionalPricingSchema,

  "subscription.packages": subscriptionPackagesSchema,

  "promotion.coupons": promotionCouponsSchema,

  "platform.maintenance": maintenanceSchema,

  "platform.announcements": announcementsSchema,

  "platform.homepage_content": homepageContentSchema
});


// =====================================================
// VALIDATE A SETTING VALUE
// =====================================================

const validatePlatformSettingValue = (
  settingKey,
  settingValue
) => {
  const schema = platformSettingDefinitions[settingKey];

  if (!schema) {
    const error = new Error(
      "No validation definition exists for this platform setting."
    );

    error.statusCode = 400;
    throw error;
  }

  const result = schema.safeParse(settingValue);

  if (!result.success) {
    const error = new Error(
      "The supplied platform setting value is invalid."
    );

    error.statusCode = 400;
    error.details = result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message
    }));

    throw error;
  }

  return result.data;
};


// =====================================================
// EXPORT
// =====================================================

module.exports = {
  platformSettingDefinitions,
  validatePlatformSettingValue
};
