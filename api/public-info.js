'use strict';

const db = require('../lib/neon');
const { sendJson, handleApiError } = require('../lib/http');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Método não permitido.' });
  }

  try {
    const [info, totalParticipants] = await Promise.all([
      db.getEventInfo(),
      db.countParticipants(),
    ]);
    return sendJson(res, 200, {
      title: info.title,
      note: info.note,
      drawCompleted: info.drawCompleted,
      totalParticipants,
    });
  } catch (err) {
    return handleApiError(res, err);
  }
};
