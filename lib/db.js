'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { generateDerangement } = require('./derangement');

function createDatabase(dbPath) {
  const dir = path.dirname(dbPath);
  fs.mkdirSync(dir, { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  db.exec(`
    CREATE TABLE IF NOT EXISTS participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone_digits TEXT NOT NULL UNIQUE,
      phone_formatted TEXT NOT NULL,
      password_hash TEXT,
      target_id INTEGER UNIQUE REFERENCES participants(id) ON DELETE SET NULL,
      revealed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (target_id IS NULL OR target_id != id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      role TEXT NOT NULL CHECK (role IN ('admin', 'participant')),
      participant_id INTEGER REFERENCES participants(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Seed default event metadata
  const setDefault = db.prepare('INSERT OR IGNORE INTO app_state (key, value) VALUES (?, ?)');
  setDefault.run('draw_completed', 'false');
  setDefault.run('draw_at', '');
  setDefault.run('event_title', 'INIMIGOS SECRETO INFINITOS');
  setDefault.run('event_note', 'Presentes que a pessoa odeia ou jamais usaria — criatividade e zero noção liberadas!');

  // Upgrade previous default title if untouched
  db.prepare(
    "UPDATE app_state SET value = 'INIMIGOS SECRETO INFINITOS' WHERE key = 'event_title' AND value = 'Inimigo Secreto'"
  ).run();

  function getState(key, fallback = '') {
    const row = db.prepare('SELECT value FROM app_state WHERE key = ?').get(key);
    return row ? row.value : fallback;
  }

  function setState(key, value) {
    db.prepare(
      'INSERT INTO app_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    ).run(key, String(value));
  }

  function getEventInfo() {
    return {
      title: getState('event_title', 'INIMIGOS SECRETO INFINITOS'),
      note: getState('event_note', ''),
      drawCompleted: getState('draw_completed', 'false') === 'true',
      drawAt: getState('draw_at', '') || null,
    };
  }

  function updateEventInfo({ title, note }) {
    if (typeof title === 'string' && title.trim()) {
      setState('event_title', title.trim().slice(0, 80));
    }
    if (typeof note === 'string') {
      setState('event_note', note.trim().slice(0, 240));
    }
    return getEventInfo();
  }

  function createSession(tokenHash, role, participantId = null, ttlMs = 1000 * 60 * 60 * 24 * 7) {
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();
    db.prepare(
      'INSERT INTO sessions (token_hash, role, participant_id, expires_at) VALUES (?, ?, ?, ?)'
    ).run(tokenHash, role, participantId, expiresAt);
    return expiresAt;
  }

  function getSession(tokenHash, expectedRole) {
    if (!tokenHash) return null;
    const row = db
      .prepare('SELECT token_hash, role, participant_id, expires_at FROM sessions WHERE token_hash = ?')
      .get(tokenHash);
    if (!row) return null;
    if (row.role !== expectedRole) return null;
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
      return null;
    }
    return row;
  }

  function deleteSession(tokenHash) {
    if (!tokenHash) return;
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
  }

  function purgeExpiredSessions() {
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());
  }

  function listParticipantsForAdmin() {
    // Intentionally NEVER selects target_id so pairings remain strictly secret
    return db
      .prepare(
        `SELECT
          id,
          name,
          phone_formatted AS phoneFormatted,
          CASE WHEN password_hash IS NOT NULL THEN 1 ELSE 0 END AS hasPassword,
          CASE WHEN revealed_at IS NOT NULL THEN 1 ELSE 0 END AS hasRevealed,
          revealed_at AS revealedAt,
          created_at AS createdAt
        FROM participants
        ORDER BY id DESC`
      )
      .all()
      .map((r) => ({
        id: r.id,
        name: r.name,
        phoneFormatted: r.phoneFormatted,
        hasPassword: Boolean(r.hasPassword),
        hasRevealed: Boolean(r.hasRevealed),
        revealedAt: r.revealedAt || null,
        createdAt: r.createdAt,
      }));
  }

  function addParticipant(name, phoneDigits, phoneFormatted) {
    const stmt = db.prepare(
      'INSERT INTO participants (name, phone_digits, phone_formatted) VALUES (?, ?, ?)'
    );
    const info = stmt.run(name, phoneDigits, phoneFormatted);
    // Adding a member after a draw invalidates previous draw so everyone participates fairly
    if (getState('draw_completed') === 'true') {
      resetDraw();
    }
    return {
      id: Number(info.lastInsertRowid),
      name,
      phoneFormatted,
      hasPassword: false,
      hasRevealed: false,
    };
  }

  function deleteParticipant(id) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const existing = db.prepare('SELECT id FROM participants WHERE id = ?').get(id);
      if (!existing) {
        db.exec('ROLLBACK');
        return false;
      }
      const hadDraw = getState('draw_completed') === 'true';
      if (hadDraw) {
        db.prepare('UPDATE participants SET target_id = NULL, revealed_at = NULL').run();
        setState('draw_completed', 'false');
        setState('draw_at', '');
      }
      db.prepare('DELETE FROM participants WHERE id = ?').run(id);
      db.exec('COMMIT');
      return true;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  function resetParticipantPassword(id) {
    const existing = db.prepare('SELECT id FROM participants WHERE id = ?').get(id);
    if (!existing) return false;
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('UPDATE participants SET password_hash = NULL WHERE id = ?').run(id);
      db.prepare("DELETE FROM sessions WHERE role = 'participant' AND participant_id = ?").run(id);
      db.exec('COMMIT');
      return true;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  function findParticipantByPhone(phoneDigits) {
    return (
      db
        .prepare(
          'SELECT id, name, phone_digits AS phoneDigits, phone_formatted AS phoneFormatted, password_hash AS passwordHash FROM participants WHERE phone_digits = ?'
        )
        .get(phoneDigits) || null
    );
  }

  function setParticipantPassword(id, passwordHash) {
    const result = db
      .prepare('UPDATE participants SET password_hash = ? WHERE id = ? AND password_hash IS NULL')
      .run(passwordHash, id);
    return result.changes > 0;
  }

  function getParticipantSelfView(participantId) {
    const me = db
      .prepare(
        `SELECT
          p.id,
          p.name,
          p.phone_formatted AS phoneFormatted,
          p.target_id AS targetId,
          p.revealed_at AS revealedAt,
          t.name AS targetName
        FROM participants p
        LEFT JOIN participants t ON t.id = p.target_id
        WHERE p.id = ?`
      )
      .get(participantId);

    if (!me) return null;

    const eventInfo = getEventInfo();
    const totalCount = db.prepare('SELECT COUNT(*) AS total FROM participants').get().total;

    return {
      id: me.id,
      name: me.name,
      phoneFormatted: me.phoneFormatted,
      revealedAt: me.revealedAt || null,
      totalParticipants: totalCount,
      event: eventInfo,
      enemy: eventInfo.drawCompleted && me.targetName ? { name: me.targetName } : null,
    };
  }

  function markParticipantRevealed(participantId) {
    const now = new Date().toISOString();
    db.prepare(
      'UPDATE participants SET revealed_at = COALESCE(revealed_at, ?) WHERE id = ? AND target_id IS NOT NULL'
    ).run(now, participantId);
    return now;
  }

  function runDraw() {
    db.exec('BEGIN IMMEDIATE');
    try {
      const rows = db.prepare('SELECT id FROM participants ORDER BY id ASC').all();
      if (rows.length < 2) {
        db.exec('ROLLBACK');
        const err = new Error('Adicione pelo menos 2 participantes antes de realizar o sorteio.');
        err.statusCode = 400;
        throw err;
      }

      const ids = rows.map((r) => r.id);
      const targets = generateDerangement(ids);

      // Clear previous targets first to satisfy UNIQUE constraint cleanly
      db.prepare('UPDATE participants SET target_id = NULL, revealed_at = NULL').run();

      const updateStmt = db.prepare('UPDATE participants SET target_id = ? WHERE id = ?');
      for (let i = 0; i < ids.length; i++) {
        updateStmt.run(targets[i], ids[i]);
      }

      const now = new Date().toISOString();
      setState('draw_completed', 'true');
      setState('draw_at', now);
      db.exec('COMMIT');

      return {
        participantCount: ids.length,
        drawAt: now,
      };
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // already rolled back
      }
      throw err;
    }
  }

  function resetDraw() {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('UPDATE participants SET target_id = NULL, revealed_at = NULL').run();
      setState('draw_completed', 'false');
      setState('draw_at', '');
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  function close() {
    db.close();
  }

  return {
    db,
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

module.exports = { createDatabase };
