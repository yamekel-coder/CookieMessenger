const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const { validateLengths } = require('../middleware/security');

const router = express.Router();

// GET /api/profile/me
router.get('/me', auth, (req, res) => {
  const user = db.prepare('SELECT id, username, email, display_name, bio, avatar, banner, accent_color, profile_completed FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
  res.json(user);
});

// PUT /api/profile/update
router.put('/update', auth, validateLengths({ display_name: 50, bio: 300, accent_color: 20 }), (req, res) => {
  const { display_name, bio, avatar, banner, accent_color } = req.body;
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
