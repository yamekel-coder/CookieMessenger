/**
 * Security middleware — rate limiting, input sanitization, request validation.
 */

// ── In-memory rate limiter ────────────────────────────────────────────────────
function createRateLimiter({ windowMs = 60_000, max = 60, keyFn = (req) => req.ip } = {}) {
  const store = new Map();

  // Cleanup old entries every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [key, val] of store) {
      if (now > val.resetAt) store.delete(key);
    }
  }, 5 * 60_000);

  return (req, res, next) => {
    const key = keyFn(req);
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now > entry.resetAt) {
      store.set(key, { count: 1, resetAt: now + windowMs });
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

// ── Auth rate limiter: 30 attempts per 15 min per IP ─────────────────────────
const authLimiter = createRateLimiter({ windowMs: 15 * 60_000, max: 30 });

// ── General API limiter: 500 req/min per IP ───────────────────────────────────
const apiLimiter = createRateLimiter({ windowMs: 60_000, max: 500 });

// ── Security headers ──────────────────────────────────────────────────────────
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains'); // HTTPS only
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()'); // Disable unnecessary APIs
  res.removeHeader('X-Powered-By');
  next();
}

// ── Input sanitizer — strips XSS vectors only ────────────────────────────────
function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/javascript:\s*/gi, '')
    .replace(/on(load|error|click|mouse\w+|key\w+|focus|blur|submit|change)\s*=/gi, '');
}

function deepSanitize(obj) {
  if (typeof obj === 'string') return sanitizeString(obj);
  if (Array.isArray(obj)) return obj.map(deepSanitize);
  if (obj && typeof obj === 'object') {
    const clean = {};
    for (const [k, v] of Object.entries(obj)) {
      // Don't sanitize base64 media fields
      if (['avatar', 'banner', 'media', 'profile_music'].includes(k)) {
        clean[k] = v;
      } else {
        clean[k] = deepSanitize(v);
      }
    }
    return clean;
  }
  return obj;
}

function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = deepSanitize(req.body);
  }
  next();
}

// ── Registration validation ───────────────────────────────────────────────────
function validateRegistration(req, res, next) {
  const { username, email, password } = req.body;

  if (!username || !email || !password)
    return res.status(400).json({ error: 'Заполните все поля' });

  if (!/^[a-zA-Z0-9_]{3,30}$/.test(username))
    return res.status(400).json({ error: 'Имя пользователя: 3-30 символов, только буквы, цифры и _' });

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: 'Неверный формат email' });

  if (email.length > 254)
    return res.status(400).json({ error: 'Email слишком длинный' });

  if (password.length < 8)
    return res.status(400).json({ error: 'Пароль минимум 8 символов' });

  if (password.length > 128)
    return res.status(400).json({ error: 'Пароль слишком длинный' });

  next();
}

// ── WS connection rate limiter ────────────────────────────────────────────────
const wsConnectStore = new Map();

function wsRateLimit(ip) {
  const now = Date.now();
  const entry = wsConnectStore.get(ip);
  if (!entry || now > entry.resetAt) {
    wsConnectStore.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  entry.count++;
  return entry.count <= 20;
}

// ── Field length validator factory ───────────────────────────────────────────
function validateLengths(rules) {
  return (req, res, next) => {
    for (const [field, max] of Object.entries(rules)) {
      const val = req.body[field];
      if (val && typeof val === 'string' && val.length > max) {
        return res.status(400).json({ error: `Поле "${field}" слишком длинное (макс. ${max} символов)` });
      }
    }
    next();
  };
}

module.exports = {
  authLimiter,
  apiLimiter,
  securityHeaders,
  sanitizeBody,
  validateRegistration,
  wsRateLimit,
  validateLengths,
};
