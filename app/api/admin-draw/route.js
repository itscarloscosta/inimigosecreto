import securityMod from '../../../lib/security.js';
import { getEventInfo, getSession, resetDraw, runDraw } from '../../../lib/db.js';
import { ADMIN_COOKIE, handleRouteError, jsonResponse } from '../../../lib/api-helpers.js';

const { hashToken } = securityMod;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireAdmin(request) {
  const raw = request.cookies.get(ADMIN_COOKIE)?.value || '';
  if (!raw) return null;
  return getSession(hashToken(raw), 'admin');
}

export async function POST(request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return jsonResponse({ error: 'Acesso restrito ao administrador.' }, 401);

    const result = await runDraw();
    const event = await getEventInfo();
    return jsonResponse({ ok: true, ...result, event });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return jsonResponse({ error: 'Acesso restrito ao administrador.' }, 401);

    await resetDraw();
    const event = await getEventInfo();
    return jsonResponse({ ok: true, event });
  } catch (err) {
    return handleRouteError(err);
  }
}
