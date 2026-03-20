const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { authLimiter, validateRegistration, noLargePayload } = require('../middleware/security');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';

// Регистрация — rate limit + validation
router.post('/register', authLimiter, noLargePayload, validateRegistration, async (req, res) => {
  const { username, email, password } = req.body;

  try {
    // bcrypt cost 12 — stronger than default 10
    const hashed = await bcrypt.hash(password, 12);
    const stmt = db.prepare('INSERT INTO users (username, email, password) VALUES (?, ?, ?)');
    stmt.run(username, email.toLowerCase().trim(), hashed);
    res.json({ message: 'Регистрация успешна' });
  } catch (err) {
    if (err.message.includes('UNIQUE'))
      return res.status(409).json({ error: 'Пользователь уже существует' });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Вход — rate limit (10 попыток / 15 мин)
router.post('/login', authLimiter, noLargePayload, async (req, res) => {
  const { email, password } = req.body;

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

  if (!user || !valid)
    return res.status(401).json({ error: 'Неверный email или пароль' });

  if (user.is_banned)
    return res.status(403).json({ error: `Аккаунт заблокирован. Причина: ${user.ban_reason || 'Нарушение правил'}` });

  const token = jwt.sign(
    { id: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: '7d', issuer: 'cookiemessenger' }
  );

  res.json({
    token,
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
      created_at: user.created_at,
    },
  });
});

module.exports = router;
