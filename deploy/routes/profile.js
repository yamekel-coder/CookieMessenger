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
  
  const MAX_SIZE = 10 * 1024 * 1024;
  if (avatar && avatar.startsWith('data:image/')) {
    if (Math.ceil((avatar.length * 3) / 4) > MAX_SIZE)
      return res.status(400).json({ error: 'Аватар слишком большой. Максимум 10MB' });
  }
  if (banner && banner.startsWith('data:image/')) {
    if (Math.ceil((banner.length * 3) / 4) > MAX_SIZE)
      return res.status(400).json({ error: 'Баннер слишком большой. Максимум 10MB' });
  }
  
  db.prepare(`
    UPDATE users SET display_name = ?, bio = ?, avatar = ?, banner = ?, accent_color = ?, profile_completed = 1
    WHERE id = ?
  `).run(display_name || null, bio || null, avatar || null, banner || null, accent_color || '#ffffff', req.user.id);

  const updated = db.prepare('SELECT id, username, email, display_name, bio, avatar, banner, accent_color, profile_completed FROM users WHERE id = ?').get(req.user.id);
  res.json(updated);
});

// PUT /api/profile/vip — update VIP features (animated name, profile music as base64)
router.put('/vip', auth, (req, res) => {
  const { animated_name, profile_music } = req.body;

  // Check VIP permission
  const { getUserPermissions } = require('./roles');
  const perms = getUserPermissions(req.user.id);

  if (!perms.includes('animated_name') && !perms.includes('profile_music')) {
    return res.status(403).json({ error: 'Нужна VIP роль для этих функций' });
  }

  // Validate gradient
  if (animated_name !== undefined && animated_name !== null && animated_name !== '') {
    if (!animated_name.match(/^(linear|radial)-gradient\(/)) {
      return res.status(400).json({ error: 'Неверный формат градиента. Пример: linear-gradient(90deg, #ff0080, #7928ca)' });
    }
    if (animated_name.length > 300) {
      return res.status(400).json({ error: 'Градиент слишком длинный' });
    }
  }

  // Validate music — base64 data URI or empty
  if (profile_music !== undefined && profile_music !== null && profile_music !== '') {
    if (!profile_music.startsWith('data:audio/')) {
      return res.status(400).json({ error: 'Неверный формат аудио' });
    }
    // 15MB limit
    const MAX_AUDIO = 15 * 1024 * 1024;
    if (Math.ceil((profile_music.length * 3) / 4) > MAX_AUDIO) {
      return res.status(400).json({ error: 'Файл слишком большой. Максимум 15MB' });
    }
  }

  const newAnimated = perms.includes('animated_name') ? (animated_name || null) : undefined;
  const newMusic = perms.includes('profile_music') ? (profile_music || null) : undefined;

  // Build update query dynamically
  const fields = [];
  const values = [];
  if (newAnimated !== undefined) { fields.push('animated_name = ?'); values.push(newAnimated); }
  if (newMusic !== undefined) { fields.push('profile_music = ?'); values.push(newMusic); }

  if (fields.length > 0) {
    values.push(req.user.id);
    db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  const updated = db.prepare('SELECT animated_name, profile_music FROM users WHERE id = ?').get(req.user.id);
  res.json(updated);
});

module.exports = router;
