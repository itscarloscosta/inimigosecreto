'use strict';

const crypto = require('node:crypto');

const ADMIN_LOGIN = process.env.ADMIN_USER || 'infinitos';
const ADMIN_PASSWORD = process.env.ADMIN_PASS || 'senhadificil123';

function normalizePhone(input) {
  let digits = String(input || '').replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('55')) {
    digits = digits.slice(2);
  }
  if (digits.length !== 11) {
    return null;
  }
  const formatted = `(${digits.slice(0, 2)}) ${digits.slice(2, 3)} ${digits.slice(3, 7)} ${digits.slice(7, 11)}`;
  return { digits, formatted };
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || typeof storedHash !== 'string' || !storedHash.includes(':')) {
    return false;
  }
  const [salt, keyHex] = storedHash.split(':');
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(String(password), salt, 64);
  const storedBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(derived, storedBuf);
}

function timingSafeStringEqual(a, b) {
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');
  if (bufA.length !== bufB.length) {
    // Compare against dummy buffer of same length to avoid early return timing differences
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function verifyAdminCredentials(login, password) {
  const loginOk = timingSafeStringEqual(String(login || '').trim(), ADMIN_LOGIN);
  const passOk = timingSafeStringEqual(String(password || ''), ADMIN_PASSWORD);
  return loginOk && passOk;
}

function generateSessionToken() {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  return { rawToken, tokenHash };
}

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken || '')).digest('hex');
}

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) {
      try {
        cookies[key] = decodeURIComponent(value);
      } catch {
        cookies[key] = value;
      }
    }
  }
  return cookies;
}

function buildSetCookie(name, value, maxAgeSeconds, isSecure = false) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (isSecure) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

function buildClearCookie(name, isSecure = false) {
  const parts = [`${name}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (isSecure) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

module.exports = {
  normalizePhone,
  hashPassword,
  verifyPassword,
  verifyAdminCredentials,
  generateSessionToken,
  hashToken,
  parseCookies,
  buildSetCookie,
  buildClearCookie,
};
