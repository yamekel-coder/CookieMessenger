const jwt = require('jsonwebtoken');
const db = require('../db');

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

/**
 * Standard auth middleware — verifies JWT and checks if user is banned.
 * NOTE: No issuer check — supports both old and new tokens.
 */
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Нет токена' });

  try {
    // No issuer option — accepts tokens issued before security update
    req.user = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError')
      return res.status(401).json({ error: 'Токен истёк, войдите снова' });
    return res.status(401).json({ error: 'Неверный токен' });
  }

  // Check if user is banned on every request
  const user = db.prepare('SELECT is_banned, ban_reason FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(401).json({ error: 'Пользователь не найден' });
  if (user.is_banned)
    return res.status(403).json({ error: `Аккаунт заблокирован: ${user.ban_reason || 'Нарушение правил'}` });

  next();
}

module.exports = auth;
