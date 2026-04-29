"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeRunAt = normalizeRunAt;
exports.getDelayMs = getDelayMs;
exports.isExpired = isExpired;
const errors_1 = require("./errors");
function normalizeRunAt(runAt) {
    const date = runAt instanceof Date ? runAt : new Date(runAt);
    if (Number.isNaN(date.getTime())) {
        throw new errors_1.InvalidScheduleError(`runAt must be a valid date value. Received: ${String(runAt)}`);
    }
    return date;
}
function getDelayMs(runAt, now = Date.now()) {
    return Math.max(runAt.getTime() - now, 0);
}
function isExpired(runAt, ttlMs, now = Date.now()) {
    if (!ttlMs || ttlMs <= 0)
        return false;
    return runAt.getTime() + ttlMs < now;
}
//# sourceMappingURL=time.js.map