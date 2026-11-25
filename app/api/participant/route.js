import securityMod from '../../../lib/security.js';
import {
  createSession,
  deleteSession,
  findParticipantByPhone,
  getParticipantSelfView,
  getSession,
  markParticipantRevealed,
  setParticipantPassword,
} from '../../../lib/db.js';
import {
  USER_COOKIE,
  SESSION_MAX_AGE,
  clearAuthCookie,
  handleRouteError,
  isSecureRequest,
  jsonResponse,
  setAuthCookie,
} from '../../../lib/api-helpers.js';

const {
  normalizePhone,
  hashPassword,
  verifyPassword,
  generateSessionToken,
  hashToken,
} = securityMod;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function getParticipantSession(request) {
  const raw = request.cookies.get(USER_COOKIE)?.value || '';
  if (!raw) return null;
  return getSession(hashToken(raw), 'participant');
}

export async function GET(request) {
  const secure = isSecureRequest(request);
  try {
    const session = await getParticipantSession(request);
    if (!session || !session.participant_id) {
      return jsonResponse({ error: 'Não autenticado.' }, 401);
    }
    const profile = await getParticipantSelfView(session.participant_id);
    if (!profile) {
      return clearAuthCookie(jsonResponse({ error: 'Sessão inválida.' }, 401), USER_COOKIE, secure);
    }
    return jsonResponse({ profile });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request) {
  const secure = isSecureRequest(request);
  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || '');

    if (action === 'check-phone') {
      const normalized = normalizePhone(body.phone);
      if (!normalized) {
        return jsonResponse(
          { error: 'Informe um telefone válido com DDD no formato (xx) x xxxx xxxx.' },
          400
        );
      }
      const participant = await findParticipantByPhone(normalized.digits);
      if (!participant) {
        return jsonResponse(
          {
            error:
              'Esse telefone não está cadastrado no grupo. Peça ao organizador para adicionar você!',
          },
          404
        );
      }
      return jsonResponse({
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
        return jsonResponse({ error: 'Telefone inválido.' }, 400);
      }
      if (password.length < 4 || password.length > 72) {
        return jsonResponse(
          { error: 'Sua senha pessoal deve ter entre 4 e 72 caracteres.' },
          400
        );
      }
      if (password !== confirmPassword) {
        return jsonResponse({ error: 'As senhas não conferem.' }, 400);
      }

      const participant = await findParticipantByPhone(normalized.digits);
      if (!participant) {
        return jsonResponse({ error: 'Telefone não encontrado na lista do grupo.' }, 404);
      }
      if (participant.passwordHash) {
        return jsonResponse(
          { error: 'Esse telefone já possui uma senha pessoal cadastrada. Faça login com ela.' },
          409
        );
      }

      const hash = hashPassword(password);
      const updated = await setParticipantPassword(participant.id, hash);
      if (!updated) {
        return jsonResponse({ error: 'Senha já cadastrada.' }, 409);
      }

      const { rawToken, tokenHash } = generateSessionToken();
      await createSession(tokenHash, 'participant', participant.id, SESSION_MAX_AGE * 1000);
      const profile = await getParticipantSelfView(participant.id);

      const res = jsonResponse({ ok: true, profile }, 201);
      return setAuthCookie(res, USER_COOKIE, rawToken, secure);
    }

    if (action === 'login') {
      const normalized = normalizePhone(body.phone);
      const password = String(body.password || '');

      if (!normalized || !password) {
        return jsonResponse({ error: 'Informe o telefone e sua senha pessoal.' }, 400);
      }

      const participant = await findParticipantByPhone(normalized.digits);
      if (!participant || !participant.passwordHash) {
        return jsonResponse({ error: 'Telefone ou senha inválidos.' }, 401);
      }
      if (!verifyPassword(password, participant.passwordHash)) {
        return jsonResponse({ error: 'Senha incorreta. Tente novamente!' }, 401);
      }

      const { rawToken, tokenHash } = generateSessionToken();
      await createSession(tokenHash, 'participant', participant.id, SESSION_MAX_AGE * 1000);
      const profile = await getParticipantSelfView(participant.id);

      const res = jsonResponse({ ok: true, profile }, 200);
      return setAuthCookie(res, USER_COOKIE, rawToken, secure);
    }

    if (action === 'reveal') {
      const session = await getParticipantSession(request);
      if (!session || !session.participant_id) {
        return jsonResponse({ error: 'Não autenticado.' }, 401);
      }
      const profile = await getParticipantSelfView(session.participant_id);
      if (!profile || !profile.enemy) {
        return jsonResponse({ error: 'O sorteio ainda não foi realizado.' }, 400);
      }
      const revealedAt = await markParticipantRevealed(session.participant_id);
      return jsonResponse({ enemy: profile.enemy, revealedAt });
    }

    if (action === 'logout') {
      const raw = request.cookies.get(USER_COOKIE)?.value || '';
      if (raw) {
        await deleteSession(hashToken(raw));
      }
      return clearAuthCookie(jsonResponse({ ok: true }), USER_COOKIE, secure);
    }

    return jsonResponse({ error: 'Ação inválida.' }, 400);
  } catch (err) {
    return handleRouteError(err);
  }
}
