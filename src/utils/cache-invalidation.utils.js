const Redis = require('ioredis');
const { redisConnection } = require('../config/redis.config');

const DEFAULT_INVALIDATION_CHANNEL = 'lazylayerscache:invalidation';
const LEGACY_INVALIDATION_CHANNEL = 'hybridcache:invalidation';

function invalidationChannelName(channel) {
  const trimmed = channel == null ? '' : String(channel).trim();
  if (!trimmed || trimmed === LEGACY_INVALIDATION_CHANNEL) return DEFAULT_INVALIDATION_CHANNEL;
  return trimmed;
}

const INVALIDATION_CHANNEL = invalidationChannelName(process.env.HYBRID_CACHE_INVALIDATION_CHANNEL);
const SOURCE_ID = `scheduler-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
const RETRY_INTERVAL_MS = 5000;
const RETRY_MAX_DELAY_MS = 60000;
const RETRY_MAX_QUEUE = 1000;

let _redis = null;
const _retryQueue = new Map();
let _retryTimer = null;
let _draining = false;

function redis() {
  if (!_redis) {
    _redis = new Redis(redisConnection);
    _redis.on('error', (err) => {
      console.warn('[scheduler-cache] redis error:', err.message);
    });
    _redis.on('ready', () => {
      drainRetryQueue().catch((err) => {
        console.warn('[scheduler-cache] retry drain failed:', err.message);
      });
    });
  }
  return _redis;
}

function redisReady() {
  try {
    return redis().status === 'ready';
  } catch {
    return false;
  }
}

function operationKey(operation) {
  if (!operation || !operation.type) return '';
  if (operation.type === 'del') return `del:${(operation.keys || []).join('|')}`;
  if (operation.type === 'pattern') return `pattern:${operation.pattern || ''}`;
  return JSON.stringify(operation);
}

function scheduleDrain(delayMs = RETRY_INTERVAL_MS) {
  if (_retryTimer) return;
  _retryTimer = setTimeout(() => {
    _retryTimer = null;
    drainRetryQueue().catch((err) => {
      console.warn('[scheduler-cache] retry drain failed:', err.message);
    });
  }, delayMs);
  if (typeof _retryTimer.unref === 'function') _retryTimer.unref();
}

function enqueueRetry(operation) {
  if (!operation || !operation.type) return;
  const key = operationKey(operation);
  if (!key) return;

  if (!_retryQueue.has(key) && _retryQueue.size >= RETRY_MAX_QUEUE) {
    const oldest = _retryQueue.keys().next().value;
    if (oldest) _retryQueue.delete(oldest);
  }

  const existing = _retryQueue.get(key);
  const attempts = existing?.attempts || 0;
  const delay = Math.min(RETRY_INTERVAL_MS * 2 ** attempts, RETRY_MAX_DELAY_MS);
  _retryQueue.set(key, {
    ...operation,
    attempts,
    nextRunAt: Date.now() + delay,
    enqueuedAt: existing?.enqueuedAt || Date.now(),
  });
  scheduleDrain(delay);
}

async function publishPayload(payload) {
  if (!redisReady()) throw new Error('Redis is not ready');
  await redis().publish(INVALIDATION_CHANNEL, JSON.stringify({ ...payload, source: SOURCE_ID, ts: Date.now() }));
}

async function scanDeletePattern(pattern, { count = 200 } = {}) {
  if (!pattern) return 0;
  if (!redisReady()) throw new Error('Redis is not ready');

  const client = redis();
  let cursor = '0';
  let deleted = 0;

  do {
    const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', count);
    cursor = nextCursor;
    if (keys && keys.length) {
      const chunkDeleted = await client.unlink(...keys);
      deleted += Number(chunkDeleted || 0);
    }
  } while (cursor !== '0');

  return deleted;
}

async function performDeleteAndPublish(operation) {
  if (!operation || !operation.type) return 0;

  if (operation.type === 'del') {
    const keys = Array.isArray(operation.keys) ? operation.keys.filter(Boolean) : [];
    if (!keys.length) return 0;
    if (!redisReady()) throw new Error('Redis is not ready');
    const deleted = await redis().unlink(...keys);
    await publishPayload({ type: 'del', keys });
    return Number(deleted || 0);
  }

  if (operation.type === 'pattern') {
    const deleted = await scanDeletePattern(operation.pattern, { count: operation.count || 200 });
    await publishPayload({ type: 'pattern', pattern: operation.pattern });
    return deleted;
  }

  return 0;
}

async function drainRetryQueue() {
  if (_draining) return;
  if (!redisReady()) {
    if (_retryQueue.size) scheduleDrain();
    return;
  }

  _draining = true;
  try {
    const now = Date.now();
    for (const [key, operation] of _retryQueue.entries()) {
      if (operation.nextRunAt > now) continue;
      try {
        await performDeleteAndPublish(operation);
        _retryQueue.delete(key);
      } catch (err) {
        const attempts = (operation.attempts || 0) + 1;
        const delay = Math.min(RETRY_INTERVAL_MS * 2 ** attempts, RETRY_MAX_DELAY_MS);
        _retryQueue.set(key, {
          ...operation,
          attempts,
          nextRunAt: Date.now() + delay,
        });
        console.warn('[scheduler-cache] retry failed:', { type: operation.type, error: err.message });
      }
    }
  } finally {
    _draining = false;
  }

  if (_retryQueue.size) scheduleDrain();
}

async function publishPatternInvalidation(pattern) {
  if (!pattern) return;
  const payload = {
    type: 'pattern',
    pattern,
  };
  try {
    await publishPayload(payload);
  } catch (err) {
    console.warn('[scheduler-cache] publish pattern invalidation failed:', { pattern, error: err.message });
    enqueueRetry({ type: 'pattern', pattern });
  }
}

async function publishDeleteInvalidation(keys) {
  if (!Array.isArray(keys) || !keys.length) return;
  const payload = {
    type: 'del',
    keys,
  };
  try {
    await publishPayload(payload);
  } catch (err) {
    console.warn('[scheduler-cache] publish del invalidation failed:', err.message);
    enqueueRetry({ type: 'del', keys });
  }
}

async function delAndPublish(keys) {
  const normalized = (Array.isArray(keys) ? keys : [keys]).filter(Boolean);
  if (!normalized.length) return 0;

  try {
    return await performDeleteAndPublish({ type: 'del', keys: normalized });
  } catch (err) {
    console.warn('[scheduler-cache] DEL/publish failed:', err.message);
    enqueueRetry({ type: 'del', keys: normalized });
    return 0;
  }
}

async function deleteByPatternAndPublish(pattern, { count = 200 } = {}) {
  if (!pattern) return 0;

  try {
    return await performDeleteAndPublish({ type: 'pattern', pattern, count });
  } catch (err) {
    console.warn('[scheduler-cache] deleteByPattern/publish failed:', { pattern, error: err.message });
    enqueueRetry({ type: 'pattern', pattern, count });
    return 0;
  }
}

async function shutdownCacheInvalidation() {
  if (_redis) {
    try {
      await _redis.quit();
    } catch {
      try {
        _redis.disconnect();
      } catch {
        // no-op
      }
    }
    _redis = null;
  }
  if (_retryTimer) {
    clearTimeout(_retryTimer);
    _retryTimer = null;
  }
}

module.exports = {
  publishPatternInvalidation,
  publishDeleteInvalidation,
  delAndPublish,
  deleteByPatternAndPublish,
  shutdownCacheInvalidation,
};
