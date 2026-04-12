const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authLimiter, validateRegistration } = require('../middleware/security');
const {
  auth,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  revokeToken,
  clearLoginAttempts,
  recordFailedLogin,
  isAccountLocked,
  logAuthEvent,
  clearUserCache,
} = require('../middleware/auth');
const {
  saveRefreshToken,
  deleteRefreshToken,
  deleteAllUserTokens,
  findRefreshToken,
  getUserActiveSessions,
  logLoginAttempt,
  getRecentLoginAttempts,
  parseDeviceInfo,
} = require('../utils/tokenManager');

const router = express.Router();

// ── Registration ──────────────────────────────────────────────────────────────
router.post('/register', authLimiter, validateRegistration, async (req, res) => {
  const { username, email, password } = req.body;

  try {
    // bcrypt cost 12 — stronger than default 10
    const hashed = await bcrypt.hash(password, 12);
    const stmt = db.prepare('INSERT INTO users (username, email, password) VALUES (?, ?, ?)');
    const result = stmt.run(username, email.toLowerCase().trim(), hashed);
    
    logAuthEvent('REGISTER_SUCCESS', result.lastInsertRowid, { username, ip: req.ip });
    
    res.json({ message: 'Регистрация успешна' });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      logAuthEvent('REGISTER_DUPLICATE', 'unknown', { username, email, ip: req.ip });
      return res.status(409).json({ error: 'Пользователь уже существует' });
    }
    console.error('[REGISTER_ERROR]', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ── Login ─────────────────────────────────────────────────────────────────────
router.post('/login', authLimiter, async (req, res) => {
  const { email, password, rememberMe = false } = req.body;

  if (!email || !password)
    return res.status(400).json({ error: 'Заполните все поля' });

  // Normalize email
  const normalizedEmail = email.toLowerCase().trim();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail);

  // Always run bcrypt even if user not found — prevents timing attacks
  const dummyHash = '$2a$12$invalidhashfortimingprotection000000000000000000000000';
  const valid = user
    ? await bcrypt.compare(password, user.password)
    : await bcrypt.compare(password, dummyHash).then(() => false);

  if (!user || !valid) {
    if (user) {
      recordFailedLogin(user.id);
      logLoginAttempt(user.id, req.ip, req.headers['user-agent'], parseDeviceInfo(req.headers['user-agent']), false, 'Invalid password');
    }
    logAuthEvent('LOGIN_FAILED', user?.id || 'unknown', { email, ip: req.ip });
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }

  // Check if account is locked
  const lockStatus = isAccountLocked(user.id);
  if (lockStatus.locked) {
    const remainingMin = Math.ceil(lockStatus.remainingMs / 60000);
    return res.status(423).json({ 
      error: `Слишком много неудачных попыток. Попробуйте через ${remainingMin} мин.`,
      code: 'ACCOUNT_LOCKED'
    });
  }

  if (user.is_banned) {
    logAuthEvent('LOGIN_BANNED', user.id, { ip: req.ip });
    return res.status(403).json({ 
      error: `Аккаунт заблокирован. Причина: ${user.ban_reason || 'Нарушение правил'}`,
      code: 'ACCOUNT_BANNED'
    });
  }

  // Clear failed login attempts on successful login
  clearLoginAttempts(user.id);

  // Generate tokens
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  // Save refresh token to database
  const deviceInfo = parseDeviceInfo(req.headers['user-agent']);
  const refreshExpiry = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000; // 30 days or 7 days
  saveRefreshToken(user.id, refreshToken, deviceInfo, req.ip, refreshExpiry);

  // Log successful login
  logLoginAttempt(user.id, req.ip, req.headers['user-agent'], deviceInfo, true);
  logAuthEvent('LOGIN_SUCCESS', user.id, { ip: req.ip, device: deviceInfo });

  // Set HttpOnly cookie for access token
  res.cookie('auth_token', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 15 * 60 * 1000, // 15 minutes
  });

  // Set HttpOnly cookie for refresh token
  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: refreshExpiry,
  });

  res.json({
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      display_name: user.display_name,
      bio: user.bio,
      avatar: user.avatar,
      banner: user.banner,
      accent_color: user.accent_color,
      profile_completed: user.profile_completed,
      role: user.role,
      verified: user.verified,
      created_at: user.created_at,
    },
  });
});

// ── Refresh Token ─────────────────────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  const refreshToken = req.body.refreshToken || req.cookies?.refresh_token;

  if (!refreshToken) {
    return res.status(401).json({ error: 'Refresh token отсутствует' });
  }

  // Verify refresh token
  const decoded = verifyRefreshToken(refreshToken);
  if (!decoded) {
    return res.status(401).json({ error: 'Неверный refresh token' });
  }

  // Check if token exists in database
  const tokenRecord = findRefreshToken(refreshToken);
  if (!tokenRecord) {
    logAuthEvent('REFRESH_TOKEN_NOT_FOUND', decoded.id, { ip: req.ip });
    return res.status(401).json({ error: 'Refresh token не найден или истёк' });
  }

  // Get user
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.id);
  if (!user) {
    return res.status(401).json({ error: 'Пользователь не найден' });
  }

  if (user.is_banned) {
    return res.status(403).json({ error: 'Аккаунт заблокирован' });
  }

  // Generate new access token
  const newAccessToken = generateAccessToken(user);

  logAuthEvent('TOKEN_REFRESHED', user.id, { ip: req.ip });

  // Update cookie
  res.cookie('auth_token', newAccessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 15 * 60 * 1000,
  });

  res.json({
    accessToken: newAccessToken,
  });
});

// ── Logout ────────────────────────────────────────────────────────────────────
router.post('/logout', auth, (req, res) => {
  const refreshToken = req.body.refreshToken || req.cookies?.refresh_token;

  // Revoke access token
  if (req.token) {
    revokeToken(req.token);
  }

  // Delete refresh token from database
  if (refreshToken) {
    deleteRefreshToken(refreshToken);
  }

  // Clear cookies
  res.clearCookie('auth_token');
  res.clearCookie('refresh_token');

  logAuthEvent('LOGOUT', req.userId, { ip: req.ip });

  res.json({ message: 'Выход выполнен' });
});

// ── Logout from all devices ───────────────────────────────────────────────────
router.post('/logout-all', auth, (req, res) => {
  // Delete all refresh tokens for user
  deleteAllUserTokens(req.userId);

  // Revoke current access token
  if (req.token) {
    revokeToken(req.token);
  }

  // Clear user cache
  clearUserCache(req.userId);

  // Clear cookies
  res.clearCookie('auth_token');
  res.clearCookie('refresh_token');

  logAuthEvent('LOGOUT_ALL_DEVICES', req.userId, { ip: req.ip });

  res.json({ message: 'Выход выполнен со всех устройств' });
});

// ── Get active sessions ───────────────────────────────────────────────────────
router.get('/sessions', auth, (req, res) => {
  const sessions = getUserActiveSessions(req.userId);
  res.json({ sessions });
});

// ── Get login history ─────────────────────────────────────────────────────────
router.get('/login-history', auth, (req, res) => {
  const history = getRecentLoginAttempts(req.userId);
  res.json({ history });
});

// ── Verify token (check if still valid) ──────────────────────────────────────
router.get('/verify', auth, (req, res) => {
  res.json({
    valid: true,
    user: {
      id: req.userFull.id,
      username: req.userFull.username,
      email: req.userFull.email,
      role: req.userFull.role,
      roles: req.userRoles,
      verified: req.userFull.verified,
    },
  });
});

module.exports = { router };
