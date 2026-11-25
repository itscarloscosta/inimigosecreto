import { NextResponse } from 'next/server';

export const ADMIN_COOKIE = 'inimigo_admin_session';
export const USER_COOKIE = 'inimigo_user_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export function isSecureRequest(request) {
  const proto = (request.headers.get('x-forwarded-proto') || '').split(',')[0].trim();
  return proto === 'https' || process.env.VERCEL === '1';
}

export function jsonResponse(data, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
    },
  });
}

export function setAuthCookie(res, name, value, secure) {
  res.cookies.set(name, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}

export function clearAuthCookie(res, name, secure) {
  res.cookies.set(name, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    maxAge: 0,
  });
  return res;
}

export function handleRouteError(err) {
  console.error('[API Route Error]', err);
  const status = err && err.statusCode ? err.statusCode : 500;
  const message =
    err && err.statusCode
      ? err.message
      : `Erro interno do servidor${err && err.message ? `: ${err.message}` : '.'}`;
  return jsonResponse({ error: message }, status);
}
