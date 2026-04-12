/**
 * Token management utilities for refresh tokens and session management
 */

const db = require('../db');

// ── Create refresh_tokens table ──────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    device_info TEXT,
    ip_address TEXT,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_used_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
  CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
  CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);
`);

// ── Create login_history table ───────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS login_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    device_info TEXT,
    success INTEGER NOT NULL DEFAULT 1,
    failure_reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_login_history_user ON login_history(user_id, created_at DESC);
`);

// ── Prepared statements ───────────────────────────────────────────────────────
const saveRefreshTokenStmt = db.prepare(`
  INSERT INTO refresh_tokens (user_id, token, device_info, ip_address, expires_at)
  VALUES (?, ?, ?, ?, ?)
`);

const findRefreshTokenStmt = db.prepare(`
  SELECT * FROM refresh_tokens 
  WHERE token = ? AND expires_at > datetime('now')
`);

const updateTokenUsageStmt = db.prepare(`
  UPDATE refresh_tokens 
  SET last_used_at = datetime('now')
  WHERE token = ?
`);

const deleteRefreshTokenStmt = db.prepare(`
  DELETE FROM refresh_tokens WHERE token = ?
`);

const deleteUserTokensStmt = db.prepare(`
  DELETE FROM refresh_tokens WHERE user_id = ?
`);

const deleteExpiredTokensStmt = db.prepare(`
  DELETE FROM refresh_tokens WHERE expires_at < datetime('now')
`);

const getUserActiveSessionsStmt = db.prepare(`
  SELECT id, device_info, ip_address, created_at, last_used_at
  FROM refresh_tokens
  WHERE user_id = ? AND expires_at > datetime('now')
  ORDER BY last_used_at DESC
`);

const logLoginAttemptStmt = db.prepare(`
  INSERT INTO login_history (user_id, ip_address, user_agent, device_info, success, failure_reason)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const getRecentLoginAttemptsStmt = db.prepare(`
  SELECT * FROM login_history
  WHERE user_id = ? AND created_at > datetime('now', '-1 hour')
  ORDER BY created_at DESC
  LIMIT 10
`);

// ── Token management functions ────────────────────────────────────────────────

/**
 * Save refresh token to database
 */
function saveRefreshToken(userId, token, deviceInfo, ipAddress, expiresInMs) {
  const expiresAt = new Date(Date.now() + expiresInMs).toISOString();
  saveRefreshTokenStmt.run(userId, token, deviceInfo, ipAddress, expiresAt);
}

/**
 * Find and validate refresh token
 */
function findRefreshToken(token) {
  const result = findRefreshTokenStmt.get(token);
  if (result) {
    updateTokenUsageStmt.run(token);
  }
  return result;
}

/**
 * Delete specific refresh token (logout)
 */
function deleteRefreshToken(token) {
  deleteRefreshTokenStmt.run(token);
}

/**
 * Delete all user tokens (logout from all devices)
 */
function deleteAllUserTokens(userId) {
  deleteUserTokensStmt.run(userId);
}

/**
 * Get user's active sessions
 */
function getUserActiveSessions(userId) {
  return getUserActiveSessionsStmt.all(userId);
}

/**
 * Delete expired tokens (cleanup job)
 */
function cleanupExpiredTokens() {
  const result = deleteExpiredTokensStmt.run();
  if (result.changes > 0) {
    console.log(`[TOKEN_CLEANUP] Removed ${result.changes} expired tokens`);
  }
  return result.changes;
}

/**
 * Log login attempt
 */
function logLoginAttempt(userId, ipAddress, userAgent, deviceInfo, success, failureReason = null) {
  logLoginAttemptStmt.run(
    userId,
    ipAddress,
    userAgent,
    deviceInfo,
    success ? 1 : 0,
    failureReason
  );
}

/**
 * Get recent login attempts for user
 */
function getRecentLoginAttempts(userId) {
  return getRecentLoginAttemptsStmt.all(userId);
}

/**
 * Extract device info from user agent
 */
function parseDeviceInfo(userAgent) {
  if (!userAgent) return 'Unknown Device';
  
  // Simple device detection
  if (/mobile/i.test(userAgent)) {
    if (/iPhone/i.test(userAgent)) return 'iPhone';
    if (/iPad/i.test(userAgent)) return 'iPad';
    if (/Android/i.test(userAgent)) return 'Android';
    return 'Mobile Device';
  }
  
  if (/Windows/i.test(userAgent)) return 'Windows PC';
  if (/Mac/i.test(userAgent)) return 'Mac';
  if (/Linux/i.test(userAgent)) return 'Linux';
  
  return 'Desktop';
}

// ── Cleanup job: run every hour ───────────────────────────────────────────────
setInterval(cleanupExpiredTokens, 60 * 60 * 1000);

module.exports = {
  saveRefreshToken,
  findRefreshToken,
  deleteRefreshToken,
  deleteAllUserTokens,
  getUserActiveSessions,
  cleanupExpiredTokens,
  logLoginAttempt,
  getRecentLoginAttempts,
  parseDeviceInfo,
};
