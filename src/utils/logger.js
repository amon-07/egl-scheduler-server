'use strict';

/**
 * Structured Logger for Scheduler Server
 *
 * Outputs JSON-structured logs to stdout/stderr for journalctl consumption.
 * Each log line includes: timestamp, level, tag, message, and optional context.
 */

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const CURRENT_LEVEL = LOG_LEVELS[process.env.SCHEDULER_LOG_LEVEL || 'info'] ?? LOG_LEVELS.info;

function formatLog(level, tag, message, context) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    tag,
    msg: message,
  };

  if (context && typeof context === 'object' && Object.keys(context).length > 0) {
    entry.ctx = context;
  }

  return JSON.stringify(entry);
}

function debug(tag, message, context) {
  if (CURRENT_LEVEL > LOG_LEVELS.debug) return;
  console.log(formatLog('debug', tag, message, context));
}

function info(tag, message, context) {
  if (CURRENT_LEVEL > LOG_LEVELS.info) return;
  console.log(formatLog('info', tag, message, context));
}

function warn(tag, message, context) {
  if (CURRENT_LEVEL > LOG_LEVELS.warn) return;
  console.warn(formatLog('warn', tag, message, context));
}

function error(tag, message, context) {
  console.error(formatLog('error', tag, message, context));
}

module.exports = { debug, info, warn, error };
