/**
 * Security middleware — rate limiting, input sanitization, request validation.
 * No external deps needed — uses only built-in Node.js + already installed packages.
 */

// ── In-memory rate limiter ────────────────────────────────────────────────────
const rateLimitStore = new Map(); // key -> { count, resetAt }

function rateLimit({ windowMs = 60_000, max = 60, keyFn = (req) => req.ip } = {}) {
  return (req, res, next) => {
    const key = keyFn(req);
    const now = Date.now();
    const entry = rateLimitStore.get(key);

    if (!entry || now > entry.resetAt) {
      rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    entry.count++;
    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      return res.status(429).json({ error: 'Слишком много запросов. Попробуйте позже.' });
    }
    next();
  };
}

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitStore) {
    if (now > val.resetAt) rateLimitStore.delete(key);
  }
}, 5 * 60_000);

// ── Strict rate limiter for auth endpoints ────────────────────────────────────
// 10 attempts per 15 minutes per IP
const authLimiter = rateLimit({ windowMs: 15 * 60_000, max: 10 });

// ── General API limiter ───────────────────────────────────────────────────────
// 500 requests per minute per IP (generous for single-user dev)
const apiLimiter = rateLimit({ windowMs: 60_000, max: 500 });

// ── Security headers (replaces helmet) ───────────────────────────────────────
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Don't restrict camera/mic — needed for WebRTC calls
  // res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.removeHeader('X-Powered-By');
  next();
}

// ── Input sanitizer — strips only actual XSS vectors ─────────────────────────
function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  // Only strip actual script injection — don't touch normal text/emoji/symbols
  return str
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/javascript:\s*/gi, '')
    .replace(/on(load|error|click|mouse\w+|key\w+|focus|blur|submit|change)\s*=/gi, '');
}

function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = deepSanitize(req.body);
  }
  next();
}

function deepSanitize(obj) {
  if (typeof obj === 'string') return sanitizeString(obj);
  if (Array.isArray(obj)) return obj.map(deepSanitize);
  if (obj && typeof obj === 'object') {
    const clean = {};
    for (const [k, v] of Object.entries(obj)) {
      // Don't sanitize base64 media fields — they're binary data
      if (['avatar', 'banner', 'media'].includes(k)) {
        clean[k] = v;
      } else {
        clean[k] = deepSanitize(v);
      }
    }
    return clean;
  }
  return obj;
}

// ── Validate username/email format ───────────────────────────────────────────
function validateRegistration(req, res, next) {
  const { username, email, password } = req.body;

  if (!username || !email || !password)
    return res.status(400).json({ error: 'Заполните все поля' });

  // Username: 3-30 chars, alphanumeric + underscore only
  if (!/^[a-zA-Z0-9_]{3,30}$/.test(username))
    return res.status(400).json({ error: 'Имя пользователя: 3-30 символов, только буквы, цифры и _' });

  // Basic email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: 'Неверный формат email' });

  // Password: min 8 chars
  if (password.length < 8)
    return res.status(400).json({ error: 'Пароль минимум 8 символов' });

  next();
}

// ── Payload size guard for non-media routes ───────────────────────────────────
function noLargePayload(req, res, next) {
  const contentLength = parseInt(req.headers['content-length'] || '0');
  if (contentLength > 10 * 1024) { // 10KB max for text-only routes
    return res.status(413).json({ error: 'Запрос слишком большой' });
  }
  next();
}

// ── WS connection rate limiter ────────────────────────────────────────────────
const wsConnectStore = new Map(); // ip -> { count, resetAt }

function wsRateLimit(ip) {
  const now = Date.now();
  const entry = wsConnectStore.get(ip);
  if (!entry || now > entry.resetAt) {
    wsConnectStore.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  entry.count++;
  return entry.count <= 20; // max 20 WS connections per minute per IP
}

module.exports = {
  authLimiter,
  apiLimiter,
  securityHeaders,
  sanitizeBody,
  validateRegistration,
  noLargePayload,
  wsRateLimit,
};
