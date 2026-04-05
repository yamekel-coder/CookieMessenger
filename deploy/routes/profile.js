const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const { validateLengths } = require('../middleware/security');

const router = express.Router();

// GET /api/profile/me
router.get('/me', auth, (req, res) => {
  const user = db.prepare('SELECT id, username, email, display_name, bio, avatar, banner, accent_color, animated_name, profile_music, profile_completed, created_at, discord_verified FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  res.json(user);
});

// PUT /api/profile/update
router.put('/update', auth, validateLengths({ display_name: 50, bio: 300, accent_color: 20 }), (req, res) => {
  const { display_name, bio, avatar, banner, accent_color } = req.body;
  
  // Validate base64 image sizes (10MB limit)
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB in bytes
  
  if (avatar && avatar.startsWith('data:image/')) {
    const base64Size = Math.ceil((avatar.length * 3) / 4);
    if (base64Size > MAX_SIZE) {
      return res.status(400).json({ error: 'Аватар слишком большой. Максимум 10MB' });
    }
  }
  
  if (banner && banner.startsWith('data:image/')) {
    const base64Size = Math.ceil((banner.length * 3) / 4);
    if (base64Size > MAX_SIZE) {
      return res.status(400).json({ error: 'Баннер слишком большой. Максимум 10MB' });
    }
  }
  
  db.prepare(`
    UPDATE users SET
      display_name = ?,
      bio = ?,
      avatar = ?,
      banner = ?,
      accent_color = ?,
      profile_completed = 1
    WHERE id = ?
  `).run(display_name || null, bio || null, avatar || null, banner || null, accent_color || '#ffffff', req.user.id);

  const updated = db.prepare('SELECT id, username, email, display_name, bio, avatar, banner, accent_color, profile_completed FROM users WHERE id = ?').get(req.user.id);
  res.json(updated);
});

module.exports = router;

// PUT /api/profile/vip — update VIP features (animated name, profile music)
router.put('/vip', auth, validateLengths({ animated_name: 500, profile_music: 500 }), (req, res) => {
  const { animated_name, profile_music } = req.body;
  
  // Check if user has VIP permission
  const { getUserPermissions } = require('./roles');
  const perms = getUserPermissions(req.user.id);
  
  if (!perms.includes('animated_name') && !perms.includes('profile_music')) {
    return res.status(403).json({ error: 'Нужна VIP роль для этих функций' });
  }
  
  // Validate animated_name is valid CSS gradient
  if (animated_name && !animated_name.match(/^(linear|radial)-gradient\(/)) {
    return res.status(400).json({ error: 'Неверный формат градиента' });
  }
  
  // Validate profile_music is valid URL
  if (profile_music && !profile_music.match(/^https?:\/\/.+/)) {
    return res.status(400).json({ error: 'Неверный URL музыки' });
  }
  
  db.prepare(`
    UPDATE users SET
      animated_name = ?,
      profile_music = ?
    WHERE id = ?
  `).run(
    perms.includes('animated_name') ? (animated_name || null) : null,
    perms.includes('profile_music') ? (profile_music || null) : null,
    req.user.id
  );

  const updated = db.prepare('SELECT animated_name, profile_music FROM users WHERE id = ?').get(req.user.id);
  res.json(updated);
});
