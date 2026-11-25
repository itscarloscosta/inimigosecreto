'use strict';

const { createStore } = require('../lib/store');
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
    const handler = getHandler();
    await handler(req, res);
  } catch (err) {
    const status = err.statusCode || 500;
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(
      JSON.stringify({
        error: err.statusCode ? err.message : 'Erro interno do servidor.',
      })
    );
  }
};
