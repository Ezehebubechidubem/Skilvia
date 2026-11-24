
const { Resend } = require("resend");

// =====================================
// RESEND EMAIL CONFIGURATION
// =====================================

let resendClient = null;

const getResendClient = () => {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey || !apiKey.startsWith("re_")) {
    throw new Error(
      "RESEND_API_KEY is missing or invalid."
    );
  }

  if (!resendClient) {
    resendClient = new Resend(apiKey);
  }

  return resendClient;
};

// =====================================
// EMAIL SENDER CONFIGURATION
// =====================================

const getSenderAddress = () => {
  const sender = process.env.RESEND_FROM_EMAIL;

  if (!sender) {
    throw new Error(
      "RESEND_FROM_EMAIL is not configured."
    );
  }

  return sender;
};

// =====================================
// SEND TRANSACTIONAL EMAIL
// =====================================

const sendEmail = async ({
  to,
  subject,
  html,
  text,
  replyTo
}) => {
  if (
    typeof to !== "string" ||
    !to.trim()
  ) {
    throw new Error("A valid recipient email is required.");
  }

  if (
    typeof subject !== "string" ||
    !subject.trim()
  ) {
    throw new Error("An email subject is required.");
  }

  if (
    (!html || typeof html !== "string") &&
    (!text || typeof text !== "string")
  ) {
    throw new Error(
      "An HTML or plain-text email body is required."
    );
  }

  const resend = getResendClient();

  const message = {
    from: getSenderAddress(),
    to: to.trim(),
    subject: subject.trim()
  };

  if (html) {
    message.html = html;
  }

  if (text) {
    message.text = text;
  }

  if (replyTo || process.env.RESEND_REPLY_TO) {
    message.replyTo =
      replyTo || process.env.RESEND_REPLY_TO;
  }

  const { data, error } = await resend.emails.send(
    message
  );

  if (error) {
    console.error(
      "SKILVIA email delivery failed:",
      error.message
    );

    throw new Error(
      "Email delivery failed. Please try again later."
    );
  }

  if (!data || !data.id) {
    throw new Error(
      "The email provider did not confirm delivery."
    );
  }

  return {
    messageId: data.id
  };
};

// =====================================
// EXPORT EMAIL SERVICE
// =====================================

module.exports = {
  sendEmail
};
