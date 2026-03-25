/**
 * Redis Configuration — Single Source of Truth
 *
 * Every module that needs Redis imports from here.
 * Never construct redis config elsewhere.
 */

const redisConnection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  username: process.env.REDIS_USERNAME || undefined,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
};

module.exports = { redisConnection };
