/**
 * HTTP Utilities — Reusable HTTP caller for job callbacks
 *
 * When a delayed job fires, the worker uses this to call back
 * to the main backend. Handles timeouts and structured errors.
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

const DEFAULT_TIMEOUT = 10000; // 10s

/**
 * Make an HTTP request. Zero external dependencies.
 *
 * @param {object} opts
 * @param {string} opts.url       — full URL (http:// or https://)
 * @param {string} [opts.method]  — HTTP method (default: POST)
 * @param {object} [opts.headers] — extra headers
 * @param {object} [opts.body]    — JSON body (auto-serialized)
 * @param {number} [opts.timeout] — timeout in ms (default: 10000)
 * @returns {Promise<{ status: number, data: any, duration: number }>}
 */
function request({ url, method = 'POST', headers = {}, body = null, timeout = DEFAULT_TIMEOUT }) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const transport = isHttps ? https : http;

    const payload = body ? JSON.stringify(body) : null;

    const reqHeaders = {
      'content-type': 'application/json',
      accept: 'application/json',
      ...headers,
    };
    if (payload) reqHeaders['content-length'] = Buffer.byteLength(payload);

    const req = transport.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        method: method.toUpperCase(),
        headers: reqHeaders,
        timeout,
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => { rawData += chunk; });
        res.on('end', () => {
          const duration = Date.now() - startTime;
          let data;
          try {
            data = JSON.parse(rawData);
          } catch {
            data = rawData;
          }

          if (res.statusCode >= 400) {
            const err = new Error(`Callback returned ${res.statusCode}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
            err.status = res.statusCode;
            err.data = data;
            err.duration = duration;
            return reject(err);
          }

          resolve({ status: res.statusCode, data, duration });
        });
      },
    );

    req.on('timeout', () => {
      req.destroy();
      const err = new Error(`Callback timed out after ${timeout}ms: ${method} ${url}`);
      err.code = 'TIMEOUT';
      reject(err);
    });

    req.on('error', (err) => {
      err.message = `Callback failed: ${method} ${url} — ${err.message}`;
      reject(err);
    });

    if (payload) req.write(payload);
    req.end();
  });
}

module.exports = { request };
