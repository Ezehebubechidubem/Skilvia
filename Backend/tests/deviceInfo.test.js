
const test = require("node:test");
const assert = require("node:assert/strict");

const getDeviceInfo = require("../utils/deviceInfo");

// =====================================
// ANDROID DEVICE TEST
// =====================================

test("identifies an Android device", () => {
  const req = {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36"
    },
    ip: "192.168.1.10"
  };

  const result = getDeviceInfo(req);

  assert.equal(result.deviceType, "android");
  assert.equal(result.operatingSystem, "Android");
  assert.equal(result.ipAddress, "192.168.1.10");
});

// =====================================
// IOS DEVICE TEST
// =====================================

test("identifies an iPhone device", () => {
  const req = {
    headers: {
      "user-agent":
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1"
    },
    ip: "192.168.1.20"
  };

  const result = getDeviceInfo(req);

  assert.equal(result.deviceType, "ios");
  assert.equal(result.operatingSystem, "iOS");
});

// =====================================
// WINDOWS DEVICE TEST
// =====================================

test("identifies a Windows computer", () => {
  const req = {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
    },
    ip: "192.168.1.30"
  };

  const result = getDeviceInfo(req);

  assert.equal(result.deviceType, "desktop");
  assert.equal(result.operatingSystem, "Windows");
  assert.equal(result.browser, "Google Chrome");
});

// =====================================
// UNKNOWN DEVICE TEST
// =====================================

test("handles an unknown device safely", () => {
  const req = {
    headers: {},
    ip: undefined
  };

  const result = getDeviceInfo(req);

  assert.equal(result.deviceType, "unknown");
  assert.equal(result.ipAddress, null);
  assert.equal(result.userAgent, null);
});

// =====================================
// INVALID IP TEST
// =====================================

test("rejects an invalid IP address", () => {
  const req = {
    headers: {
      "user-agent": "Test device"
    },
    ip: "not-an-ip-address"
  };

  const result = getDeviceInfo(req);

  assert.equal(result.ipAddress, null);
});

// =====================================
// USER-AGENT LENGTH TEST
// =====================================

test("limits the stored user-agent length", () => {
  const req = {
    headers: {
      "user-agent": "A".repeat(2000)
    },
    ip: "127.0.0.1"
  };

  const result = getDeviceInfo(req);

  assert.equal(result.userAgent.length, 1000);
});

// =====================================
// RESULT IMMUTABILITY TEST
// =====================================

test("returns an immutable device information object", () => {
  const req = {
    headers: {
      "user-agent": "Test device"
    },
    ip: "127.0.0.1"
  };

  const result = getDeviceInfo(req);

  assert.equal(Object.isFrozen(result), true);
});
