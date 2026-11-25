import { getDatabaseUrl, getEventInfo } from '../../../lib/db.js';
import { jsonResponse } from '../../../lib/api-helpers.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const hasDb = Boolean(getDatabaseUrl());
  if (!hasDb) {
    return jsonResponse(
      {
        ok: false,
        dbConfigured: false,
        node: process.version,
        error:
          'Banco PostgreSQL não configurado. No Docker use "docker compose up --build". Na Vercel conecte o Neon Postgres em Storage > Create Database.',
      },
      503
    );
  }

  try {
    const info = await getEventInfo();
    return jsonResponse({
      ok: true,
      dbConfigured: true,
      node: process.version,
      eventTitle: info.title,
    });
  } catch (err) {
    console.error('[health]', err);
    return jsonResponse(
      {
        ok: false,
        dbConfigured: true,
        node: process.version,
        error: `Falha ao conectar no PostgreSQL: ${err.message}`,
      },
      500
    );
  }
}
