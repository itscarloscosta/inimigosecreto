'use strict';

const { generateDerangement } = require('./derangement');
const { getDatabaseUrl } = require('./http');

const DEFAULT_TITLE = 'INIMIGOS SECRETO INFINITOS';
const DEFAULT_NOTE =
  'Presentes que a pessoa odeia ou jamais usaria — criatividade e zero noção liberadas!';

let cachedSql = null;
let cachedUrl = '';
let schemaPromise = null;

function getSqlClient() {
  const url = getDatabaseUrl();
  if (!url) {
    const err = new Error(
      'Banco Neon Postgres não configurado na Vercel. Acesse seu projeto na Vercel > aba Storage > Create Database > Neon Postgres > Connect to Project e faça Redeploy.'
    );
    err.statusCode = 503;
    throw err;
  }

  if (!cachedSql || cachedUrl !== url) {
    const { neon } = require('@neondatabase/serverless');
    cachedSql = neon(url);
    cachedUrl = url;
    schemaPromise = null;
  }
  return cachedSql;
}

async function getDb() {
  const sql = getSqlClient();
  if (!schemaPromise) {
    schemaPromise = sql
      .transaction([
        sql`
          CREATE TABLE IF NOT EXISTS participants (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            phone_digits TEXT NOT NULL UNIQUE,
            phone_formatted TEXT NOT NULL,
            password_hash TEXT,
            target_id INTEGER UNIQUE REFERENCES participants(id) ON DELETE SET NULL,
            revealed_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CHECK (target_id IS NULL OR target_id <> id)
          )
        `,
        sql`
          CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY,
            role TEXT NOT NULL CHECK (role IN ('admin', 'participant')),
            participant_id INTEGER REFERENCES participants(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL
          )
        `,
        sql`
          CREATE TABLE IF NOT EXISTS app_state (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
          )
        `,
        sql`
          INSERT INTO app_state (key, value) VALUES
            ('draw_completed', 'false'),
            ('draw_at', ''),
            ('event_title', ${DEFAULT_TITLE}),
            ('event_note', ${DEFAULT_NOTE})
          ON CONFLICT (key) DO NOTHING
        `,
      ])
      .catch((err) => {
        schemaPromise = null;
        throw err;
      });
  }
  await schemaPromise;
  return sql;
}

async function getEventInfo() {
  const sql = await getDb();
  const rows = await sql`SELECT key, value FROM app_state`;
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    title: map.event_title || DEFAULT_TITLE,
    note: map.event_note ?? DEFAULT_NOTE,
    drawCompleted: map.draw_completed === 'true',
    drawAt: map.draw_at || null,
  };
}

async function updateEventInfo({ title, note }) {
  const sql = await getDb();
  const ops = [];
  if (typeof title === 'string' && title.trim()) {
    const cleanTitle = title.trim().slice(0, 80);
    ops.push(
      sql`INSERT INTO app_state (key, value) VALUES ('event_title', ${cleanTitle}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`
    );
  }
  if (typeof note === 'string') {
    const cleanNote = note.trim().slice(0, 240);
    ops.push(
      sql`INSERT INTO app_state (key, value) VALUES ('event_note', ${cleanNote}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`
    );
  }
  if (ops.length) {
    await sql.transaction(ops);
  }
  return getEventInfo();
}

async function createSession(tokenHash, role, participantId = null, ttlMs = 1000 * 60 * 60 * 24 * 7) {
  const sql = await getDb();
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();
  await sql`
    INSERT INTO sessions (token_hash, role, participant_id, expires_at)
    VALUES (${tokenHash}, ${role}, ${participantId}, ${expiresAt})
  `;
  return expiresAt;
}

async function getSession(tokenHash, expectedRole) {
  if (!tokenHash) return null;
  const sql = await getDb();
  const rows = await sql`
    SELECT token_hash, role, participant_id, expires_at
    FROM sessions
    WHERE token_hash = ${tokenHash}
  `;
  const row = rows[0];
  if (!row || row.role !== expectedRole) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await sql`DELETE FROM sessions WHERE token_hash = ${tokenHash}`;
    return null;
  }
  return row;
}

async function deleteSession(tokenHash) {
  if (!tokenHash) return;
  const sql = await getDb();
  await sql`DELETE FROM sessions WHERE token_hash = ${tokenHash}`;
}

async function purgeExpiredSessions() {
  const sql = await getDb();
  await sql`DELETE FROM sessions WHERE expires_at <= NOW()`;
}

async function countParticipants() {
  const sql = await getDb();
  const rows = await sql`SELECT COUNT(*)::int AS total FROM participants`;
  return rows[0] ? Number(rows[0].total) : 0;
}

async function listParticipantsForAdmin() {
  const sql = await getDb();
  // Intentionally NEVER selects target_id so pairings remain strictly secret
  const rows = await sql`
    SELECT
      id,
      name,
      phone_formatted AS "phoneFormatted",
      (password_hash IS NOT NULL) AS "hasPassword",
      (revealed_at IS NOT NULL) AS "hasRevealed",
      revealed_at AS "revealedAt",
      created_at AS "createdAt"
    FROM participants
    ORDER BY id DESC
  `;
  return rows.map((r) => ({
    id: Number(r.id),
    name: r.name,
    phoneFormatted: r.phoneFormatted,
    hasPassword: Boolean(r.hasPassword),
    hasRevealed: Boolean(r.hasRevealed),
    revealedAt: r.revealedAt ? new Date(r.revealedAt).toISOString() : null,
    createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : null,
  }));
}

async function addParticipant(name, phoneDigits, phoneFormatted) {
  const sql = await getDb();
  try {
    const [inserted] = await sql.transaction([
      sql`
        INSERT INTO participants (name, phone_digits, phone_formatted)
        VALUES (${name}, ${phoneDigits}, ${phoneFormatted})
        RETURNING id
      `,
      sql`UPDATE participants SET target_id = NULL, revealed_at = NULL`,
      sql`INSERT INTO app_state (key, value) VALUES ('draw_completed', 'false') ON CONFLICT (key) DO UPDATE SET value = 'false'`,
      sql`INSERT INTO app_state (key, value) VALUES ('draw_at', '') ON CONFLICT (key) DO UPDATE SET value = ''`,
    ]);
    return {
      id: Number(inserted[0].id),
      name,
      phoneFormatted,
      hasPassword: false,
      hasRevealed: false,
    };
  } catch (err) {
    if (err.code === '23505' || String(err.message).includes('duplicate key')) {
      const dupErr = new Error('Já existe um participante cadastrado com esse telefone.');
      dupErr.statusCode = 409;
      throw dupErr;
    }
    throw err;
  }
}

async function deleteParticipant(id) {
  const sql = await getDb();
  const existing = await sql`SELECT id FROM participants WHERE id = ${id}`;
  if (!existing.length) return false;

  await sql.transaction([
    sql`UPDATE participants SET target_id = NULL, revealed_at = NULL`,
    sql`INSERT INTO app_state (key, value) VALUES ('draw_completed', 'false') ON CONFLICT (key) DO UPDATE SET value = 'false'`,
    sql`INSERT INTO app_state (key, value) VALUES ('draw_at', '') ON CONFLICT (key) DO UPDATE SET value = ''`,
    sql`DELETE FROM participants WHERE id = ${id}`,
  ]);
  return true;
}

async function resetParticipantPassword(id) {
  const sql = await getDb();
  const existing = await sql`SELECT id FROM participants WHERE id = ${id}`;
  if (!existing.length) return false;

  await sql.transaction([
    sql`UPDATE participants SET password_hash = NULL WHERE id = ${id}`,
    sql`DELETE FROM sessions WHERE role = 'participant' AND participant_id = ${id}`,
  ]);
  return true;
}

async function findParticipantByPhone(phoneDigits) {
  const sql = await getDb();
  const rows = await sql`
    SELECT
      id,
      name,
      phone_digits AS "phoneDigits",
      phone_formatted AS "phoneFormatted",
      password_hash AS "passwordHash"
    FROM participants
    WHERE phone_digits = ${phoneDigits}
  `;
  return rows[0] || null;
}

async function setParticipantPassword(id, passwordHash) {
  const sql = await getDb();
  const rows = await sql`
    UPDATE participants
    SET password_hash = ${passwordHash}
    WHERE id = ${id} AND password_hash IS NULL
    RETURNING id
  `;
  return rows.length > 0;
}

async function getParticipantSelfView(participantId) {
  const sql = await getDb();
  const rows = await sql`
    SELECT
      p.id,
      p.name,
      p.phone_formatted AS "phoneFormatted",
      p.target_id AS "targetId",
      p.revealed_at AS "revealedAt",
      t.name AS "targetName"
    FROM participants p
    LEFT JOIN participants t ON t.id = p.target_id
    WHERE p.id = ${participantId}
  `;
  const me = rows[0];
  if (!me) return null;

  const [eventInfo, totalParticipants] = await Promise.all([
    getEventInfo(),
    countParticipants(),
  ]);

  return {
    id: Number(me.id),
    name: me.name,
    phoneFormatted: me.phoneFormatted,
    revealedAt: me.revealedAt ? new Date(me.revealedAt).toISOString() : null,
    totalParticipants,
    event: eventInfo,
    enemy: eventInfo.drawCompleted && me.targetName ? { name: me.targetName } : null,
  };
}

async function markParticipantRevealed(participantId) {
  const sql = await getDb();
  const now = new Date().toISOString();
  await sql`
    UPDATE participants
    SET revealed_at = COALESCE(revealed_at, ${now})
    WHERE id = ${participantId} AND target_id IS NOT NULL
  `;
  return now;
}

async function runDraw() {
  const sql = await getDb();
  const rows = await sql`SELECT id FROM participants ORDER BY id ASC`;
  if (rows.length < 2) {
    const err = new Error('Adicione pelo menos 2 participantes antes de realizar o sorteio.');
    err.statusCode = 400;
    throw err;
  }

  const ids = rows.map((r) => Number(r.id));
  const targets = generateDerangement(ids);
  const now = new Date().toISOString();

  await sql.transaction([
    sql`UPDATE participants SET target_id = NULL, revealed_at = NULL`,
    ...ids.map((id, i) => sql`UPDATE participants SET target_id = ${targets[i]} WHERE id = ${id}`),
    sql`INSERT INTO app_state (key, value) VALUES ('draw_completed', 'true') ON CONFLICT (key) DO UPDATE SET value = 'true'`,
    sql`INSERT INTO app_state (key, value) VALUES ('draw_at', ${now}) ON CONFLICT (key) DO UPDATE SET value = ${now}`,
  ]);

  return {
    participantCount: ids.length,
    drawAt: now,
  };
}

async function resetDraw() {
  const sql = await getDb();
  await sql.transaction([
    sql`UPDATE participants SET target_id = NULL, revealed_at = NULL`,
    sql`INSERT INTO app_state (key, value) VALUES ('draw_completed', 'false') ON CONFLICT (key) DO UPDATE SET value = 'false'`,
    sql`INSERT INTO app_state (key, value) VALUES ('draw_at', '') ON CONFLICT (key) DO UPDATE SET value = ''`,
  ]);
}

module.exports = {
  getDb,
  getEventInfo,
  updateEventInfo,
  createSession,
  getSession,
  deleteSession,
  purgeExpiredSessions,
  countParticipants,
  listParticipantsForAdmin,
  addParticipant,
  deleteParticipant,
  resetParticipantPassword,
  findParticipantByPhone,
  setParticipantPassword,
  getParticipantSelfView,
  markParticipantRevealed,
  runDraw,
  resetDraw,
};
