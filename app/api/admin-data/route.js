import securityMod from '../../../lib/security.js';
import {
  addParticipant,
  deleteParticipant,
  getEventInfo,
  getSession,
  listParticipantsForAdmin,
  resetParticipantPassword,
  updateEventInfo,
} from '../../../lib/db.js';
import { ADMIN_COOKIE, handleRouteError, jsonResponse } from '../../../lib/api-helpers.js';

const { normalizePhone, hashToken } = securityMod;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireAdmin(request) {
  const raw = request.cookies.get(ADMIN_COOKIE)?.value || '';
  if (!raw) return null;
  return getSession(hashToken(raw), 'admin');
}

export async function GET(request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return jsonResponse({ error: 'Acesso restrito ao administrador.' }, 401);

    const [event, participants] = await Promise.all([
      getEventInfo(),
      listParticipantsForAdmin(),
    ]);
    return jsonResponse({ event, participants });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PUT(request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return jsonResponse({ error: 'Acesso restrito ao administrador.' }, 401);

    const body = await request.json().catch(() => ({}));
    const event = await updateEventInfo({ title: body.title, note: body.note });
    return jsonResponse({ event });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return jsonResponse({ error: 'Acesso restrito ao administrador.' }, 401);

    const body = await request.json().catch(() => ({}));
    const name = String(body.name || '').trim();
    const normalized = normalizePhone(body.phone);

    if (name.length < 2 || name.length > 60) {
      return jsonResponse({ error: 'Informe um nome válido (2 a 60 caracteres).' }, 400);
    }
    if (!normalized) {
      return jsonResponse(
        { error: 'Telefone inválido! Use o formato com DDD: (xx) x xxxx xxxx.' },
        400
      );
    }

    const participant = await addParticipant(name, normalized.digits, normalized.formatted);
    const event = await getEventInfo();
    return jsonResponse({ participant, event }, 201);
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function PATCH(request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return jsonResponse({ error: 'Acesso restrito ao administrador.' }, 401);

    const body = await request.json().catch(() => ({}));
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) {
      return jsonResponse({ error: 'ID de participante inválido.' }, 400);
    }
    const ok = await resetParticipantPassword(id);
    if (!ok) return jsonResponse({ error: 'Participante não encontrado.' }, 404);
    return jsonResponse({ ok: true });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function DELETE(request) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return jsonResponse({ error: 'Acesso restrito ao administrador.' }, 401);

    const { searchParams } = new URL(request.url);
    let id = Number(searchParams.get('id'));
    if (!id) {
      const body = await request.json().catch(() => ({}));
      id = Number(body.id);
    }
    if (!Number.isInteger(id) || id <= 0) {
      return jsonResponse({ error: 'ID de participante inválido.' }, 400);
    }
    const deleted = await deleteParticipant(id);
    if (!deleted) return jsonResponse({ error: 'Participante não encontrado.' }, 404);
    const event = await getEventInfo();
    return jsonResponse({ ok: true, event });
  } catch (err) {
    return handleRouteError(err);
  }
}
