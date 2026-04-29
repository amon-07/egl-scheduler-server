"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRegistry = createRegistry;
const errors_1 = require("../utils/errors");
function createRegistry() {
    const handlers = new Map();
    return {
        register(input) {
            if (!input.name || typeof input.name !== 'string') {
                throw new errors_1.InvalidScheduleError('Job registration requires a non-empty name.');
            }
            if (typeof input.handler !== 'function') {
                throw new errors_1.InvalidScheduleError(`Job "${input.name}" requires a handler function.`);
            }
            if (handlers.has(input.name)) {
                throw new errors_1.DuplicateJobError(input.name);
            }
            handlers.set(input.name, {
                name: input.name,
                handler: input.handler,
                defaultOptions: input.defaultOptions ?? {},
            });
        },
        get(name) {
            return handlers.get(name);
        },
        has(name) {
            return handlers.has(name);
        },
        list() {
            return [...handlers.keys()];
        },
    };
}
//# sourceMappingURL=registry.js.map