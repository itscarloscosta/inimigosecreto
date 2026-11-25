'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createStore } = require('./lib/store');
const {
  normalizePhone,
  hashPassword,
  verifyPassword,
  verifyAdminCredentials,
  generateSessionToken,
  hashToken,
  parseCookies,
  buildSetCookie,
  buildClearCookie,
} = require('./lib/security');

const PUBLIC_DIR = path.join(__dirname, 'public');
const ADMIN_COOKIE = 'inimigo_admin_session';
const USER_COOKIE = 'inimigo_user_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function readJsonBody(req, maxBytes = 64 * 1024) {
  // Vercel Node.js runtime may pre-parse req.body
  if (req.body !== undefined) {
    if (typeof req.body === 'string') {
      try {
        return Promise.resolve(req.body ? JSON.parse(req.body) : {});
      } catch {
        const err = new Error('JSON inválido.');
        err.statusCode = 400;
        return Promise.reject(err);
      }
    }
    if (Buffer.isBuffer(req.body)) {
      try {
        return Promise.resolve(req.body.length ? JSON.parse(req.body.toString('utf8')) : {});
      } catch {
        const err = new Error('JSON inválido.');
        err.statusCode = 400;
        return Promise.reject(err);
      }
    }
    return Promise.resolve(req.body || {});
  }

  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        const err = new Error('Payload muito grande.');
        err.statusCode = 413;
        reject(err);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(JSON.parse(raw));
      } catch {
        const err = new Error('JSON inválido.');
        err.statusCode = 400;
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    ...extraHeaders,
  });
  res.end(body);
}

function serveStaticFile(res, filePath) {
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(PUBLIC_DIR))) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(resolved, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Arquivo não encontrado');
      return;
    }
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin',
    });
    res.end(content);
  });
}

function isHttpsRequest(req) {
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  return proto === 'https' || process.env.VERCEL === '1';
}

function createRequestHandler(store, options = {}) {
  const enableStatic = options.serveStatic !== false;

  // Simple in-memory rate limiter for auth endpoints
  const authAttempts = new Map();
  function checkRateLimit(ip, bucket, maxAttempts = 20, windowMs = 60_000) {
    const key = `${bucket}:${ip}`;
    const now = Date.now();
    const record = authAttempts.get(key);
    if (!record || record.resetAt <= now) {
      authAttempts.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    record.count += 1;
    return record.count <= maxAttempts;
  }

  async function getAdminSession(req) {
    const cookies = parseCookies(req.headers.cookie);
    const raw = cookies[ADMIN_COOKIE];
    if (!raw) return null;
    return store.getSession(hashToken(raw), 'admin');
  }

  async function getParticipantSession(req) {
    const cookies = parseCookies(req.headers.cookie);
    const raw = cookies[USER_COOKIE];
    if (!raw) return null;
    return store.getSession(hashToken(raw), 'participant');
  }

  return async function requestHandler(req, res) {
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let pathname = urlObj.pathname;
    if (
      (pathname === '/api/index' || pathname === '/api/index.js') &&
      urlObj.searchParams.has('__path')
    ) {
      pathname = '/api/' + urlObj.searchParams.get('__path').replace(/^\/+/, '');
    }
    const method = req.method.toUpperCase();
    const forwardedFor = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const clientIp = forwardedFor || (req.socket && req.socket.remoteAddress) || 'local';
    const secureCookie = isHttpsRequest(req);

    try {
      // ================== HEALTH CHECK ==================
      if (method === 'GET' && pathname === '/api/health') {
        await store.getEventInfo();
        return sendJson(res, 200, { ok: true, node: process.version });
      }

      // ================== PUBLIC INFO ==================
      if (method === 'GET' && pathname === '/api/public-info') {
        const info = await store.getEventInfo();
        const participants = await store.listParticipantsForAdmin();
        return sendJson(res, 200, {
          title: info.title,
          note: info.note,
          drawCompleted: info.drawCompleted,
          totalParticipants: participants.length,
        });
      }

      // ================== PARTICIPANT AUTH & REVEAL ==================
      if (method === 'POST' && pathname === '/api/participant/check-phone') {
        if (!checkRateLimit(clientIp, 'check-phone', 40, 60_000)) {
          return sendJson(res, 429, { error: 'Muitas tentativas. Aguarde um minuto.' });
        }
        const body = await readJsonBody(req);
        const normalized = normalizePhone(body.phone);
        if (!normalized) {
          return sendJson(res, 400, {
            error: 'Informe um telefone válido com DDD no formato (xx) x xxxx xxxx.',
          });
        }
        const participant = await store.findParticipantByPhone(normalized.digits);
        if (!participant) {
          return sendJson(res, 404, {
            error: 'Esse telefone não está cadastrado no grupo. Peça ao organizador para adicionar você!',
          });
        }
        return sendJson(res, 200, {
          status: participant.passwordHash ? 'needs_login' : 'needs_password',
          name: participant.name,
          phoneFormatted: participant.phoneFormatted,
        });
      }

      if (method === 'POST' && pathname === '/api/participant/register-password') {
        if (!checkRateLimit(clientIp, 'register', 20, 60_000)) {
          return sendJson(res, 429, { error: 'Muitas tentativas. Aguarde um minuto.' });
        }
        const body = await readJsonBody(req);
        const normalized = normalizePhone(body.phone);
        const password = String(body.password || '');
        const confirmPassword = String(body.confirmPassword || '');

        if (!normalized) {
          return sendJson(res, 400, { error: 'Telefone inválido.' });
        }
        if (password.length < 4 || password.length > 72) {
          return sendJson(res, 400, { error: 'Sua senha pessoal deve ter entre 4 e 72 caracteres.' });
        }
        if (password !== confirmPassword) {
          return sendJson(res, 400, { error: 'As senhas não conferem.' });
        }

        const participant = await store.findParticipantByPhone(normalized.digits);
        if (!participant) {
          return sendJson(res, 404, { error: 'Telefone não encontrado na lista do grupo.' });
        }
        if (participant.passwordHash) {
          return sendJson(res, 409, {
            error: 'Esse telefone já possui uma senha pessoal cadastrada. Faça login com ela.',
          });
        }

        const hash = hashPassword(password);
        const updated = await store.setParticipantPassword(participant.id, hash);
        if (!updated) {
          return sendJson(res, 409, { error: 'Senha já cadastrada.' });
        }

        const { rawToken, tokenHash } = generateSessionToken();
        await store.createSession(tokenHash, 'participant', participant.id, SESSION_MAX_AGE * 1000);
        const profile = await store.getParticipantSelfView(participant.id);

        return sendJson(
          res,
          201,
          { ok: true, profile },
          { 'Set-Cookie': buildSetCookie(USER_COOKIE, rawToken, SESSION_MAX_AGE, secureCookie) }
        );
      }

      if (method === 'POST' && pathname === '/api/participant/login') {
        if (!checkRateLimit(clientIp, 'user-login', 20, 60_000)) {
          return sendJson(res, 429, { error: 'Muitas tentativas de login. Aguarde um minuto.' });
        }
        const body = await readJsonBody(req);
        const normalized = normalizePhone(body.phone);
        const password = String(body.password || '');

        if (!normalized || !password) {
          return sendJson(res, 400, { error: 'Informe o telefone e sua senha pessoal.' });
        }

        const participant = await store.findParticipantByPhone(normalized.digits);
        if (!participant || !participant.passwordHash) {
          return sendJson(res, 401, { error: 'Telefone ou senha inválidos.' });
        }

        if (!verifyPassword(password, participant.passwordHash)) {
          return sendJson(res, 401, { error: 'Senha incorreta. Tente novamente!' });
        }

        const { rawToken, tokenHash } = generateSessionToken();
        await store.createSession(tokenHash, 'participant', participant.id, SESSION_MAX_AGE * 1000);
        const profile = await store.getParticipantSelfView(participant.id);

        return sendJson(
          res,
          200,
          { ok: true, profile },
          { 'Set-Cookie': buildSetCookie(USER_COOKIE, rawToken, SESSION_MAX_AGE, secureCookie) }
        );
      }

      if (method === 'POST' && pathname === '/api/participant/logout') {
        const cookies = parseCookies(req.headers.cookie);
        if (cookies[USER_COOKIE]) {
          await store.deleteSession(hashToken(cookies[USER_COOKIE]));
        }
        return sendJson(
          res,
          200,
          { ok: true },
          { 'Set-Cookie': buildClearCookie(USER_COOKIE, secureCookie) }
        );
      }

      if (method === 'GET' && pathname === '/api/participant/me') {
        const session = await getParticipantSession(req);
        if (!session || !session.participant_id) {
          return sendJson(res, 401, { error: 'Não autenticado.' });
        }
        const profile = await store.getParticipantSelfView(session.participant_id);
        if (!profile) {
          return sendJson(
            res,
            401,
            { error: 'Sessão inválida.' },
            { 'Set-Cookie': buildClearCookie(USER_COOKIE, secureCookie) }
          );
        }
        return sendJson(res, 200, { profile });
      }

      if (method === 'POST' && pathname === '/api/participant/reveal') {
        const session = await getParticipantSession(req);
        if (!session || !session.participant_id) {
          return sendJson(res, 401, { error: 'Não autenticado.' });
        }
        const profile = await store.getParticipantSelfView(session.participant_id);
        if (!profile || !profile.enemy) {
          return sendJson(res, 400, { error: 'O sorteio ainda não foi realizado.' });
        }
        const revealedAt = await store.markParticipantRevealed(session.participant_id);
        return sendJson(res, 200, {
          enemy: profile.enemy,
          revealedAt,
        });
      }

      // ================== ADMIN AUTH & MANAGEMENT ==================
      if (method === 'POST' && pathname === '/api/admin/login') {
        if (!checkRateLimit(clientIp, 'admin-login', 15, 60_000)) {
          return sendJson(res, 429, { error: 'Muitas tentativas. Aguarde um minuto.' });
        }
        const body = await readJsonBody(req);
        if (!verifyAdminCredentials(body.login, body.password)) {
          return sendJson(res, 401, { error: 'Login ou senha do painel admin inválidos.' });
        }
        await store.purgeExpiredSessions();
        const { rawToken, tokenHash } = generateSessionToken();
        await store.createSession(tokenHash, 'admin', null, SESSION_MAX_AGE * 1000);

        return sendJson(
          res,
          200,
          { ok: true },
          { 'Set-Cookie': buildSetCookie(ADMIN_COOKIE, rawToken, SESSION_MAX_AGE, secureCookie) }
        );
      }

      if (method === 'POST' && pathname === '/api/admin/logout') {
        const cookies = parseCookies(req.headers.cookie);
        if (cookies[ADMIN_COOKIE]) {
          await store.deleteSession(hashToken(cookies[ADMIN_COOKIE]));
        }
        return sendJson(
          res,
          200,
          { ok: true },
          { 'Set-Cookie': buildClearCookie(ADMIN_COOKIE, secureCookie) }
        );
      }

      if (pathname.startsWith('/api/admin/')) {
        const adminSession = await getAdminSession(req);
        if (!adminSession) {
          return sendJson(res, 401, { error: 'Acesso restrito ao administrador.' });
        }

        if (method === 'GET' && pathname === '/api/admin/dashboard') {
          const [event, participants] = await Promise.all([
            store.getEventInfo(),
            store.listParticipantsForAdmin(),
          ]);
          return sendJson(res, 200, { event, participants });
        }

        if (method === 'PUT' && pathname === '/api/admin/event') {
          const body = await readJsonBody(req);
          const event = await store.updateEventInfo({
            title: body.title,
            note: body.note,
          });
          return sendJson(res, 200, { event });
        }

        if (method === 'POST' && pathname === '/api/admin/participants') {
          const body = await readJsonBody(req);
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

          try {
            const created = await store.addParticipant(name, normalized.digits, normalized.formatted);
            const event = await store.getEventInfo();
            return sendJson(res, 201, { participant: created, event });
          } catch (err) {
            if (String(err.message).includes('UNIQUE')) {
              return sendJson(res, 409, {
                error: 'Já existe um participante cadastrado com esse telefone.',
              });
            }
            throw err;
          }
        }

        const deleteMatch = pathname.match(/^\/api\/admin\/participants\/(\d+)$/);
        if (method === 'DELETE' && deleteMatch) {
          const id = Number(deleteMatch[1]);
          const deleted = await store.deleteParticipant(id);
          if (!deleted) {
            return sendJson(res, 404, { error: 'Participante não encontrado.' });
          }
          const event = await store.getEventInfo();
          return sendJson(res, 200, { ok: true, event });
        }

        const resetPassMatch = pathname.match(/^\/api\/admin\/participants\/(\d+)\/reset-password$/);
        if (method === 'POST' && resetPassMatch) {
          const id = Number(resetPassMatch[1]);
          const ok = await store.resetParticipantPassword(id);
          if (!ok) {
            return sendJson(res, 404, { error: 'Participante não encontrado.' });
          }
          return sendJson(res, 200, { ok: true });
        }

        if (method === 'POST' && pathname === '/api/admin/draw') {
          const result = await store.runDraw();
          const event = await store.getEventInfo();
          return sendJson(res, 200, { ok: true, ...result, event });
        }

        if (method === 'POST' && pathname === '/api/admin/draw/reset') {
          await store.resetDraw();
          const event = await store.getEventInfo();
          return sendJson(res, 200, { ok: true, event });
        }

        return sendJson(res, 404, { error: 'Endpoint admin não encontrado.' });
      }

      // ================== STATIC FRONTEND ROUTES ==================
      if (enableStatic && method === 'GET') {
        if (pathname === '/' || pathname === '/index.html') {
          return serveStaticFile(res, path.join(PUBLIC_DIR, 'index.html'));
        }
        if (pathname === '/admin' || pathname === '/admin/' || pathname === '/admin.html') {
          return serveStaticFile(res, path.join(PUBLIC_DIR, 'admin.html'));
        }
        const safeRel = pathname.replace(/^\/+/, '');
        if (!safeRel.includes('..')) {
          return serveStaticFile(res, path.join(PUBLIC_DIR, safeRel));
        }
      }

      return sendJson(res, 404, { error: 'Rota não encontrada.' });
    } catch (err) {
      const status = err.statusCode || 500;
      if (status >= 500) {
        console.error('[Erro no servidor]', err);
      }
      return sendJson(res, status, {
        error: status >= 500 ? 'Erro interno do servidor.' : err.message,
      });
    }
  };
}

function createAppServer(options = {}) {
  const store = createStore(options);
  const handler = createRequestHandler(store, { serveStatic: true });
  const server = http.createServer(handler);
  return { server, store };
}

if (require.main === module) {
  const PORT = Number(process.env.PORT) || 3000;
  const HOST = process.env.HOST || '127.0.0.1';
  const { server, store } = createAppServer();

  server.listen(PORT, HOST, () => {
    console.log(`😈 INIMIGOS SECRETO INFINITOS rodando em http://${HOST}:${PORT}`);
    console.log(`🔐 Painel Admin disponível em http://${HOST}:${PORT}/admin`);
  });

  const shutdown = () => {
    server.close(async () => {
      await store.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { createAppServer, createRequestHandler };
