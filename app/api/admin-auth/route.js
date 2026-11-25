import securityMod from '../../../lib/security.js';
import { createSession, deleteSession, purgeExpiredSessions } from '../../../lib/db.js';
import {
  ADMIN_COOKIE,
  SESSION_MAX_AGE,
  clearAuthCookie,
  handleRouteError,
  isSecureRequest,
  jsonResponse,
  setAuthCookie,
} from '../../../lib/api-helpers.js';

const { verifyAdminCredentials, generateSessionToken, hashToken } = securityMod;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const secure = isSecureRequest(request);
  try {
    const body = await request.json().catch(() => ({}));
    if (!verifyAdminCredentials(body.login, body.password)) {
      return jsonResponse({ error: 'Login ou senha do painel admin inválidos.' }, 401);
    }
    await purgeExpiredSessions();
    const { rawToken, tokenHash } = generateSessionToken();
    await createSession(tokenHash, 'admin', null, SESSION_MAX_AGE * 1000);

    const res = jsonResponse({ ok: true });
    return setAuthCookie(res, ADMIN_COOKIE, rawToken, secure);
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(request) {
  const secure = isSecureRequest(request);
  try {
    const raw = request.cookies.get(ADMIN_COOKIE)?.value || '';
    if (raw) {
      await deleteSession(hashToken(raw));
    }
    return clearAuthCookie(jsonResponse({ ok: true }), ADMIN_COOKIE, secure);
  } catch (err) {
    return handleRouteError(err);
  }
}
