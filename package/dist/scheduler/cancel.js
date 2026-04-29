"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelJob = cancelJob;
async function cancelJob(deps, jobId) {
    const existing = await deps.store.getByJobId(jobId);
    const removed = existing?.bullJobId
        ? await deps.queue.remove(existing.bullJobId).catch(() => false)
        : false;
    const record = await deps.store.markCancelled(jobId);
    return {
        status: 'ok',
        cancelled: Boolean(record || removed),
        jobId,
    };
}
//# sourceMappingURL=cancel.js.map