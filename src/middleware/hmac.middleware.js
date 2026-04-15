const crypto = require('crypto');

function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;

  const aBuf = Buffer.from(a, 'hex');
  const bBuf = Buffer.from(b, 'hex');
  if (aBuf.length !== bBuf.length) return false;

  return crypto.timingSafeEqual(aBuf, bBuf);
}

function verifySchedulerHmac(req, res, next) {
  const keyId = req.header('x-scheduler-key-id');
  const timestamp = req.header('x-scheduler-timestamp');
  const signature = req.header('x-scheduler-signature');

  const expectedKeyId = process.env.SCHEDULER_HMAC_KEY_ID;
  const secret = process.env.SCHEDULER_HMAC_SECRET;
  const allowedSkewMs = Number(process.env.SCHEDULER_ALLOWED_SKEW_MS || 5 * 60 * 1000);

  if (!expectedKeyId || !secret) {
    return res.status(503).json({
      status: false,
      message: 'Scheduler HMAC is not configured.',
      error: { code: 'SCH503', cause: 'Missing SCHEDULER_HMAC_KEY_ID/SCHEDULER_HMAC_SECRET' },
    });
  }

  if (!keyId || !timestamp || !signature) {
    return res.status(401).json({
      status: false,
      message: 'Missing scheduler HMAC headers.',
      error: { code: 'SCH401', cause: 'missing_hmac_headers' },
    });
  }

  if (keyId !== expectedKeyId) {
    return res.status(401).json({
      status: false,
      message: 'Invalid scheduler key id.',
      error: { code: 'SCH401', cause: 'invalid_key_id' },
    });
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) {
    return res.status(401).json({
      status: false,
      message: 'Invalid scheduler timestamp.',
      error: { code: 'SCH401', cause: 'invalid_timestamp' },
    });
  }

  const now = Date.now();
  if (Math.abs(now - ts) > allowedSkewMs) {
    return res.status(401).json({
      status: false,
      message: 'Scheduler timestamp outside allowed skew window.',
      error: { code: 'SCH401', cause: 'timestamp_skew' },
    });
  }

  const path = req.originalUrl.split('?')[0];
  const rawBody = req.rawBody || '';
  const canonical = `${timestamp}.${req.method.toUpperCase()}.${path}.${rawBody}`;
  const expectedSignature = crypto.createHmac('sha256', secret).update(canonical).digest('hex');

  if (!timingSafeEqualHex(signature, expectedSignature)) {
    return res.status(401).json({
      status: false,
      message: 'Invalid scheduler signature.',
      error: { code: 'SCH401', cause: 'invalid_signature' },
    });
  }

  return next();
}

module.exports = { verifySchedulerHmac };
