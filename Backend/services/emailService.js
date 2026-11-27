
const { sendEmail } = require("../config/email");

const {
  verificationEmail,
  passwordResetEmail,
  newLoginEmail
} = require("../utils/emailTemplates");

// =====================================
// FRONTEND URL CONFIGURATION
// =====================================

const getFrontendUrl = () => {
  const frontendUrl = process.env.FRONTEND_URL;

  if (!frontendUrl) {
    throw new Error("FRONTEND_URL is not configured.");
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(frontendUrl);
  } catch {
    throw new Error("FRONTEND_URL is invalid.");
  }

  if (
    !["http:", "https:"].includes(parsedUrl.protocol) ||
    parsedUrl.username ||
    parsedUrl.password
  ) {
    throw new Error("FRONTEND_URL must be a valid HTTP or HTTPS URL.");
  }

  if (
    process.env.NODE_ENV === "production" &&
    parsedUrl.protocol !== "https:"
  ) {
    throw new Error("Production FRONTEND_URL must use HTTPS.");
  }

  return parsedUrl.origin;
};

// =====================================
// BUILD SECURE FRONTEND LINK
// =====================================

const buildFrontendLink = (path, token) => {
  if (
    typeof token !== "string" ||
    !token.trim()
  ) {
    throw new Error("A valid email token is required.");
  }

  const baseUrl = getFrontendUrl();

  const url = new URL(path, `${baseUrl}/`);

  if (url.origin !== baseUrl) {
    throw new Error("Invalid frontend link destination.");
  }

  url.searchParams.set("token", token);

  return url.toString();
};

// =====================================
// 1. SEND EMAIL VERIFICATION
// =====================================

const sendVerificationEmail = async (user, token) => {
  if (!user || !user.email) {
    throw new Error("A valid user email is required.");
  }

  const verificationUrl = buildFrontendLink(
    "/verify-email",
    token
  );

  const email = verificationEmail({
    fullName: user.full_name,
    verificationUrl
  });

  return sendEmail({
    to: user.email,
    subject: email.subject,
    html: email.html,
    text: email.text
  });
};

// =====================================
// 2. SEND PASSWORD RESET EMAIL
// =====================================

const sendPasswordResetEmail = async (user, token) => {
  if (!user || !user.email) {
    throw new Error("A valid user email is required.");
  }

  const resetUrl = buildFrontendLink(
    "/reset-password",
    token
  );

  const email = passwordResetEmail({
    fullName: user.full_name,
    resetUrl
  });

  return sendEmail({
    to: user.email,
    subject: email.subject,
    html: email.html,
    text: email.text
  });
};

// =====================================
// 3. SEND NEW LOGIN NOTIFICATION
// =====================================

const sendNewLoginNotification = async (
  user,
  loginDetails = {}
) => {
  if (!user || !user.email) {
    throw new Error("A valid user email is required.");
  }

  const email = newLoginEmail({
    fullName: user.full_name,
    loginTime: loginDetails.loginTime,
    device: loginDetails.device,
    location: loginDetails.location
  });

  return sendEmail({
    to: user.email,
    subject: email.subject,
    html: email.html,
    text: email.text
  });
};

// =====================================
// EXPORT EMAIL SERVICES
// =====================================

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendNewLoginNotification
};
