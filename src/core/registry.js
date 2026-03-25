/**
 * Job Registry
 *
 * Central registry of all job types. Each job registers:
 *   - name:     unique identifier (e.g. "block:go-live")
 *   - handler:  async function(payload) → result
 *   - options:  optional BullMQ job options override
 *
 * Single Responsibility: only knows about mapping name → handler.
 * Open/Closed: new jobs register themselves, registry code never changes.
 */

const _handlers = new Map();

/**
 * Register a job handler.
 *
 * @param {object} jobDef
 * @param {string} jobDef.name       — unique job name
 * @param {function} jobDef.handler  — async (payload) => result
 * @param {object} [jobDef.options]  — BullMQ job options override (attempts, backoff, etc.)
 */
function register(jobDef) {
  if (!jobDef.name) throw new Error('Job definition must have a name');
  if (typeof jobDef.handler !== 'function') throw new Error(`Job "${jobDef.name}" must have a handler function`);

  if (_handlers.has(jobDef.name)) {
    throw new Error(`Job "${jobDef.name}" is already registered. Duplicate job names are not allowed.`);
  }

  _handlers.set(jobDef.name, {
    name: jobDef.name,
    handler: jobDef.handler,
    options: jobDef.options || {},
  });
}

/**
 * Get a registered job definition by name.
 *
 * @param {string} name
 * @returns {{ name: string, handler: function, options: object } | undefined}
 */
function get(name) {
  return _handlers.get(name);
}

/**
 * Check if a job type is registered.
 *
 * @param {string} name
 * @returns {boolean}
 */
function has(name) {
  return _handlers.has(name);
}

/**
 * Get all registered job names.
 *
 * @returns {string[]}
 */
function listRegistered() {
  return [..._handlers.keys()];
}

module.exports = { register, get, has, listRegistered };
