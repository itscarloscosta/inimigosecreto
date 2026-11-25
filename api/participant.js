'use strict';

const db = require('../lib/neon');
const {
  normalizePhone,
  hashPassword,
  verifyPassword,
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

const USER_COOKIE = 'inimigo_user_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

async function getParticipantSession(req) {
  const raw = getCookie(req, USER_COOKIE);
  if (!raw) return null;
  return db.getSession(hashToken(raw), 'participant');
}

module.exports = async function handler(req, res) {
  const method = (req.method || 'GET').toUpperCase();
  const secure = isSecureRequest(req);

  try {
    // GET /api/participant -> current logged-in participant profile
    if (method === 'GET') {
      const session = await getParticipantSession(req);
      if (!session || !session.participant_id) {
        return sendJson(res, 401, { error: 'Não autenticado.' });
      }
      const profile = await db.getParticipantSelfView(session.participant_id);
      if (!profile) {
        return sendJson(
          res,
          401,
          { error: 'Sessão inválida.' },
          { 'Set-Cookie': buildClearCookie(USER_COOKIE, secure) }
        );
      }
      return sendJson(res, 200, { profile });
    }

    if (method !== 'POST') {
      return sendJson(res, 405, { error: 'Método não permitido.' });
    }

    const body = await readBody(req);
    const action = String(body.action || '');

    if (action === 'check-phone') {
      const normalized = normalizePhone(body.phone);
      if (!normalized) {
        return sendJson(res, 400, {
          error: 'Informe um telefone válido com DDD no formato (xx) x xxxx xxxx.',
        });
      }
      const participant = await db.findParticipantByPhone(normalized.digits);
      if (!participant) {
        return sendJson(res, 404, {
          error:
            'Esse telefone não está cadastrado no grupo. Peça ao organizador para adicionar você!',
        });
      }
      return sendJson(res, 200, {
        status: participant.passwordHash ? 'needs_login' : 'needs_password',
        name: participant.name,
        phoneFormatted: participant.phoneFormatted,
      });
    }

    if (action === 'register-password') {
      const normalized = normalizePhone(body.phone);
      const password = String(body.password || '');
      const confirmPassword = String(body.confirmPassword || '');

      if (!normalized) {
        return sendJson(res, 400, { error: 'Telefone inválido.' });
      }
      if (password.length < 4 || password.length > 72) {
        return sendJson(res, 400, {
          error: 'Sua senha pessoal deve ter entre 4 e 72 caracteres.',
        });
      }
      if (password !== confirmPassword) {
        return sendJson(res, 400, { error: 'As senhas não conferem.' });
      }

      const participant = await db.findParticipantByPhone(normalized.digits);
      if (!participant) {
        return sendJson(res, 404, { error: 'Telefone não encontrado na lista do grupo.' });
      }
      if (participant.passwordHash) {
        return sendJson(res, 409, {
          error: 'Esse telefone já possui uma senha pessoal cadastrada. Faça login com ela.',
        });
      }

      const hash = hashPassword(password);
      const updated = await db.setParticipantPassword(participant.id, hash);
      if (!updated) {
        return sendJson(res, 409, { error: 'Senha já cadastrada.' });
      }

      const { rawToken, tokenHash } = generateSessionToken();
      await db.createSession(tokenHash, 'participant', participant.id, SESSION_MAX_AGE * 1000);
      const profile = await db.getParticipantSelfView(participant.id);

      return sendJson(
        res,
        201,
        { ok: true, profile },
        { 'Set-Cookie': buildSetCookie(USER_COOKIE, rawToken, SESSION_MAX_AGE, secure) }
      );
    }

    if (action === 'login') {
      const normalized = normalizePhone(body.phone);
      const password = String(body.password || '');

      if (!normalized || !password) {
        return sendJson(res, 400, { error: 'Informe o telefone e sua senha pessoal.' });
      }

      const participant = await db.findParticipantByPhone(normalized.digits);
      if (!participant || !participant.passwordHash) {
        return sendJson(res, 401, { error: 'Telefone ou senha inválidos.' });
      }
      if (!verifyPassword(password, participant.passwordHash)) {
        return sendJson(res, 401, { error: 'Senha incorreta. Tente novamente!' });
      }

      const { rawToken, tokenHash } = generateSessionToken();
      await db.createSession(tokenHash, 'participant', participant.id, SESSION_MAX_AGE * 1000);
      const profile = await db.getParticipantSelfView(participant.id);

      return sendJson(
        res,
        200,
        { ok: true, profile },
        { 'Set-Cookie': buildSetCookie(USER_COOKIE, rawToken, SESSION_MAX_AGE, secure) }
      );
    }

    if (action === 'reveal') {
      const session = await getParticipantSession(req);
      if (!session || !session.participant_id) {
        return sendJson(res, 401, { error: 'Não autenticado.' });
      }
      const profile = await db.getParticipantSelfView(session.participant_id);
      if (!profile || !profile.enemy) {
        return sendJson(res, 400, { error: 'O sorteio ainda não foi realizado.' });
      }
      const revealedAt = await db.markParticipantRevealed(session.participant_id);
      return sendJson(res, 200, { enemy: profile.enemy, revealedAt });
    }

    if (action === 'logout') {
      const raw = getCookie(req, USER_COOKIE);
      if (raw) {
        await db.deleteSession(hashToken(raw));
      }
      return sendJson(
        res,
        200,
        { ok: true },
        { 'Set-Cookie': buildClearCookie(USER_COOKIE, secure) }
      );
    }

    return sendJson(res, 400, { error: 'Ação inválida.' });
  } catch (err) {
    return handleApiError(res, err);
  }
};
