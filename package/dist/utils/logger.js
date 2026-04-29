"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLogger = createLogger;
const noop = () => undefined;
function createLogger(logger) {
    return {
        debug: logger?.debug ?? noop,
        info: logger?.info ?? noop,
        warn: logger?.warn ?? noop,
        error: logger?.error ?? noop,
    };
}
//# sourceMappingURL=logger.js.map