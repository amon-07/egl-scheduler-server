const fs = require('fs');
const path = require('path');
const scheduler = require('../core/scheduler');
const log = require('../utils/logger');

const TAG = 'jobs';

function loadAll() {
  const jobDir = __dirname;
  const files = fs.readdirSync(jobDir).filter((f) => f.endsWith('.job.js'));

  for (const file of files) {
    const jobDef = require(path.join(jobDir, file));
    scheduler.register(jobDef);
    log.info(TAG, `Registered "${jobDef.name}"`, { file });
  }

  const registered = scheduler.listRegistered();
  log.info(TAG, `${registered.length} job type(s) loaded`, { jobs: registered });
  return registered;
}

module.exports = { loadAll };
