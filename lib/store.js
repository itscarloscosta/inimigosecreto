'use strict';

const path = require('node:path');

function getPostgresConnectionString() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.NEON_DATABASE_URL ||
    ''
  ).trim();
}

function createStore(options = {}) {
  if (options.dbPath) {
    const { createDatabase } = require('./db');
    return createDatabase(options.dbPath);
  }

  const pgUrl = getPostgresConnectionString();
  if (pgUrl) {
    const { createPostgresDatabase } = require('./db-postgres');
    return createPostgresDatabase(pgUrl);
  }

  if (process.env.VERCEL === '1') {
    const err = new Error(
      'Banco de dados Postgres não configurado na Vercel. Acesse o painel da Vercel > Storage > Create Database (Neon Postgres), conecte ao projeto e faça Redeploy.'
    );
    err.statusCode = 503;
    throw err;
  }

  const { createDatabase } = require('./db');
  const localDbPath = path.join(__dirname, '..', 'data', 'inimigo-secreto.db');
  return createDatabase(localDbPath);
}

module.exports = { createStore, getPostgresConnectionString };
