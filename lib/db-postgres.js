'use strict';

const { generateDerangement } = require('./derangement');

const DEFAULT_TITLE = 'INIMIGOS SECRETO INFINITOS';
const DEFAULT_NOTE =
  'Presentes que a pessoa odeia ou jamais usaria — criatividade e zero noção liberadas!';

function createPostgresDatabase(connectionString) {
  const { Pool } = require('pg');

  const isLocalPg =
    connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

  const pool = new Pool({
    connectionString,
    ssl: isLocalPg ? false : { rejectUnauthorized: false },
    max: 5,
  });

  let initPromise = null;

  async function ensureInitialized() {
    if (!initPromise) {
      initPromise = (async () => {
        await pool.query(`
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
          );

          CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY,
            role TEXT NOT NULL CHECK (role IN ('admin', 'participant')),
            participant_id INTEGER REFERENCES participants(id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            expires_at TIMESTAMPTZ NOT NULL
          );

          CREATE TABLE IF NOT EXISTS app_state (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
          );
        `);

        await pool.query(
          `INSERT INTO app_state (key, value) VALUES
            ('draw_completed', 'false'),
            ('draw_at', ''),
            ('event_title', $1),
            ('event_note', $2)
          ON CONFLICT (key) DO NOTHING`,
          [DEFAULT_TITLE, DEFAULT_NOTE]
        );
      })().catch((err) => {
        initPromise = null;
        throw err;
      });
    }
    return initPromise;
  }

  async function getState(key, fallback = '') {
    await ensureInitialized();
    const { rows } = await pool.query('SELECT value FROM app_state WHERE key = $1', [key]);
    return rows[0] ? rows[0].value : fallback;
  }

  async function setState(clientOrPool, key, value) {
    await clientOrPool.query(
      'INSERT INTO app_state (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
      [key, String(value)]
    );
  }

  async function getEventInfo() {
    await ensureInitialized();
    const { rows } = await pool.query('SELECT key, value FROM app_state');
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return {
      title: map.event_title || DEFAULT_TITLE,
      note: map.event_note ?? DEFAULT_NOTE,
      drawCompleted: map.draw_completed === 'true',
      drawAt: map.draw_at || null,
    };
  }

  async function updateEventInfo({ title, note }) {
    await ensureInitialized();
    if (typeof title === 'string' && title.trim()) {
      await setState(pool, 'event_title', title.trim().slice(0, 80));
    }
    if (typeof note === 'string') {
      await setState(pool, 'event_note', note.trim().slice(0, 240));
    }
    return getEventInfo();
  }

  async function createSession(
    tokenHash,
    role,
    participantId = null,
    ttlMs = 1000 * 60 * 60 * 24 * 7
  ) {
    await ensureInitialized();
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();
    await pool.query(
      'INSERT INTO sessions (token_hash, role, participant_id, expires_at) VALUES ($1, $2, $3, $4)',
      [tokenHash, role, participantId, expiresAt]
    );
    return expiresAt;
  }

  async function getSession(tokenHash, expectedRole) {
    if (!tokenHash) return null;
    await ensureInitialized();
    const { rows } = await pool.query(
      'SELECT token_hash, role, participant_id, expires_at FROM sessions WHERE token_hash = $1',
      [tokenHash]
    );
    const row = rows[0];
    if (!row || row.role !== expectedRole) return null;
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
      return null;
    }
    return row;
  }

  async function deleteSession(tokenHash) {
    if (!tokenHash) return;
    await ensureInitialized();
    await pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
  }

  async function purgeExpiredSessions() {
    await ensureInitialized();
    await pool.query('DELETE FROM sessions WHERE expires_at <= NOW()');
  }

  async function listParticipantsForAdmin() {
    await ensureInitialized();
    // Intentionally NEVER selects target_id so pairings remain strictly secret
    const { rows } = await pool.query(`
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
    `);
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

  async function resetDraw() {
    await ensureInitialized();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE participants SET target_id = NULL, revealed_at = NULL');
      await setState(client, 'draw_completed', 'false');
      await setState(client, 'draw_at', '');
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async function addParticipant(name, phoneDigits, phoneFormatted) {
    await ensureInitialized();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        'INSERT INTO participants (name, phone_digits, phone_formatted) VALUES ($1, $2, $3) RETURNING id',
        [name, phoneDigits, phoneFormatted]
      );
      const drawState = await client.query("SELECT value FROM app_state WHERE key = 'draw_completed'");
      if (drawState.rows[0] && drawState.rows[0].value === 'true') {
        await client.query('UPDATE participants SET target_id = NULL, revealed_at = NULL');
        await setState(client, 'draw_completed', 'false');
        await setState(client, 'draw_at', '');
      }
      await client.query('COMMIT');
      return {
        id: Number(rows[0].id),
        name,
        phoneFormatted,
        hasPassword: false,
        hasRevealed: false,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === '23505') {
        const dupErr = new Error('UNIQUE violation');
        throw dupErr;
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async function deleteParticipant(id) {
    await ensureInitialized();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query('SELECT id FROM participants WHERE id = $1', [id]);
      if (existing.rows.length === 0) {
        await client.query('ROLLBACK');
        return false;
      }
      const drawState = await client.query("SELECT value FROM app_state WHERE key = 'draw_completed'");
      if (drawState.rows[0] && drawState.rows[0].value === 'true') {
        await client.query('UPDATE participants SET target_id = NULL, revealed_at = NULL');
        await setState(client, 'draw_completed', 'false');
        await setState(client, 'draw_at', '');
      }
      await client.query('DELETE FROM participants WHERE id = $1', [id]);
      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async function resetParticipantPassword(id) {
    await ensureInitialized();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query('SELECT id FROM participants WHERE id = $1', [id]);
      if (existing.rows.length === 0) {
        await client.query('ROLLBACK');
        return false;
      }
      await client.query('UPDATE participants SET password_hash = NULL WHERE id = $1', [id]);
      await client.query(
        "DELETE FROM sessions WHERE role = 'participant' AND participant_id = $1",
        [id]
      );
      await client.query('COMMIT');
      return true;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async function findParticipantByPhone(phoneDigits) {
    await ensureInitialized();
    const { rows } = await pool.query(
      `SELECT
        id,
        name,
        phone_digits AS "phoneDigits",
        phone_formatted AS "phoneFormatted",
        password_hash AS "passwordHash"
      FROM participants
      WHERE phone_digits = $1`,
      [phoneDigits]
    );
    return rows[0] || null;
  }

  async function setParticipantPassword(id, passwordHash) {
    await ensureInitialized();
    const res = await pool.query(
      'UPDATE participants SET password_hash = $1 WHERE id = $2 AND password_hash IS NULL',
      [passwordHash, id]
    );
    return res.rowCount > 0;
  }

  async function getParticipantSelfView(participantId) {
    await ensureInitialized();
    const { rows } = await pool.query(
      `SELECT
        p.id,
        p.name,
        p.phone_formatted AS "phoneFormatted",
        p.target_id AS "targetId",
        p.revealed_at AS "revealedAt",
        t.name AS "targetName"
      FROM participants p
      LEFT JOIN participants t ON t.id = p.target_id
      WHERE p.id = $1`,
      [participantId]
    );
    const me = rows[0];
    if (!me) return null;

    const eventInfo = await getEventInfo();
    const countRes = await pool.query('SELECT COUNT(*)::int AS total FROM participants');

    return {
      id: Number(me.id),
      name: me.name,
      phoneFormatted: me.phoneFormatted,
      revealedAt: me.revealedAt ? new Date(me.revealedAt).toISOString() : null,
      totalParticipants: countRes.rows[0].total,
      event: eventInfo,
      enemy: eventInfo.drawCompleted && me.targetName ? { name: me.targetName } : null,
    };
  }

  async function markParticipantRevealed(participantId) {
    await ensureInitialized();
    const now = new Date().toISOString();
    await pool.query(
      'UPDATE participants SET revealed_at = COALESCE(revealed_at, $1) WHERE id = $2 AND target_id IS NOT NULL',
      [now, participantId]
    );
    return now;
  }

  async function runDraw() {
    await ensureInitialized();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query('SELECT id FROM participants ORDER BY id ASC FOR UPDATE');
      if (rows.length < 2) {
        await client.query('ROLLBACK');
        const err = new Error('Adicione pelo menos 2 participantes antes de realizar o sorteio.');
        err.statusCode = 400;
        throw err;
      }

      const ids = rows.map((r) => Number(r.id));
      const targets = generateDerangement(ids);

      await client.query('UPDATE participants SET target_id = NULL, revealed_at = NULL');
      for (let i = 0; i < ids.length; i++) {
        await client.query('UPDATE participants SET target_id = $1 WHERE id = $2', [
          targets[i],
          ids[i],
        ]);
      }

      const now = new Date().toISOString();
      await setState(client, 'draw_completed', 'true');
      await setState(client, 'draw_at', now);
      await client.query('COMMIT');

      return {
        participantCount: ids.length,
        drawAt: now,
      };
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // already rolled back
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async function close() {
    await pool.end();
  }

  return {
    getEventInfo,
    updateEventInfo,
    createSession,
    getSession,
    deleteSession,
    purgeExpiredSessions,
    listParticipantsForAdmin,
    addParticipant,
    deleteParticipant,
    resetParticipantPassword,
    findParticipantByPhone,
    setParticipantPassword,
    getParticipantSelfView,
    markParticipantRevealed,
    generateDerangement,
    runDraw,
    resetDraw,
    close,
  };
}

module.exports = { createPostgresDatabase };
