
const getDeviceInfo = (req) => {
  const userAgent = String(
    req.headers["user-agent"] || ""
  ).slice(0, 1000);

  const normalizedAgent = userAgent.toLowerCase();

  let deviceType = "unknown";
  let operatingSystem = "Unknown operating system";
  let browser = "Unknown browser";
  let deviceName = "Unknown device";

  // =====================================
  // DETECT DEVICE TYPE
  // =====================================

  if (/android/.test(normalizedAgent)) {
    deviceType = "android";
    operatingSystem = "Android";
    deviceName = "Android device";

  } else if (
    /iphone|ipad|ipod/.test(normalizedAgent)
  ) {
    deviceType = "ios";
    operatingSystem = "iOS";
    deviceName = "Apple mobile device";

  } else if (
    /windows|macintosh|mac os|linux/.test(normalizedAgent)
  ) {
    deviceType = "desktop";

    if (/windows/.test(normalizedAgent)) {
      operatingSystem = "Windows";
    } else if (/macintosh|mac os/.test(normalizedAgent)) {
      operatingSystem = "macOS";
    } else if (/linux/.test(normalizedAgent)) {
      operatingSystem = "Linux";
    }

    deviceName = `${operatingSystem} computer`;

  } else if (
    /mobile/.test(normalizedAgent)
  ) {
    deviceType = "android";
    deviceName = "Mobile device";
  }

  // =====================================
  // DETECT BROWSER
  // =====================================

  if (/edg\//.test(normalizedAgent)) {
    browser = "Microsoft Edge";

  } else if (/opr\/|opera/.test(normalizedAgent)) {
    browser = "Opera";

  } else if (/chrome\//.test(normalizedAgent)) {
    browser = "Google Chrome";

  } else if (/firefox\//.test(normalizedAgent)) {
    browser = "Mozilla Firefox";

  } else if (
    /safari\//.test(normalizedAgent) &&
    !/chrome\//.test(normalizedAgent)
  ) {
    browser = "Safari";

  } else if (/okhttp/.test(normalizedAgent)) {
    browser = "Android application";

  } else if (/cfnetwork/.test(normalizedAgent)) {
    browser = "Apple application";
  }

  // =====================================
  // BUILD DEVICE DESCRIPTION
  // =====================================

  if (deviceType === "web" || deviceType === "desktop") {
    deviceName = `${operatingSystem} - ${browser}`;
  }

  // =====================================
  // GET REQUEST IP ADDRESS
  // =====================================

  let ipAddress = req.ip || null;

  if (ipAddress) {
    // Normalize IPv4-mapped IPv6 addresses.
    if (ipAddress.startsWith("::ffff:")) {
      ipAddress = ipAddress.substring(7);
    }

    // Avoid storing malformed or oversized values.
    if (
      ipAddress.length > 45 ||
      !/^[0-9a-fA-F:.]+$/.test(ipAddress)
    ) {
      ipAddress = null;
    }
  }

  return Object.freeze({
    deviceName: deviceName.slice(0, 150),
    deviceType,
    operatingSystem,
    browser,
    userAgent: userAgent || null,
    ipAddress
  });
};

module.exports = getDeviceInfo;
