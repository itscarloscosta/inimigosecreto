'use strict';

const db = require('../lib/neon');
const { normalizePhone, hashToken } = require('../lib/security');
const { sendJson, readBody, getCookie, handleApiError } = require('../lib/http');

const ADMIN_COOKIE = 'inimigo_admin_session';

async function requireAdmin(req) {
  const raw = getCookie(req, ADMIN_COOKIE);
  if (!raw) return null;
  return db.getSession(hashToken(raw), 'admin');
}

module.exports = async function handler(req, res) {
  const method = (req.method || 'GET').toUpperCase();

  try {
    const adminSession = await requireAdmin(req);
    if (!adminSession) {
      return sendJson(res, 401, { error: 'Acesso restrito ao administrador.' });
    }

    // GET -> Dashboard data (event + members without pairings)
    if (method === 'GET') {
      const [event, participants] = await Promise.all([
        db.getEventInfo(),
        db.listParticipantsForAdmin(),
      ]);
      return sendJson(res, 200, { event, participants });
    }

    // PUT -> Update event title/note
    if (method === 'PUT') {
      const body = await readBody(req);
      const event = await db.updateEventInfo({
        title: body.title,
        note: body.note,
      });
      return sendJson(res, 200, { event });
    }

    // POST -> Add new participant
    if (method === 'POST') {
      const body = await readBody(req);
      const name = String(body.name || '').trim();
      const normalized = normalizePhone(body.phone);

      if (name.length < 2 || name.length > 60) {
        return sendJson(res, 400, { error: 'Informe um nome válido (2 a 60 caracteres).' });
      }
      if (!normalized) {
        return sendJson(res, 400, {
          error: 'Telefone inválido! Use o formato com DDD: (xx) x xxxx xxxx.',
        });
      }

      const created = await db.addParticipant(name, normalized.digits, normalized.formatted);
      const event = await db.getEventInfo();
      return sendJson(res, 201, { participant: created, event });
    }

    // PATCH -> Reset participant password
    if (method === 'PATCH') {
      const body = await readBody(req);
      const id = Number(body.id);
      if (!Number.isInteger(id) || id <= 0) {
        return sendJson(res, 400, { error: 'ID de participante inválido.' });
      }
      const ok = await db.resetParticipantPassword(id);
      if (!ok) {
        return sendJson(res, 404, { error: 'Participante não encontrado.' });
      }
      return sendJson(res, 200, { ok: true });
    }

    // DELETE -> Remove participant (?id=123 or JSON body { id })
    if (method === 'DELETE') {
      const urlObj = new URL(req.url, `http://${(req.headers && req.headers.host) || 'localhost'}`);
      let id = Number(urlObj.searchParams.get('id'));
      if (!id) {
        const body = await readBody(req).catch(() => ({}));
        id = Number(body.id);
      }
      if (!Number.isInteger(id) || id <= 0) {
        return sendJson(res, 400, { error: 'ID de participante inválido.' });
      }
      const deleted = await db.deleteParticipant(id);
      if (!deleted) {
        return sendJson(res, 404, { error: 'Participante não encontrado.' });
      }
      const event = await db.getEventInfo();
      return sendJson(res, 200, { ok: true, event });
    }

    return sendJson(res, 405, { error: 'Método não permitido.' });
  } catch (err) {
    return handleApiError(res, err);
  }
};
