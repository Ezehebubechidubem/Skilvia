
const escapeHtml = (value) => {
  return String(value || "").replace(
    /[&<>"']/g,
    (character) => {
      const entities = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      };

      return entities[character];
    }
  );
};

// =====================================
// SHARED EMAIL LAYOUT
// =====================================

const emailLayout = (content) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SKILVIA</title>
</head>
<body style="
  margin: 0;
  padding: 0;
  background: #F1F4F9;
  font-family: Arial, Helvetica, sans-serif;
  color: #172033;
">
  <table width="100%" cellpadding="0" cellspacing="0"
    style="padding: 35px 12px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0"
          style="
            max-width: 560px;
            background: #FFFFFF;
            border-radius: 12px;
            overflow: hidden;
          ">
          <tr>
            <td style="
              background: #092C69;
              padding: 28px;
              text-align: center;
            ">
              <h1 style="
                margin: 0;
                color: #FFFFFF;
                font-size: 28px;
                letter-spacing: 2px;
              ">SKILVIA</h1>
              <p style="
                margin: 8px 0 0;
                color: #DCE8FF;
                font-size: 13px;
              ">Connecting Skills to Opportunities</p>
            </td>
          </tr>

          <tr>
            <td style="padding: 32px 26px;">
              ${content}
            </td>
          </tr>

          <tr>
            <td style="
              background: #F8FAFD;
              padding: 22px;
              text-align: center;
              font-size: 12px;
              color: #687386;
            ">
              <p style="margin: 0 0 8px;">
                This is an automated SKILVIA account notification.
              </p>
              <p style="margin: 0;">
                If you need assistance, contact our support team.
              </p>
              <p style="margin: 12px 0 0;">
                &copy; ${new Date().getFullYear()} SKILVIA.
                All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

// =====================================
// SHARED BUTTON
// =====================================

const emailButton = (url, label) => `
  <table cellpadding="0" cellspacing="0"
    style="margin: 28px auto;">
    <tr>
      <td align="center" style="
        background: #0755CE;
        border-radius: 7px;
      ">
        <a href="${escapeHtml(url)}"
          style="
            display: inline-block;
            padding: 15px 28px;
            color: #FFFFFF;
            text-decoration: none;
            font-weight: bold;
            font-size: 14px;
          ">
          ${escapeHtml(label)}
        </a>
      </td>
    </tr>
  </table>
`;

// =====================================
// 1. EMAIL VERIFICATION TEMPLATE
// =====================================

const verificationEmail = ({
  fullName,
  verificationUrl
}) => {
  if (!verificationUrl) {
    throw new Error("Verification URL is required.");
  }

  const name = escapeHtml(fullName || "there");

  const html = emailLayout(`
    <h2 style="color: #092C69; font-size: 23px;">
      Verify your email address
    </h2>

    <p>Hello ${name},</p>

    <p style="line-height: 1.7;">
      Welcome to SKILVIA! We're glad to have you join
      our professional services marketplace.
    </p>

    <p style="line-height: 1.7;">
      Please verify your email address to confirm
      ownership of your account.
    </p>

    ${emailButton(
      verificationUrl,
      "VERIFY EMAIL ADDRESS"
    )}

    <p style="font-size: 13px; line-height: 1.7;">
      This verification link expires in 30 minutes
      and can only be used once.
    </p>

    <p style="font-size: 13px; line-height: 1.7;">
      If you did not create a SKILVIA account,
      you can ignore this email.
    </p>
  `);

  const text = `
Hello ${fullName || "there"},

Welcome to SKILVIA!

Please verify your email address using this link:

${verificationUrl}

This link expires in 30 minutes and can only be used once.

If you did not create a SKILVIA account, ignore this email.
`;

  return {
    subject: "Verify your SKILVIA email address",
    html,
    text
  };
};

// =====================================
// 2. PASSWORD RESET TEMPLATE
// =====================================

const passwordResetEmail = ({
  fullName,
  resetUrl
}) => {
  if (!resetUrl) {
    throw new Error("Password reset URL is required.");
  }

  const name = escapeHtml(fullName || "there");

  const html = emailLayout(`
    <h2 style="color: #092C69; font-size: 23px;">
      Reset your password
    </h2>

    <p>Hello ${name},</p>

    <p style="line-height: 1.7;">
      We received a request to reset the password
      associated with your SKILVIA account.
    </p>

    <p style="line-height: 1.7;">
      Use the button below to choose a new password.
    </p>

    ${emailButton(
      resetUrl,
      "RESET MY PASSWORD"
    )}

    <p style="font-size: 13px; line-height: 1.7;">
      This link expires in 15 minutes and can only
      be used once.
    </p>

    <p style="font-size: 13px; line-height: 1.7;">
      If you did not request a password reset,
      ignore this email. Your password will remain unchanged.
    </p>
  `);

  const text = `
Hello ${fullName || "there"},

We received a request to reset your SKILVIA password.

Use this link to choose a new password:

${resetUrl}

This link expires in 15 minutes and can only be used once.

If you did not request this change, ignore this email.
`;

  return {
    subject: "SKILVIA password reset request",
    html,
    text
  };
};

// =====================================
// 3. NEW LOGIN NOTIFICATION
// =====================================

const newLoginEmail = ({
  fullName,
  loginTime,
  device,
  location
}) => {
  const name = escapeHtml(fullName || "there");
  const time = escapeHtml(loginTime || "Not available");
  const deviceInfo = escapeHtml(device || "Unknown device");
  const locationInfo = escapeHtml(location || "Not available");

  const html = emailLayout(`
    <h2 style="color: #092C69; font-size: 23px;">
      New login detected
    </h2>

    <p>Hello ${name},</p>

    <p style="line-height: 1.7;">
      A new login to your SKILVIA account was detected.
    </p>

    <table width="100%" cellpadding="10" cellspacing="0"
      style="
        background: #F1F4F9;
        border-radius: 7px;
        font-size: 13px;
      ">
      <tr>
        <td><strong>Time</strong></td>
        <td>${time}</td>
      </tr>
      <tr>
        <td><strong>Device</strong></td>
        <td>${deviceInfo}</td>
      </tr>
      <tr>
        <td><strong>Location</strong></td>
        <td>${locationInfo}</td>
      </tr>
    </table>

    <p style="line-height: 1.7; margin-top: 24px;">
      If this was you, no action is needed.
    </p>

    <p style="line-height: 1.7;">
      If you do not recognize this login, change
      your password immediately and revoke any
      sessions you do not recognize.
    </p>
  `);

  const text = `
Hello ${fullName || "there"},

A new login to your SKILVIA account was detected.

Time: ${loginTime || "Not available"}
Device: ${device || "Unknown device"}
Location: ${location || "Not available"}

If this was you, no action is needed.

If you do not recognize this login, change your password
and revoke any sessions you do not recognize.
`;

  return {
    subject: "Security alert: New SKILVIA login",
    html,
    text
  };
};

// =====================================
// EXPORT EMAIL TEMPLATES
// =====================================

module.exports = {
  verificationEmail,
  passwordResetEmail,
  newLoginEmail
};
