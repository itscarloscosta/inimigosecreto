'use strict';

const { createStore, getPostgresConnectionString } = require('../lib/store');
const { createRequestHandler } = require('../server');

let cachedHandler = null;

function getHandler() {
  if (!cachedHandler) {
    const store = createStore();
    cachedHandler = createRequestHandler(store, { serveStatic: false });
  }
  return cachedHandler;
}

module.exports = async (req, res) => {
  try {
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let pathname = urlObj.pathname;
    if (
      (pathname === '/api/index' || pathname === '/api/index.js') &&
      urlObj.searchParams.has('__path')
    ) {
      pathname = '/api/' + urlObj.searchParams.get('__path').replace(/^\/+/, '');
    }

    if (req.method === 'GET' && pathname === '/api/health' && !getPostgresConnectionString() && process.env.VERCEL === '1') {
      res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(
        JSON.stringify({
          ok: false,
          dbConfigured: false,
          node: process.version,
          error:
            'Banco de dados Postgres não configurado na Vercel. Vá em Storage > Create Database > Neon Postgres, conecte ao projeto e faça Redeploy.',
        })
      );
      return;
    }

    const handler = getHandler();
    await handler(req, res);
  } catch (err) {
    console.error('[Vercel API Error]', err);
    const status = err.statusCode || 500;
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(
      JSON.stringify({
        error: err.statusCode ? err.message : `Erro interno do servidor: ${err.message}`,
      })
    );
  }
};
