/**
 * Job Auto-Loader
 *
 * Scans this directory for *.job.js files and registers each one.
 * To add a new job type: create a file like "my-thing.job.js" here.
 * No other code changes needed — Open/Closed principle.
 *
 * Each .job.js file must export:
 *   {
 *     name:    'job:name',                          — unique identifier
 *     handler: async (payload, context) => result,  — the work to do
 *     options: { attempts: 3, ... }                 — optional BullMQ overrides
 *   }
 */

const fs = require('fs');
const path = require('path');
const registry = require('../core/registry');
const log = require('../utils/logger');

const TAG = 'jobs';

function loadAll() {
  const jobDir = __dirname;
  const files = fs.readdirSync(jobDir).filter((f) => f.endsWith('.job.js'));

  for (const file of files) {
    const jobDef = require(path.join(jobDir, file));
    registry.register(jobDef);
    log.info(TAG, `Registered "${jobDef.name}"`, { file });
  }

  const registered = registry.listRegistered();
  log.info(TAG, `${registered.length} job type(s) loaded`, { jobs: registered });
}

module.exports = { loadAll };
