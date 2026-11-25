'use strict';

const crypto = require('node:crypto');

/**
 * Generates a uniformly random derangement using cryptographically secure
 * Fisher-Yates shuffling:
 * - Nobody draws themselves (target[i] !== ids[i])
 * - Nobody draws the same person (bijection / 1-to-1 permutation)
 */
function generateDerangement(ids) {
  const n = ids.length;
  if (n < 2) {
    const err = new Error('Adicione pelo menos 2 participantes antes de realizar o sorteio.');
    err.statusCode = 400;
    throw err;
  }

  const shuffled = [...ids];
  for (let attempt = 0; attempt < 10000; attempt++) {
    for (let i = n - 1; i > 0; i--) {
      const j = crypto.randomInt(0, i + 1);
      const tmp = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = tmp;
    }
    let valid = true;
    for (let i = 0; i < n; i++) {
      if (shuffled[i] === ids[i]) {
        valid = false;
        break;
      }
    }
    if (valid) {
      return shuffled;
    }
  }

  // Deterministic cyclic fallback (expected attempts ~2.72, mathematically unreachable)
  return ids.map((_, i) => ids[(i + 1) % n]);
}

module.exports = { generateDerangement };
