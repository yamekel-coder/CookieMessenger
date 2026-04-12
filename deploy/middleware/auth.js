const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'supersecretrefreshkey';
const ACCESS_TOKEN_EXPIRY = process.env.ACCESS_TOKEN_EXPIRY || '15m';
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || '7d';

if (!process.env.JWT_SECRET) {
  console.error('[SECURITY] WARNING: JWT_SECRET not set in environment! Using default insecure key.');
}

// ── In-memory caches ──────────────────────────────────────────────────────────
const userCache = new Map(); // userId -> { user, cachedAt }
const tokenBlacklist = new Set(); // Revoked tokens
const loginAttempts = new Map(); // userId -> { count, lockedUntil }

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

// ── Cache cleanup every 10 minutes ────────────────────────────────────────────
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of userCache) {
    if (now - val.cachedAt > CACHE_TTL) userCache.delete(key);
  }
  for (const [key, val] of loginAttempts) {
    if (now > val.lockedUntil) loginAttempts.delete(key);
  }
}, 10 * 60 * 1000);

// ── Prepared statements for performance ───────────────────────────────────────
const getUserStmt = db.prepare('SELECT id, username, email, role, is_banned, ban_reason, verified FROM users WHERE id = ?');
const getUserRolesStmt = db.prepare('SELECT role FROM user_roles WHERE user_id = ?');

// ── Token generation ──────────────────────────────────────────────────────────
function generateAccessToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    { id: user.id, type: 'refresh' },
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
}

// ── Get user with cache ───────────────────────────────────────────────────────
function getCachedUser(userId) {
  const cached = userCache.get(userId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    return cached.user;
  }
  
  const user = getUserStmt.get(userId);
  if (user) {
    // Get additional roles
    const roles = getUserRolesStmt.all(userId).map(r => r.role);
    user.roles = roles.length > 0 ? roles : [user.role || 'user'];
    userCache.set(userId, { user, cachedAt: Date.now() });
  }
  return user;
}

// ── Clear user cache (call after ban/unban/role change) ──────────────────────
function clearUserCache(userId) {
  userCache.delete(userId);
}

// ── Token revocation ──────────────────────────────────────────────────────────
function revokeToken(token) {
  tokenBlacklist.add(token);
  // Auto-cleanup after token expiry
  setTimeout(() => tokenBlacklist.delete(token), 15 * 60 * 1000);
}

function isTokenRevoked(token) {
  return tokenBlacklist.has(token);
}

// ── Login attempt tracking ────────────────────────────────────────────────────
function recordFailedLogin(userId) {
  const attempt = loginAttempts.get(userId) || { count: 0, lockedUntil: 0 };
  attempt.count++;
  
  if (attempt.count >= MAX_LOGIN_ATTEMPTS) {
    attempt.lockedUntil = Date.now() + LOCKOUT_DURATION;
    console.warn(`[AUTH] User ${userId} locked out after ${MAX_LOGIN_ATTEMPTS} failed attempts`);
  }
  
  loginAttempts.set(userId, attempt);
}

function isAccountLocked(userId) {
  const attempt = loginAttempts.get(userId);
  if (!attempt) return false;
  
  if (Date.now() < attempt.lockedUntil) {
    return { locked: true, remainingMs: attempt.lockedUntil - Date.now() };
  }
  
  loginAttempts.delete(userId);
  return false;
}

function clearLoginAttempts(userId) {
  loginAttempts.delete(userId);
}

// ── Request logging ───────────────────────────────────────────────────────────
function logAuthEvent(type, userId, details = {}) {
  const timestamp = new Date().toISOString();
  console.log(`[AUTH] ${timestamp} | ${type} | User: ${userId} | ${JSON.stringify(details)}`);
}

// ── Standard auth middleware ──────────────────────────────────────────────────
function auth(req, res, next) {
  // Try Authorization header first (backward compatibility)
  let token = req.headers.authorization?.split(' ')[1];
  
  // If no header token, try cookie
  if (!token && req.cookies?.auth_token) {
    token = req.cookies.auth_token;
  }
  
  if (!token) {
    logAuthEvent('NO_TOKEN', 'unknown', { ip: req.ip, path: req.path });
    return res.status(401).json({ error: 'Нет токена' });
  }

  // Check if token is revoked
  if (isTokenRevoked(token)) {
    logAuthEvent('REVOKED_TOKEN', 'unknown', { ip: req.ip });
    return res.status(401).json({ error: 'Токен отозван' });
  }

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    req.userId = req.user.id;
    req.token = token; // Store for potential revocation
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      logAuthEvent('TOKEN_EXPIRED', 'unknown', { ip: req.ip });
      return res.status(401).json({ error: 'Токен истёк, войдите снова', code: 'TOKEN_EXPIRED' });
    }
    logAuthEvent('INVALID_TOKEN', 'unknown', { ip: req.ip, error: err.message });
    return res.status(401).json({ error: 'Неверный токен' });
  }

  // Check account lock
  const lockStatus = isAccountLocked(req.user.id);
  if (lockStatus.locked) {
    const remainingMin = Math.ceil(lockStatus.remainingMs / 60000);
    return res.status(423).json({ 
      error: `Аккаунт временно заблокирован. Попробуйте через ${remainingMin} мин.`,
      code: 'ACCOUNT_LOCKED'
    });
  }

  // Get user with cache
  const user = getCachedUser(req.user.id);
  
  if (!user) {
    logAuthEvent('USER_NOT_FOUND', req.user.id, { ip: req.ip });
    return res.status(401).json({ error: 'Пользователь не найден' });
  }
  
  if (user.is_banned) {
    logAuthEvent('BANNED_ACCESS_ATTEMPT', req.user.id, { ip: req.ip });
    return res.status(403).json({ 
      error: `Аккаунт заблокирован: ${user.ban_reason || 'Нарушение правил'}`,
      code: 'ACCOUNT_BANNED'
    });
  }

  // Attach full user data to request
  req.userFull = user;
  req.userRoles = user.roles;

  next();
}

// ── Optional auth (doesn't fail if no token) ──────────────────────────────────
function optionalAuth(req, res, next) {
  let token = req.headers.authorization?.split(' ')[1];
  if (!token && req.cookies?.auth_token) {
    token = req.cookies.auth_token;
  }
  
  if (!token) return next();

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    req.userId = req.user.id;
    const user = getCachedUser(req.user.id);
    if (user && !user.is_banned) {
      req.userFull = user;
      req.userRoles = user.roles;
    }
  } catch (err) {
    // Silently fail for optional auth
  }
  
  next();
}

// ── Role-based access control ─────────────────────────────────────────────────
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.userRoles) {
      return res.status(403).json({ error: 'Доступ запрещён' });
    }
    
    const hasRole = allowedRoles.some(role => req.userRoles.includes(role));
    
    if (!hasRole) {
      logAuthEvent('INSUFFICIENT_PERMISSIONS', req.userId, { 
        required: allowedRoles, 
        has: req.userRoles,
        path: req.path 
      });
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    
    next();
  };
}

// ── Admin only ────────────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  return requireRole('admin')(req, res, next);
}

// ── Moderator or Admin ────────────────────────────────────────────────────────
function requireModerator(req, res, next) {
  return requireRole('admin', 'moderator')(req, res, next);
}

// ── Email verification check ──────────────────────────────────────────────────
function requireVerified(req, res, next) {
  if (!req.userFull?.verified) {
    return res.status(403).json({ 
      error: 'Требуется подтверждение email',
      code: 'EMAIL_NOT_VERIFIED'
    });
  }
  next();
}

// ── Refresh token verification ────────────────────────────────────────────────
function verifyRefreshToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET);
    if (decoded.type !== 'refresh') {
      throw new Error('Invalid token type');
    }
    return decoded;
  } catch (err) {
    return null;
  }
}

module.exports = {
  auth,
  optionalAuth,
  requireRole,
  requireAdmin,
  requireModerator,
  requireVerified,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  revokeToken,
  isTokenRevoked,
  clearUserCache,
  recordFailedLogin,
  clearLoginAttempts,
  isAccountLocked,
  logAuthEvent,
  JWT_SECRET,
  JWT_REFRESH_SECRET,
};
