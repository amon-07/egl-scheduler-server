"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRedisLock = createRedisLock;
const node_crypto_1 = require("node:crypto");
const ioredis_1 = __importDefault(require("ioredis"));
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;
function createRedisLock(config) {
    const enabled = config.enabled !== false;
    const ownsClient = !isRedisClient(config.redisConnection);
    const client = enabled
        ? (isRedisClient(config.redisConnection)
            ? config.redisConnection
            : new ioredis_1.default(config.redisConnection))
        : null;
    const keyPrefix = config.keyPrefix ?? 'lazy-scheduler';
    const instanceId = config.instanceId ?? (0, node_crypto_1.randomUUID)();
    const defaultTtlMs = config.ttlMs ?? 30000;
    return {
        async acquire(name, ttlMs = defaultTtlMs) {
            if (!enabled || !client) {
                return {
                    key: `${keyPrefix}:lock:${name}`,
                    token: 'locks-disabled',
                    release: async () => undefined,
                };
            }
            const key = `${keyPrefix}:lock:${name}`;
            const token = `${instanceId}:${(0, node_crypto_1.randomUUID)()}`;
            const result = await client.set(key, token, 'PX', ttlMs, 'NX');
            if (result !== 'OK')
                return null;
            return {
                key,
                token,
                release: async () => {
                    await client.eval(RELEASE_SCRIPT, 1, key, token).catch((error) => {
                        config.logger.warn('lazy-scheduler:lock', 'Failed to release Redis lock', {
                            key,
                            error: error instanceof Error ? error.message : String(error),
                        });
                    });
                },
            };
        },
        async close() {
            if (ownsClient && client?.quit) {
                await client.quit();
            }
        },
    };
}
function isRedisClient(value) {
    return Boolean(value
        && typeof value === 'object'
        && typeof value.set === 'function'
        && typeof value.eval === 'function');
}
//# sourceMappingURL=redisLock.js.map