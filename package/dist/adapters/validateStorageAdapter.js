"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertStorageAdapter = assertStorageAdapter;
const errors_1 = require("../utils/errors");
const REQUIRED_STORE_METHODS = [
    'upsertScheduledJob',
    'markQueued',
    'markRunning',
    'markCompleted',
    'markFailed',
    'markDeadLetter',
    'markCancelled',
    'markExpired',
    'findReconcileCandidates',
    'getByJobId',
    'list',
];
function assertStorageAdapter(adapter) {
    if (!adapter || typeof adapter !== 'object') {
        throw new errors_1.InvalidScheduleError('Storage adapter must be an object.');
    }
    const missing = REQUIRED_STORE_METHODS.filter((method) => {
        return typeof adapter[method] !== 'function';
    });
    if (missing.length > 0) {
        throw new errors_1.InvalidScheduleError(`Storage adapter is missing required method(s): ${missing.join(', ')}.`);
    }
}
//# sourceMappingURL=validateStorageAdapter.js.map