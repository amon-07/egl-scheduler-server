'use strict';

/**
 * Request Logger Middleware
 *
 * Logs every incoming request and its response with:
 * - Method, path, request body (sanitized)
 * - Response status code and duration
 * - A unique request ID for tracing
 */

const crypto = require('crypto');
const log = require('../utils/logger');

const TAG = 'http';

function requestLogger(req, res, next) {
  const requestId = crypto.randomBytes(6).toString('hex');
  const start = Date.now();

  req.requestId = requestId;

  // Log incoming request
  const logBody = {};
  if (req.body && typeof req.body === 'object') {
    for (const [key, value] of Object.entries(req.body)) {
      if (key.startsWith('_') || key === 'signature') continue;
      logBody[key] = value;
    }
  }

  log.info(TAG, `--> ${req.method} ${req.originalUrl}`, {
    requestId,
    params: Object.keys(req.params).length ? req.params : undefined,
    body: Object.keys(logBody).length ? logBody : undefined,
    ip: req.ip || req.connection?.remoteAddress,
  });

  // Capture response finish
  const originalJson = res.json.bind(res);
  res.json = function (body) {
    const duration = Date.now() - start;
    const status = res.statusCode;

    const responseCtx = {
      requestId,
      status,
      durationMs: duration,
    };

    // Include action from response body if present (e.g. 'scheduled', 'cancelled')
    if (body && typeof body === 'object') {
      if (body.action) responseCtx.action = body.action;
      if (body.jobId) responseCtx.jobId = body.jobId;
      if (body.runAt) responseCtx.runAt = body.runAt;
    }

    if (status >= 400) {
      log.warn(TAG, `<-- ${req.method} ${req.originalUrl} ${status} (${duration}ms)`, {
        ...responseCtx,
        error: body?.message || body?.error,
      });
    } else {
      log.info(TAG, `<-- ${req.method} ${req.originalUrl} ${status} (${duration}ms)`, responseCtx);
    }

    return originalJson(body);
  };

  next();
}

module.exports = { requestLogger };
