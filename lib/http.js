'use strict';

const { parseCookies } = require('./security');

function getDatabaseUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.NEON_DATABASE_URL ||
    ''
  ).trim();
}

function isSecureRequest(req) {
  const proto = String((req.headers && req.headers['x-forwarded-proto']) || '')
    .split(',')[0]
    .trim();
  return proto === 'https' || process.env.VERCEL === '1';
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  for (const [k, v] of Object.entries(extraHeaders)) {
    res.setHeader(k, v);
  }
  res.statusCode = statusCode;
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') {
      return req.body ? JSON.parse(req.body) : {};
    }
    if (Buffer.isBuffer(req.body)) {
      return req.body.length ? JSON.parse(req.body.toString('utf8')) : {};
    }
    return req.body;
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 64 * 1024) {
        const err = new Error('Payload muito grande.');
        err.statusCode = 413;
        reject(err);
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        const err = new Error('JSON inválido.');
        err.statusCode = 400;
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function getCookie(req, name) {
  const cookies = parseCookies((req.headers && req.headers.cookie) || '');
  return cookies[name] || '';
}

function handleApiError(res, err) {
  console.error('[API Error]', err);
  const status = err && err.statusCode ? err.statusCode : 500;
  const message =
    err && err.statusCode
      ? err.message
      : `Erro interno do servidor${err && err.message ? `: ${err.message}` : '.'}`;
  return sendJson(res, status, { error: message });
}

module.exports = {
  getDatabaseUrl,
  isSecureRequest,
  sendJson,
  readBody,
  getCookie,
  handleApiError,
};
