const Redis = require('ioredis');
const { redisConnection } = require('../config/redis.config');

const INVALIDATION_CHANNEL = process.env.HYBRID_CACHE_INVALIDATION_CHANNEL || 'hybridcache:invalidation';
const SOURCE_ID = `scheduler-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;

let _redis = null;

function redis() {
  if (!_redis) {
    _redis = new Redis(redisConnection);
    _redis.on('error', (err) => {
      console.warn('[scheduler-cache] redis error:', err.message);
    });
  }
  return _redis;
}

async function publishPatternInvalidation(pattern) {
  if (!pattern) return;
  const payload = {
    type: 'pattern',
    pattern,
    source: SOURCE_ID,
    ts: Date.now(),
  };
  await redis().publish(INVALIDATION_CHANNEL, JSON.stringify(payload));
}

async function publishDeleteInvalidation(keys) {
  if (!Array.isArray(keys) || !keys.length) return;
  const payload = {
    type: 'del',
    keys,
    source: SOURCE_ID,
    ts: Date.now(),
  };
  await redis().publish(INVALIDATION_CHANNEL, JSON.stringify(payload));
}

async function delAndPublish(keys) {
  const normalized = (Array.isArray(keys) ? keys : [keys]).filter(Boolean);
  if (!normalized.length) return 0;

  let deleted = 0;
  try {
    deleted = await redis().del(normalized);
  } catch (err) {
    console.warn('[scheduler-cache] DEL failed:', err.message);
  }

  try {
    await publishDeleteInvalidation(normalized);
  } catch (err) {
    console.warn('[scheduler-cache] publish del invalidation failed:', err.message);
  }

  return Number(deleted || 0);
}

async function deleteByPatternAndPublish(pattern, { count = 200 } = {}) {
  if (!pattern) return 0;

  const client = redis();
  let cursor = '0';
  let deleted = 0;

  try {
    do {
      const [nextCursor, keys] = await client.scan(cursor, 'MATCH', pattern, 'COUNT', count);
      cursor = nextCursor;
      if (keys && keys.length) {
        const chunkDeleted = await client.del(keys);
        deleted += Number(chunkDeleted || 0);
      }
    } while (cursor !== '0');
  } catch (err) {
    console.warn('[scheduler-cache] deleteByPattern scan/del failed:', { pattern, error: err.message });
  }

  try {
    await publishPatternInvalidation(pattern);
  } catch (err) {
    console.warn('[scheduler-cache] publish pattern invalidation failed:', { pattern, error: err.message });
  }

  return deleted;
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
}

module.exports = {
  publishPatternInvalidation,
  publishDeleteInvalidation,
  delAndPublish,
  deleteByPatternAndPublish,
  shutdownCacheInvalidation,
};
