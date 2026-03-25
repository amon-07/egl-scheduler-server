/**
 * Time Utilities — IST (Indian Standard Time, UTC+5:30)
 *
 * All human-readable inputs are interpreted as IST.
 * Returns UTC Date objects (BullMQ needs UTC internally).
 *
 * Supported formats:
 *   Time only:    "11 AM", "3:30 PM", "14:00"                → today IST (tomorrow if passed)
 *   Date + Time:  "25-03-2026 3:30 PM", "2026-03-25 14:00"   → exact IST
 *   Relative:     "in 5m", "in 2h", "in 30s", "in 1d"        → from now
 *   ISO string:   "2026-03-25T10:00:00Z"                      → exact UTC
 *   Unix ms:      1711360000000                                → exact
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Get current moment with IST values in UTC fields */
function _nowAsIST() {
  return new Date(Date.now() + IST_OFFSET_MS);
}

/** Build a real UTC Date from IST year/month/day/hours/minutes */
function _istToUTC(year, month, day, hours, minutes) {
  const d = new Date(Date.UTC(year, month, day, hours, minutes, 0, 0));
  return new Date(d.getTime() - IST_OFFSET_MS);
}

/** Parse hour + optional minutes + optional AM/PM into 24h values */
function _parseHoursMinutes(hoursStr, minutesStr, meridiem) {
  let hours = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr || '0', 10);

  if (meridiem) {
    const m = meridiem.toUpperCase();
    if (hours < 1 || hours > 12) throw new Error(`Invalid hour for 12h format: ${hours}`);
    if (m === 'AM' && hours === 12) hours = 0;
    if (m === 'PM' && hours !== 12) hours += 12;
  } else {
    if (hours < 0 || hours > 23) throw new Error(`Invalid hour for 24h format: ${hours}`);
  }

  if (minutes < 0 || minutes > 59) throw new Error(`Invalid minutes: ${minutes}`);

  return { hours, minutes };
}

// ── Patterns ──────────────────────────────────────────────────────────

// "11 AM", "3:30 PM", "14:00"
const TIME_ONLY_RE = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i;

// "25-03-2026 3:30 PM", "25/03/2026 14:00"
const DATE_TIME_DMY_RE = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i;

// "2026-03-25 3:30 PM", "2026/03/25 14:00"
const DATE_TIME_YMD_RE = /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\s+(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i;

// "in 5m", "in 2h", "in 30s", "in 1d"
const RELATIVE_RE = /^in\s+(\d+)\s*(s|sec|m|min|h|hr|hour|d|day)s?$/i;

/**
 * Parse a time input (interpreted as IST) into a UTC Date.
 *
 * @param {string|number} input
 * @returns {Date} — UTC Date
 */
function parseTime(input) {
  if (!input) throw new Error('Time input is required');

  // Unix timestamp (ms)
  if (typeof input === 'number') return new Date(input);

  const trimmed = String(input).trim();

  // ── Relative: "in 5m", "in 2h" ──
  const relMatch = trimmed.match(RELATIVE_RE);
  if (relMatch) {
    const value = parseInt(relMatch[1], 10);
    const unit = relMatch[2].toLowerCase();
    const mult = {
      s: 1000, sec: 1000,
      m: 60_000, min: 60_000,
      h: 3_600_000, hr: 3_600_000, hour: 3_600_000,
      d: 86_400_000, day: 86_400_000,
    };
    return new Date(Date.now() + value * mult[unit]);
  }

  // ── ISO-8601 (contains "T") ──
  if (trimmed.includes('T')) {
    const d = new Date(trimmed);
    if (isNaN(d.getTime())) throw new Error(`Invalid ISO time: ${trimmed}`);
    return d;
  }

  // ── Date + Time (DD-MM-YYYY ...) ──
  const dmyMatch = trimmed.match(DATE_TIME_DMY_RE);
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10);
    const month = parseInt(dmyMatch[2], 10) - 1;
    const year = parseInt(dmyMatch[3], 10);
    const { hours, minutes } = _parseHoursMinutes(dmyMatch[4], dmyMatch[5], dmyMatch[6]);
    return _istToUTC(year, month, day, hours, minutes);
  }

  // ── Date + Time (YYYY-MM-DD ...) ──
  const ymdMatch = trimmed.match(DATE_TIME_YMD_RE);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    const { hours, minutes } = _parseHoursMinutes(ymdMatch[4], ymdMatch[5], ymdMatch[6]);
    return _istToUTC(year, month, day, hours, minutes);
  }

  // ── Time only (today IST, or tomorrow if already passed) ──
  const timeMatch = trimmed.match(TIME_ONLY_RE);
  if (timeMatch) {
    const { hours, minutes } = _parseHoursMinutes(timeMatch[1], timeMatch[2], timeMatch[3]);

    const ist = _nowAsIST();
    let year = ist.getUTCFullYear();
    let month = ist.getUTCMonth();
    let day = ist.getUTCDate();

    const target = _istToUTC(year, month, day, hours, minutes);

    // Already passed today → schedule for tomorrow IST
    if (target.getTime() <= Date.now()) {
      const tomorrow = new Date(ist.getTime() + 86_400_000);
      return _istToUTC(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth(), tomorrow.getUTCDate(), hours, minutes);
    }

    return target;
  }

  throw new Error(
    `Cannot parse time: "${input}". Supported formats:\n` +
    `  Time only:   "11 AM", "3:30 PM", "14:00"\n` +
    `  Date + Time: "25-03-2026 3:30 PM", "2026-03-25 14:00"\n` +
    `  Relative:    "in 5m", "in 2h", "in 30s"\n` +
    `  ISO:         "2026-03-25T10:00:00Z"`,
  );
}

/**
 * Format a UTC Date as a human-readable IST string.
 *
 * @param {Date} date
 * @returns {string} e.g. "25 Mar 2026, 3:30 PM IST"
 */
function formatIST(date) {
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: true,
  }) + ' IST';
}

/**
 * Format milliseconds into a human-readable duration.
 * e.g. 90061000 → "1d 1h 1m 1s"
 */
function formatDelay(ms) {
  if (ms < 1000) return `${ms}ms`;

  const seconds = Math.floor(ms / 1000);
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s) parts.push(`${s}s`);
  return parts.join(' ') || '0s';
}

module.exports = { parseTime, formatIST, formatDelay };
