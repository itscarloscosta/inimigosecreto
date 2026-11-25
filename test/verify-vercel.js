'use strict';

const assert = require('node:assert/strict');
const { generateDerangement } = require('../lib/derangement');

// Inject a lightweight mock of lib/neon into require.cache so we can test all 6 Vercel
// Serverless Function handlers end-to-end without an external Neon network call.
const state = {
  nextId: 1,
  participants: [],
  sessions: new Map(),
  event: {
    title: 'INIMIGOS SECRETO INFINITOS',
    note: 'Presentes terríveis!',
    drawCompleted: false,
    drawAt: null,
  },
};

const mockNeon = {
  async getEventInfo() {
    return { ...state.event };
  },
  async updateEventInfo({ title, note }) {
    if (typeof title === 'string' && title.trim()) state.event.title = title.trim();
    if (typeof note === 'string') state.event.note = note.trim();
    return { ...state.event };
  },
  async createSession(tokenHash, role, participantId = null, ttlMs = 3600_000) {
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();
    state.sessions.set(tokenHash, {
      token_hash: tokenHash,
      role,
      participant_id: participantId,
      expires_at: expiresAt,
    });
    return expiresAt;
  },
  async getSession(tokenHash, expectedRole) {
    const s = state.sessions.get(tokenHash);
    if (!s || s.role !== expectedRole) return null;
    if (new Date(s.expires_at).getTime() <= Date.now()) return null;
    return s;
  },
  async deleteSession(tokenHash) {
    state.sessions.delete(tokenHash);
  },
  async purgeExpiredSessions() {},
  async countParticipants() {
    return state.participants.length;
  },
  async listParticipantsForAdmin() {
    return [...state.participants]
      .sort((a, b) => b.id - a.id)
      .map((p) => ({
        id: p.id,
        name: p.name,
        phoneFormatted: p.phoneFormatted,
        hasPassword: Boolean(p.passwordHash),
        hasRevealed: Boolean(p.revealedAt),
        revealedAt: p.revealedAt,
        createdAt: p.createdAt,
      }));
  },
  async addParticipant(name, phoneDigits, phoneFormatted) {
    if (state.participants.some((p) => p.phoneDigits === phoneDigits)) {
      const err = new Error('Já existe um participante cadastrado com esse telefone.');
      err.statusCode = 409;
      throw err;
    }
    const p = {
      id: state.nextId++,
      name,
      phoneDigits,
      phoneFormatted,
      passwordHash: null,
      targetId: null,
      revealedAt: null,
      createdAt: new Date().toISOString(),
    };
    state.participants.push(p);
    for (const m of state.participants) {
      m.targetId = null;
      m.revealedAt = null;
    }
    state.event.drawCompleted = false;
    state.event.drawAt = null;
    return {
      id: p.id,
      name: p.name,
      phoneFormatted: p.phoneFormatted,
      hasPassword: false,
      hasRevealed: false,
    };
  },
  async deleteParticipant(id) {
    const idx = state.participants.findIndex((p) => p.id === id);
    if (idx === -1) return false;
    state.participants.splice(idx, 1);
    for (const m of state.participants) {
      m.targetId = null;
      m.revealedAt = null;
    }
    state.event.drawCompleted = false;
    state.event.drawAt = null;
    return true;
  },
  async resetParticipantPassword(id) {
    const p = state.participants.find((m) => m.id === id);
    if (!p) return false;
    p.passwordHash = null;
    for (const [k, s] of state.sessions.entries()) {
      if (s.role === 'participant' && s.participant_id === id) state.sessions.delete(k);
    }
    return true;
  },
  async findParticipantByPhone(phoneDigits) {
    return state.participants.find((p) => p.phoneDigits === phoneDigits) || null;
  },
  async setParticipantPassword(id, passwordHash) {
    const p = state.participants.find((m) => m.id === id);
    if (!p || p.passwordHash) return false;
    p.passwordHash = passwordHash;
    return true;
  },
  async getParticipantSelfView(participantId) {
    const p = state.participants.find((m) => m.id === participantId);
    if (!p) return null;
    const target = state.participants.find((m) => m.id === p.targetId);
    return {
      id: p.id,
      name: p.name,
      phoneFormatted: p.phoneFormatted,
      revealedAt: p.revealedAt,
      totalParticipants: state.participants.length,
      event: { ...state.event },
      enemy: state.event.drawCompleted && target ? { name: target.name } : null,
    };
  },
  async markParticipantRevealed(participantId) {
    const p = state.participants.find((m) => m.id === participantId);
    const now = new Date().toISOString();
    if (p && !p.revealedAt) p.revealedAt = now;
    return p ? p.revealedAt : now;
  },
  async runDraw() {
    if (state.participants.length < 2) {
      const err = new Error('Adicione pelo menos 2 participantes antes de realizar o sorteio.');
      err.statusCode = 400;
      throw err;
    }
    const ids = state.participants.map((p) => p.id);
    const targets = generateDerangement(ids);
    for (let i = 0; i < ids.length; i++) {
      state.participants[i].targetId = targets[i];
      state.participants[i].revealedAt = null;
    }
    state.event.drawCompleted = true;
    state.event.drawAt = new Date().toISOString();
    return { participantCount: ids.length, drawAt: state.event.drawAt };
  },
  async resetDraw() {
    for (const m of state.participants) {
      m.targetId = null;
      m.revealedAt = null;
    }
    state.event.drawCompleted = false;
    state.event.drawAt = null;
  },
};

const neonModulePath = require.resolve('../lib/neon');
require.cache[neonModulePath] = {
  id: neonModulePath,
  filename: neonModulePath,
  loaded: true,
  exports: mockNeon,
};

const healthFn = require('../api/health');
const publicInfoFn = require('../api/public-info');
const participantFn = require('../api/participant');
const adminAuthFn = require('../api/admin-auth');
const adminDataFn = require('../api/admin-data');
const adminDrawFn = require('../api/admin-draw');

async function invoke(fn, { method = 'GET', url = '/', body = undefined, cookie = '' } = {}) {
  const headers = {
    host: 'inimigosecreto.vercel.app',
    'x-forwarded-proto': 'https',
    ...(cookie ? { cookie } : {}),
  };
  const resHeaders = {};
  let rawBody = '';
  const res = {
    statusCode: 200,
    setHeader(k, v) {
      resHeaders[k.toLowerCase()] = v;
    },
    end(chunk) {
      rawBody = chunk || '';
    },
  };
  await fn({ method, url, headers, body }, res);
  const setCookie = resHeaders['set-cookie'] || '';
  return {
    status: res.statusCode,
    json: rawBody ? JSON.parse(rawBody) : null,
    headers: resHeaders,
    cookiePair: setCookie ? setCookie.split(';')[0] : '',
  };
}

async function main() {
  console.log('1. Testando /api/health sem e com DATABASE_URL...');
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  const hNoDb = await invoke(healthFn, { method: 'GET', url: '/api/health' });
  assert.equal(hNoDb.status, 503);
  assert.equal(hNoDb.json.dbConfigured, false);

  process.env.DATABASE_URL = 'postgresql://mock/test';
  const hOk = await invoke(healthFn, { method: 'GET', url: '/api/health' });
  assert.equal(hOk.status, 200);
  assert.equal(hOk.json.ok, true);
  assert.equal(hOk.json.eventTitle, 'INIMIGOS SECRETO INFINITOS');

  console.log('2. Testando login Admin (infinitos / senhadificil123) + cookies Secure...');
  const badAdmin = await invoke(adminAuthFn, {
    method: 'POST',
    body: { login: 'infinitos', password: 'errada' },
  });
  assert.equal(badAdmin.status, 401);

  const okAdmin = await invoke(adminAuthFn, {
    method: 'POST',
    body: { login: 'infinitos', password: 'senhadificil123' },
  });
  assert.equal(okAdmin.status, 200);
  assert.ok(okAdmin.headers['set-cookie'].includes('Secure'));
  const adminCookie = okAdmin.cookiePair;

  console.log('3. Cadastrando 5 participantes no painel admin...');
  const members = [
    { name: 'Carlos', phone: '11911112222', formatted: '(11) 9 1111 2222' },
    { name: 'Ana', phone: '(21) 9 2222 3333', formatted: '(21) 9 2222 3333' },
    { name: 'Bruno', phone: '+55 31 93333-4444', formatted: '(31) 9 3333 4444' },
    { name: 'Diana', phone: '41944445555', formatted: '(41) 9 4444 5555' },
    { name: 'Eduardo', phone: '51955556666', formatted: '(51) 9 5555 6666' },
  ];

  for (const m of members) {
    const r = await invoke(adminDataFn, {
      method: 'POST',
      cookie: adminCookie,
      body: { name: m.name, phone: m.phone },
    });
    assert.equal(r.status, 201);
    assert.equal(r.json.participant.phoneFormatted, m.formatted);
  }

  console.log('4. Realizando sorteio e garantindo sigilo no painel admin...');
  const drawRes = await invoke(adminDrawFn, { method: 'POST', cookie: adminCookie });
  assert.equal(drawRes.status, 200);
  assert.equal(drawRes.json.participantCount, 5);

  const dash = await invoke(adminDataFn, { method: 'GET', cookie: adminCookie });
  assert.equal(dash.status, 200);
  assert.ok(!JSON.stringify(dash.json).includes('targetId'));

  console.log('5. Verificando /api/public-info...');
  const pub = await invoke(publicInfoFn, { method: 'GET' });
  assert.equal(pub.status, 200);
  assert.equal(pub.json.totalParticipants, 5);
  assert.equal(pub.json.drawCompleted, true);

  console.log('6. Testando criação de senha pessoal, login e revelação sigilosa dos 5 membros...');
  const drawnTargets = new Set();
  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    const pass = `minha-senha-${i}`;

    const chk = await invoke(participantFn, {
      method: 'POST',
      body: { action: 'check-phone', phone: m.formatted },
    });
    assert.equal(chk.status, 200);
    assert.equal(chk.json.status, 'needs_password');

    const reg = await invoke(participantFn, {
      method: 'POST',
      body: {
        action: 'register-password',
        phone: m.formatted,
        password: pass,
        confirmPassword: pass,
      },
    });
    assert.equal(reg.status, 201);

    const login = await invoke(participantFn, {
      method: 'POST',
      body: { action: 'login', phone: m.formatted, password: pass },
    });
    assert.equal(login.status, 200);
    const userCookie = login.cookiePair;

    const rev = await invoke(participantFn, {
      method: 'POST',
      cookie: userCookie,
      body: { action: 'reveal' },
    });
    assert.equal(rev.status, 200);
    assert.notEqual(rev.json.enemy.name, m.name);
    drawnTargets.add(rev.json.enemy.name);
  }

  assert.equal(drawnTargets.size, 5, 'Cada participante deve tirar uma pessoa única!');

  console.log('7. Testando reset de senha e remoção via DELETE ?id=...');
  const firstId = dash.json.participants[0].id;
  const reset = await invoke(adminDataFn, {
    method: 'PATCH',
    cookie: adminCookie,
    body: { id: firstId },
  });
  assert.equal(reset.status, 200);

  const del = await invoke(adminDataFn, {
    method: 'DELETE',
    url: `/api/admin-data?id=${firstId}`,
    cookie: adminCookie,
  });
  assert.equal(del.status, 200);
  assert.equal(del.json.event.drawCompleted, false);

  console.log('✅ TODOS OS TESTES DAS FUNÇÕES VERCEL PASSARAM!');
}

main().catch((err) => {
  console.error('❌ Falha nos testes:', err);
  process.exit(1);
});
