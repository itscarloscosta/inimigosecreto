'use strict';

const db = require('../lib/neon');
const { hashToken } = require('../lib/security');
const { sendJson, getCookie, handleApiError } = require('../lib/http');

const ADMIN_COOKIE = 'inimigo_admin_session';

async function requireAdmin(req) {
  const raw = getCookie(req, ADMIN_COOKIE);
  if (!raw) return null;
  return db.getSession(hashToken(raw), 'admin');
}

module.exports = async function handler(req, res) {
  const method = (req.method || 'POST').toUpperCase();

  try {
    const adminSession = await requireAdmin(req);
    if (!adminSession) {
      return sendJson(res, 401, { error: 'Acesso restrito ao administrador.' });
    }

    if (method === 'POST') {
      const result = await db.runDraw();
      const event = await db.getEventInfo();
      return sendJson(res, 200, { ok: true, ...result, event });
    }

    if (method === 'DELETE') {
      await db.resetDraw();
      const event = await db.getEventInfo();
      return sendJson(res, 200, { ok: true, event });
    }

    return sendJson(res, 405, { error: 'Método não permitido.' });
  } catch (err) {
    return handleApiError(res, err);
  }
};
