'use strict';

const db = require('../lib/neon');
const {
  verifyAdminCredentials,
  generateSessionToken,
  hashToken,
  buildSetCookie,
  buildClearCookie,
} = require('../lib/security');
const {
  isSecureRequest,
  sendJson,
  readBody,
  getCookie,
  handleApiError,
} = require('../lib/http');

const ADMIN_COOKIE = 'inimigo_admin_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

module.exports = async function handler(req, res) {
  const method = (req.method || 'POST').toUpperCase();
  const secure = isSecureRequest(req);

  try {
    if (method === 'POST') {
      const body = await readBody(req);
      if (!verifyAdminCredentials(body.login, body.password)) {
        return sendJson(res, 401, { error: 'Login ou senha do painel admin inválidos.' });
      }
      await db.purgeExpiredSessions();
      const { rawToken, tokenHash } = generateSessionToken();
      await db.createSession(tokenHash, 'admin', null, SESSION_MAX_AGE * 1000);

      return sendJson(
        res,
        200,
        { ok: true },
        { 'Set-Cookie': buildSetCookie(ADMIN_COOKIE, rawToken, SESSION_MAX_AGE, secure) }
      );
    }

    if (method === 'DELETE') {
      const raw = getCookie(req, ADMIN_COOKIE);
      if (raw) {
        await db.deleteSession(hashToken(raw));
      }
      return sendJson(
        res,
        200,
        { ok: true },
        { 'Set-Cookie': buildClearCookie(ADMIN_COOKIE, secure) }
      );
    }

    return sendJson(res, 405, { error: 'Método não permitido.' });
  } catch (err) {
    return handleApiError(res, err);
  }
};
