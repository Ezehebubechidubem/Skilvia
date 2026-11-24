
const bcrypt = require("bcrypt");

// =====================================
// PASSWORD CONFIGURATION
// =====================================

const SALT_ROUNDS = Number(
  process.env.BCRYPT_SALT_ROUNDS || 12
);

if (
  !Number.isInteger(SALT_ROUNDS) ||
  SALT_ROUNDS < 10 ||
  SALT_ROUNDS > 15
) {
  throw new Error(
    "BCRYPT_SALT_ROUNDS must be an integer between 10 and 15."
  );
}

// bcrypt only processes up to 72 bytes.
// Reject longer passwords instead of silently truncating them.
const validatePassword = (password) => {
  if (
    typeof password !== "string" ||
    password.length === 0
  ) {
    throw new Error("A valid password is required.");
  }

  if (Buffer.byteLength(password, "utf8") > 72) {
    throw new Error(
      "Password must not exceed 72 bytes."
    );
  }
};

// =====================================
// HASH PASSWORD
// =====================================

const hashPassword = async (password) => {
  validatePassword(password);

  const hashedPassword = await bcrypt.hash(
    password,
    SALT_ROUNDS
  );

  return hashedPassword;
};

// =====================================
// VERIFY PASSWORD
// =====================================

const verifyPassword = async (
  password,
  hashedPassword
) => {
  validatePassword(password);

  if (
    typeof hashedPassword !== "string" ||
    !hashedPassword.startsWith("$2")
  ) {
    return false;
  }

  try {
    return await bcrypt.compare(
      password,
      hashedPassword
    );
  } catch {
    return false;
  }
};

// =====================================
// EXPORT PASSWORD FUNCTIONS
// =====================================

module.exports = {
  hashPassword,
  verifyPassword
};
