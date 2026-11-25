'use strict';

const assert = require('node:assert/strict');

const BASE_URL = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';

async function req(pathname, options = {}) {
  const headers = {
    Accept: 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.cookie ? { Cookie: options.cookie } : {}),
  };
  const res = await fetch(`${BASE_URL}${pathname}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // html or text
  }
  const setCookie = res.headers.get('set-cookie') || '';
  const cookiePair = setCookie ? setCookie.split(';')[0] : '';
  return { status: res.status, json, text, cookiePair };
}

async function main() {
  console.log(`Testando stack live em ${BASE_URL}...`);

  console.log('1. Verificando páginas Next.js (/ e /admin) e /api/health...');
  const home = await req('/');
  assert.equal(home.status, 200);
  assert.ok(home.text.includes('INIMIGOS SECRETO'));

  const adminPage = await req('/admin');
  assert.equal(adminPage.status, 200);

  const health = await req('/api/health');
  assert.equal(health.status, 200, `Health falhou: ${health.text}`);
  assert.equal(health.json.ok, true);

  console.log('2. Testando login Admin (infinitos / senhadificil123)...');
  const badAdmin = await req('/api/admin-auth', {
    method: 'POST',
    body: { login: 'infinitos', password: 'errada' },
  });
  assert.equal(badAdmin.status, 401);

  const okAdmin = await req('/api/admin-auth', {
    method: 'POST',
    body: { login: 'infinitos', password: 'senhadificil123' },
  });
  assert.equal(okAdmin.status, 200);
  const adminCookie = okAdmin.cookiePair;
  assert.ok(adminCookie.startsWith('inimigo_admin_session='));

  // Limpa participantes prévios de testes anteriores se houver
  const initialDash = await req('/api/admin-data', { cookie: adminCookie });
  assert.equal(initialDash.status, 200);
  for (const p of initialDash.json.participants) {
    await req(`/api/admin-data?id=${p.id}`, { method: 'DELETE', cookie: adminCookie });
  }

  console.log('3. Cadastrando 4 participantes com telefone (xx) x xxxx xxxx...');
  const members = [
    { name: 'Carlos Careca', phone: '11911112222', formatted: '(11) 9 1111 2222' },
    { name: 'Ana Rival', phone: '(21) 9 2222 3333', formatted: '(21) 9 2222 3333' },
    { name: 'Bruno Soneca', phone: '+55 31 93333-4444', formatted: '(31) 9 3333 4444' },
    { name: 'Diana Miojo', phone: '41944445555', formatted: '(41) 9 4444 5555' },
  ];

  for (const m of members) {
    const r = await req('/api/admin-data', {
      method: 'POST',
      cookie: adminCookie,
      body: { name: m.name, phone: m.phone },
    });
    assert.equal(r.status, 201);
    assert.equal(r.json.participant.phoneFormatted, m.formatted);
  }

  console.log('4. Realizando sorteio real no PostgreSQL e validando sigilo no Admin...');
  const draw = await req('/api/admin-draw', { method: 'POST', cookie: adminCookie });
  assert.equal(draw.status, 200);
  assert.equal(draw.json.participantCount, 4);

  const dash = await req('/api/admin-data', { cookie: adminCookie });
  assert.ok(!JSON.stringify(dash.json).includes('targetId'));

  console.log('5. Validando criação de senha pessoal, login e unicidade dos 4 participantes...');
  const drawn = new Set();
  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    const pass = `senha-${i + 100}`;

    const reg = await req('/api/participant', {
      method: 'POST',
      body: {
        action: 'register-password',
        phone: m.formatted,
        password: pass,
        confirmPassword: pass,
      },
    });
    assert.equal(reg.status, 201);
    const userCookie = reg.cookiePair;

    const rev = await req('/api/participant', {
      method: 'POST',
      cookie: userCookie,
      body: { action: 'reveal' },
    });
    assert.equal(rev.status, 200);
    assert.notEqual(rev.json.enemy.name, m.name, 'Ninguém pode tirar a si mesmo!');
    drawn.add(rev.json.enemy.name);
  }
  assert.equal(drawn.size, 4, 'Ninguém pode tirar a mesma pessoa!');

  // Limpa dados de teste para deixar o banco zerado para o usuário
  for (const p of dash.json.participants) {
    await req(`/api/admin-data?id=${p.id}`, { method: 'DELETE', cookie: adminCookie });
  }

  console.log('✅ TODOS OS TESTES E2E NO DOCKER + POSTGRES PASSARAM!');
}

main().catch((err) => {
  console.error('❌ Erro no teste E2E:', err);
  process.exit(1);
});
