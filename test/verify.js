'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createAppServer } = require('../server');

async function req(baseUrl, pathname, options = {}) {
  const headers = {
    Accept: 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.cookie ? { Cookie: options.cookie } : {}),
  };
  const res = await fetch(`${baseUrl}${pathname}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // non-json response
  }
  const setCookie = res.headers.get('set-cookie') || '';
  const cookiePair = setCookie ? setCookie.split(';')[0] : '';
  return { status: res.status, json, text, cookiePair };
}

async function runTests() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inimigo-test-'));
  const dbPath = path.join(tmpDir, 'test.db');
  const { server, store } = createAppServer({ dbPath });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    console.log('1. Verificando rotas estáticas...');
    for (const route of ['/', '/admin', '/styles.css', '/shared.js', '/app.js', '/admin.js']) {
      const r = await req(baseUrl, route);
      assert.equal(r.status, 200, `Rota ${route} deveria retornar 200`);
    }

    console.log('2. Verificando autenticação do Painel Admin (infinitos / senhadificil123)...');
    const unauthDash = await req(baseUrl, '/api/admin/dashboard');
    assert.equal(unauthDash.status, 401);

    const badAdmin = await req(baseUrl, '/api/admin/login', {
      method: 'POST',
      body: { login: 'infinitos', password: 'errada' },
    });
    assert.equal(badAdmin.status, 401);

    const goodAdmin = await req(baseUrl, '/api/admin/login', {
      method: 'POST',
      body: { login: 'infinitos', password: 'senhadificil123' },
    });
    assert.equal(goodAdmin.status, 200);
    assert.ok(goodAdmin.cookiePair.startsWith('inimigo_admin_session='));
    const adminCookie = goodAdmin.cookiePair;

    console.log('3. Testando validação de telefone (xx) x xxxx xxxx e cadastro de membros...');
    const invalidPhone = await req(baseUrl, '/api/admin/participants', {
      method: 'POST',
      cookie: adminCookie,
      body: { name: 'Teste', phone: '119999' },
    });
    assert.equal(invalidPhone.status, 400);

    const members = [
      { name: 'Carlos Careca', phone: '11911112222', expected: '(11) 9 1111 2222' },
      { name: 'Ana Palmeirense', phone: '(21) 9 2222 3333', expected: '(21) 9 2222 3333' },
      { name: 'Bruno Dorminhoco', phone: '31933334444', expected: '(31) 9 3333 4444' },
      { name: 'Diana Fitness', phone: '41944445555', expected: '(41) 9 4444 5555' },
      { name: 'Eduardo Chef', phone: '51955556666', expected: '(51) 9 5555 6666' },
      { name: 'Fernanda Pontual', phone: '61966667777', expected: '(61) 9 6666 7777' },
    ];

    for (const m of members) {
      const r = await req(baseUrl, '/api/admin/participants', {
        method: 'POST',
        cookie: adminCookie,
        body: { name: m.name, phone: m.phone },
      });
      assert.equal(r.status, 201);
      assert.equal(r.json.participant.phoneFormatted, m.expected);
    }

    // Duplicate phone rejected
    const dup = await req(baseUrl, '/api/admin/participants', {
      method: 'POST',
      cookie: adminCookie,
      body: { name: 'Clone', phone: '(11) 9 1111 2222' },
    });
    assert.equal(dup.status, 409);

    console.log('4. Testando algoritmo de sorteio (200 simulações sem auto-sorteio nem duplicidade)...');
    for (const size of [2, 3, 5, 10]) {
      const ids = Array.from({ length: size }, (_, i) => i + 1);
      for (let run = 0; run < 50; run++) {
        const targets = store.generateDerangement(ids);
        assert.equal(targets.length, size);
        assert.equal(new Set(targets).size, size, 'Ninguém pode tirar a mesma pessoa');
        for (let i = 0; i < size; i++) {
          assert.notEqual(targets[i], ids[i], 'Ninguém pode tirar a si mesmo');
        }
      }
    }

    console.log('5. Disparando sorteio real e garantindo que o Admin não vê os pares...');
    const drawRes = await req(baseUrl, '/api/admin/draw', {
      method: 'POST',
      cookie: adminCookie,
    });
    assert.equal(drawRes.status, 200);
    assert.equal(drawRes.json.participantCount, members.length);

    const adminDash = await req(baseUrl, '/api/admin/dashboard', { cookie: adminCookie });
    assert.equal(adminDash.status, 200);
    assert.equal(adminDash.json.event.drawCompleted, true);
    const dashRaw = JSON.stringify(adminDash.json);
    assert.ok(!dashRaw.includes('targetId') && !dashRaw.includes('target_id') && !dashRaw.includes('enemy'));

    console.log('6. Testando fluxo completo dos 6 participantes (senha pessoal + sigilo + unicidade)...');
    const notFound = await req(baseUrl, '/api/participant/check-phone', {
      method: 'POST',
      body: { phone: '(99) 9 9999 9999' },
    });
    assert.equal(notFound.status, 404);

    const revealedEnemies = new Map();

    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      const pass = `segredo-${i + 1}`;

      // Check phone -> needs_password
      const check1 = await req(baseUrl, '/api/participant/check-phone', {
        method: 'POST',
        body: { phone: m.expected },
      });
      assert.equal(check1.status, 200);
      assert.equal(check1.json.status, 'needs_password');
      assert.equal(check1.json.name, m.name);

      // Register personal password
      const reg = await req(baseUrl, '/api/participant/register-password', {
        method: 'POST',
        body: { phone: m.expected, password: pass, confirmPassword: pass },
      });
      assert.equal(reg.status, 201);
      assert.ok(reg.cookiePair.startsWith('inimigo_user_session='));

      // Re-registering same phone must fail
      const regAgain = await req(baseUrl, '/api/participant/register-password', {
        method: 'POST',
        body: { phone: m.expected, password: 'outra', confirmPassword: 'outra' },
      });
      assert.equal(regAgain.status, 409);

      // Check phone -> needs_login
      const check2 = await req(baseUrl, '/api/participant/check-phone', {
        method: 'POST',
        body: { phone: m.expected },
      });
      assert.equal(check2.json.status, 'needs_login');

      // Wrong password rejected
      const wrongLogin = await req(baseUrl, '/api/participant/login', {
        method: 'POST',
        body: { phone: m.expected, password: 'errada' },
      });
      assert.equal(wrongLogin.status, 401);

      // Correct login works
      const okLogin = await req(baseUrl, '/api/participant/login', {
        method: 'POST',
        body: { phone: m.expected, password: pass },
      });
      assert.equal(okLogin.status, 200);
      const userCookie = okLogin.cookiePair;

      // Participant cannot access admin API
      const forbiddenAdmin = await req(baseUrl, '/api/admin/dashboard', { cookie: userCookie });
      assert.equal(forbiddenAdmin.status, 401);

      // Reveal own enemy
      const reveal = await req(baseUrl, '/api/participant/reveal', {
        method: 'POST',
        cookie: userCookie,
      });
      assert.equal(reveal.status, 200);
      const enemyName = reveal.json.enemy.name;
      assert.notEqual(enemyName, m.name, `${m.name} não pode tirar a si mesmo!`);
      revealedEnemies.set(m.name, enemyName);
    }

    // Verify bijection across all 6 users
    const allTargets = [...revealedEnemies.values()];
    assert.equal(new Set(allTargets).size, members.length, 'Cada participante deve tirar uma pessoa única!');
    for (const m of members) {
      assert.ok(allTargets.includes(m.name), `${m.name} deve ser sorteado por alguém!`);
    }

    console.log('7. Testando reset de senha pelo admin preservando o sorteio...');
    const firstMemberId = adminDash.json.participants[0].id;
    const firstMemberPhone = adminDash.json.participants[0].phoneFormatted;
    const firstMemberName = adminDash.json.participants[0].name;
    const originalEnemy = revealedEnemies.get(firstMemberName);

    const resetRes = await req(baseUrl, `/api/admin/participants/${firstMemberId}/reset-password`, {
      method: 'POST',
      cookie: adminCookie,
    });
    assert.equal(resetRes.status, 200);

    const checkAfterReset = await req(baseUrl, '/api/participant/check-phone', {
      method: 'POST',
      body: { phone: firstMemberPhone },
    });
    assert.equal(checkAfterReset.json.status, 'needs_password');

    const newReg = await req(baseUrl, '/api/participant/register-password', {
      method: 'POST',
      body: { phone: firstMemberPhone, password: 'nova-senha', confirmPassword: 'nova-senha' },
    });
    assert.equal(newReg.status, 201);
    assert.equal(newReg.json.profile.enemy.name, originalEnemy, 'Resetar senha não pode alterar o sorteio!');

    console.log('✅ TODOS OS TESTES PASSARAM COM SUCESSO!');
  } finally {
    server.close();
    store.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

runTests().catch((err) => {
  console.error('❌ Falha nos testes:', err);
  process.exit(1);
});
