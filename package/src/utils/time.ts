import { InvalidScheduleError } from './errors';

export function normalizeRunAt(runAt: Date | string | number): Date {
  const date = runAt instanceof Date ? runAt : new Date(runAt);

  if (Number.isNaN(date.getTime())) {
    throw new InvalidScheduleError(`runAt must be a valid date value. Received: ${String(runAt)}`);
  }

  return date;
}

export function getDelayMs(runAt: Date, now = Date.now()): number {
  return Math.max(runAt.getTime() - now, 0);
}

export function isExpired(runAt: Date, ttlMs?: number, now = Date.now()): boolean {
  if (!ttlMs || ttlMs <= 0) return false;
  return runAt.getTime() + ttlMs < now;
}
