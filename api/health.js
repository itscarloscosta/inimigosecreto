'use strict';

const db = require('../lib/neon');
const { getDatabaseUrl, sendJson } = require('../lib/http');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Método não permitido.' });
  }

  const hasDb = Boolean(getDatabaseUrl());
  if (!hasDb) {
    return sendJson(res, 503, {
      ok: false,
      dbConfigured: false,
      runtime: 'vercel-serverless',
      node: process.version,
      error:
        'Banco Neon Postgres ainda não conectado. Na Vercel vá em Storage > Create Database > Neon Postgres > Connect to Project e clique em Redeploy.',
    });
  }

  try {
    const info = await db.getEventInfo();
    return sendJson(res, 200, {
      ok: true,
      dbConfigured: true,
      runtime: 'vercel-serverless',
      node: process.version,
      eventTitle: info.title,
    });
  } catch (err) {
    console.error('[health]', err);
    return sendJson(res, 500, {
      ok: false,
      dbConfigured: true,
      runtime: 'vercel-serverless',
      node: process.version,
      error: `Falha ao conectar no Postgres: ${err.message}`,
    });
  }
};
