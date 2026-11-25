import { countParticipants, getEventInfo } from '../../../lib/db.js';
import { handleRouteError, jsonResponse } from '../../../lib/api-helpers.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [info, totalParticipants] = await Promise.all([
      getEventInfo(),
      countParticipants(),
    ]);
    return jsonResponse({
      title: info.title,
      note: info.note,
      drawCompleted: info.drawCompleted,
      totalParticipants,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
