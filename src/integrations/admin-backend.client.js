const crypto = require('crypto');

function normalizeBaseUrl(baseUrl) {
  if (!baseUrl || typeof baseUrl !== 'string') return null;
  return baseUrl.replace(/\/+$/, '');
}

function buildHeaders({ method, path, rawBody }, extraHeaders = {}) {
  const timestamp = Date.now().toString();
  const keyId = process.env.ADMIN_BACKEND_HMAC_KEY_ID || process.env.SCHEDULER_HMAC_KEY_ID;
  const secret = process.env.ADMIN_BACKEND_HMAC_SECRET || process.env.SCHEDULER_HMAC_SECRET;

  const headers = {
    'content-type': 'application/json',
    'x-scheduler-key-id': keyId,
    'x-scheduler-timestamp': timestamp,
    ...extraHeaders,
  };

  if (!keyId || !secret) {
    throw new Error('SCHEDULER_HMAC_KEY_ID and SCHEDULER_HMAC_SECRET are required for admin backend HMAC');
  }

  const canonical = `${timestamp}.${method.toUpperCase()}.${path}.${rawBody}`;
  headers['x-scheduler-signature'] = crypto.createHmac('sha256', secret).update(canonical).digest('hex');

  return headers;
}

async function requestAdminBackend({ method = 'POST', path, body = {} }) {
  const baseUrl = normalizeBaseUrl(process.env.ADMIN_BACKEND_BASE_URL);
  const timeoutMs = Number(process.env.ADMIN_BACKEND_TIMEOUT_MS || 15000);

  if (!baseUrl) {
    throw new Error('ADMIN_BACKEND_BASE_URL is required for scheduler admin integration');
  }

  if (!path || typeof path !== 'string') {
    throw new Error('path is required for scheduler admin integration');
  }

  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const requestPath = path.startsWith('/') ? path : `/${path}`;
  const rawBody = body ? JSON.stringify(body) : '';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method,
      headers: buildHeaders({ method, path: requestPath, rawBody }),
      body: rawBody || undefined,
      signal: controller.signal,
    });

    const raw = await response.text();
    let parsed = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      parsed = { raw };
    }

    if (!response.ok) {
      const message = parsed?.message || `Admin backend request failed (${response.status})`;
      const error = new Error(message);
      error.status = response.status;
      error.response = parsed;
      throw error;
    }

    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}

async function runGlobalLeaderboardRecalculation({ gameId, participantType = 'Team', useCustomConfig = false }) {
  if (!gameId) throw new Error('gameId is required');

  const payload = {
    participantType,
    useCustomConfig: Boolean(useCustomConfig),
  };

  return requestAdminBackend({
    method: 'POST',
    path: `/internal/scheduler/leaderboard/${encodeURIComponent(gameId)}/global/recalculate`,
    body: payload,
  });
}

async function runPotmRecalculation({ gameId, month = null, year = null }) {
  if (!gameId) throw new Error('gameId is required');

  return requestAdminBackend({
    method: 'POST',
    path: `/internal/scheduler/leaderboard/${encodeURIComponent(gameId)}/potm/recalculate`,
    body: { month, year },
  });
}

module.exports = {
  runGlobalLeaderboardRecalculation,
  runPotmRecalculation,
};
